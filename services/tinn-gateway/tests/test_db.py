import pytest

from app import db


def test_bind_numeri_e_stringhe():
    sql, values = db.bind(
        "SELECT * FROM T WHERE ANNO = {ANNO} AND A = {ANNO} AND D LIKE '{SETTORE}'",
        {'ANNO': '2026', 'SETTORE': "01'; DROP TABLE T; --"},
    )
    assert sql == 'SELECT * FROM T WHERE ANNO = ? AND A = ? AND D LIKE ?'
    # La stringa resta un valore del driver: nessun apice entra nel testo SQL.
    assert values == [2026, 2026, "01'; DROP TABLE T; --"]


def test_bind_rifiuta_numero_non_numerico_e_parametro_mancante():
    with pytest.raises(db.QueryError):
        db.bind('SELECT {ANNO}', {'ANNO': '2026 OR 1=1'})
    with pytest.raises(db.QueryError):
        db.bind('SELECT {ANNO}', {})


def test_nome_query_non_valido():
    for name in ['../etc/passwd', 'Storia', 'a b', 'inesistente']:
        with pytest.raises(db.QueryError):
            db.query_path(name)


def test_elenco_query_con_parametri():
    queries = {q['name']: q for q in db.list_queries()}
    assert 'disponibilita_capitoli' in queries
    params = {p['name']: p['type'] for p in queries['disponibilita_capitoli']['params']}
    assert params == {'ANNO': 'number', 'TITOLO': 'string', 'SETTORE': 'string', 'MINIMO': 'number'}


def test_query_pronte_tutte_vincolabili():
    """Ogni query in queries/ si traduce in SQL con soli parametri posizionali."""
    for q in db.list_queries():
        params = {p['name']: ('1' if p['type'] == 'number' else '%') for p in q['params']}
        with open(db.query_path(q['name']), encoding='utf-8') as f:
            sql, _ = db.bind(db.strip_comments(f.read()), params)
        assert '{' not in sql, q['name']


def test_to_json():
    assert db.to_json(75.65000000000001) == 75.65
    assert db.to_json(b'CAFF\xc8   ') == 'CAFFÈ'
    assert db.to_json('ABC   ') == 'ABC'
