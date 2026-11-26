"""Query in sola lettura sul DB Tinn ripristinato (Firebird embedded).

Le query sono solo quelle in queries/*.sql (nessun SQL libero dalla rete).
I segnaposto {NOME} diventano parametri posizionali del driver, mai testo
concatenato: '{NOME}' tra apici è una stringa, {NOME} senza apici un numero.
"""
import json
import os
import re
from datetime import date, datetime
from decimal import Decimal

from app.config import DB_PATH, STATE_PATH

QUERIES_DIR = os.environ.get('TINN_QUERIES_DIR', os.path.join(os.path.dirname(os.path.dirname(__file__)), 'queries'))
FB_CLIENT = os.environ.get('FB_CLIENT_LIBRARY', '/opt/firebird/lib/libfbclient.so')

PLACEHOLDER = re.compile(r"'\{([A-Z_][A-Z0-9_]*)\}'|\{([A-Z_][A-Z0-9_]*)\}")
NAME = re.compile(r'^[a-z0-9_]+$')
NUMBER = re.compile(r'^-?\d+(\.\d+)?$')
MAX_TEXT = 200


class QueryError(ValueError):
    pass


class DbMissing(RuntimeError):
    pass


def read_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def query_path(name):
    if not NAME.match(name):
        raise QueryError('nome di query non valido')
    path = os.path.join(QUERIES_DIR, name + '.sql')
    if not os.path.isfile(path):
        raise QueryError('query sconosciuta: %s' % name)
    return path


def list_queries():
    """Nome, descrizione (commento in testa) e parametri di ogni query."""
    out = []
    for fname in sorted(os.listdir(QUERIES_DIR)):
        if not fname.endswith('.sql'):
            continue
        with open(os.path.join(QUERIES_DIR, fname), encoding='utf-8') as f:
            text = f.read()
        comment = [line[2:].strip() for line in text.splitlines() if line.startswith('--')]
        params = []
        for quoted, bare in PLACEHOLDER.findall(text):
            name = quoted or bare
            if name not in [p['name'] for p in params]:
                params.append({'name': name, 'type': 'string' if quoted else 'number'})
        out.append({'name': fname[:-4], 'description': '\n'.join(comment), 'params': params})
    return out


def bind(sql, params):
    """Sostituisce i segnaposto con ? e restituisce (sql, valori nell'ordine)."""
    values = []

    def repl(m):
        quoted, bare = m.group(1), m.group(2)
        name = quoted or bare
        if name not in params:
            raise QueryError('parametro mancante: %s' % name)
        value = str(params[name]).strip()
        if bare:
            if not NUMBER.match(value):
                raise QueryError('%s deve essere un numero' % name)
            value = Decimal(value) if '.' in value else int(value)
        elif len(value) > MAX_TEXT:
            raise QueryError('%s troppo lungo' % name)
        values.append(value)
        return '?'

    return PLACEHOLDER.sub(repl, sql), values


def strip_comments(sql):
    return '\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--')).strip().rstrip(';')


def to_json(v):
    """Charset NONE con byte WIN1252; double del dialect 1 arrotondati al centesimo."""
    if isinstance(v, bytes):
        return v.decode('cp1252', errors='replace').rstrip()
    if isinstance(v, str):
        return v.rstrip()
    if isinstance(v, float):
        return float(Decimal(repr(v)).quantize(Decimal('0.01')))
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


def run(name, params, limit=1000):
    with open(query_path(name), encoding='utf-8') as f:
        sql, values = bind(strip_comments(f.read()), params)
    if not os.path.exists(DB_PATH):
        raise DbMissing('DB Tinn non ancora ripristinato')

    from firebird.driver import DatabaseError, Isolation, TraAccessMode, connect, driver_config, tpb

    driver_config.fb_client_library.value = FB_CLIENT
    with connect(DB_PATH, user='SYSDBA', charset='WIN1252') as con:
        tr = con.transaction_manager(tpb(Isolation.SNAPSHOT, access_mode=TraAccessMode.READ))
        tr.begin()
        try:
            cur = tr.cursor()
            try:
                cur.execute(sql, values)
            except DatabaseError as e:
                # Parametro più lungo della colonna confrontata: errore dell'input, non del DB.
                if 'string right truncation' in str(e):
                    raise QueryError('valore di un parametro più lungo del campo') from e
                raise
            columns = [d[0] for d in cur.description]
            rows = [[to_json(v) for v in row] for row in cur.fetchmany(limit + 1)]
        finally:
            tr.rollback()
    return {'columns': columns, 'rows': rows[:limit], 'truncated': len(rows) > limit}
