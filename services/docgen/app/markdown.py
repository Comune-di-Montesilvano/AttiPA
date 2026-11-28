"""Normalizzazione del Markdown importato: titoli di parti, capi, sezioni e articoli.

Livelli: `#` titolo del documento, `##` Parte/Libro/Titolo/Capo, `###` Sezione e altri titoli,
`####` articolo (come il Markdown delle leggi da Normattiva). Riconosce le righe anche quando
il documento le ha in grassetto e non come stili di titolo.
"""
import re

SUFFIXES = 'bis|ter|quater|quinquies|sexies|septies|octies|novies|decies'
SEP = r'\s*[.:–—-]?\s*'
ARTICLE_RE = re.compile(
    r'^(?:art\.|articolo)\s*(\d+)(?:\s*[-‐–]?\s*(' + SUFFIXES + r'))?\b' + SEP + r'(.*)$', re.I)
PART_RE = re.compile(r'^(parte|libro|titolo|capo)\s+([IVXLCDM]+|\d+)\b' + SEP + r'(.*)$', re.I)
SECTION_RE = re.compile(r'^(sezione)\s+([IVXLCDM]+|\d+)\b' + SEP + r'(.*)$', re.I)
MD_HEADING_RE = re.compile(r'^#{1,6}\s+(.*)$')
IMAGE_RE = re.compile(r'!\[[^\]]*\]\([^)]*\)')
ITEM_RE = re.compile(r'^(\d+\.|[a-z]\))\s')

MAX_LINE = 200
MAX_TITLE_LINE = 120


def plain(line):
    """Riga senza marcatori di titolo e di grassetto, per il riconoscimento."""
    s = re.sub(r'^#+\s*', '', line.strip())
    return re.sub(r'\*\*|__', '', s).strip()


def _title_ok(title):
    # «Art. 5 del presente regolamento…» a inizio riga è testo, non titolo: i titoli iniziano
    # con maiuscola, cifra o virgolette.
    return not title or not title[0].isalpha() or title[0].isupper()


def _match(line):
    """(livello, etichetta, titolo) se la riga è strutturale, altrimenti None."""
    s = plain(line)
    if not s or len(s) > MAX_LINE:
        return None
    m = ARTICLE_RE.match(s)
    if m:
        num = m.group(1) + ('-' + m.group(2).lower() if m.group(2) else '')
        title = m.group(3).strip()
        return (4, 'Art. ' + num, title) if _title_ok(title) else None
    for rx, level in ((PART_RE, 2), (SECTION_RE, 3)):
        m = rx.match(s)
        if m:
            num = m.group(2).upper() if not m.group(2).isdigit() else m.group(2)
            title = m.group(3).strip()
            return (level, m.group(1).capitalize() + ' ' + num, title) if _title_ok(title) else None
    return None


def is_structural(line):
    return _match(line) is not None


def _next_title(lines, i):
    """Indice e testo della riga successiva se è il titolo dell'articolo/capo, altrimenti None."""
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j >= len(lines):
        return None
    s = plain(lines[j])
    if (not s or len(s) > MAX_TITLE_LINE or s.endswith(('.', ';')) or ITEM_RE.match(s)
            or _match(lines[j]) or MD_HEADING_RE.match(lines[j].strip())):
        return None
    return j, s


def normalize(md):
    lines = [IMAGE_RE.sub('', line).rstrip() for line in md.replace('\r\n', '\n').split('\n')]
    out = []
    seen_title = seen_structure = False
    articles = 0
    i = 0

    def heading(text):
        out.extend(['', text, ''])

    while i < len(lines):
        line = lines[i]
        m = _match(line)
        if m:
            level, label, title = m
            if not title:
                nxt = _next_title(lines, i)
                if nxt:
                    i, title = nxt
            heading('#' * level + ' ' + label + (' – ' + title if title else ''))
            seen_structure = True
            articles += level == 4
        elif MD_HEADING_RE.match(line.strip()):
            text = plain(line)
            if not seen_title and not seen_structure:
                heading('# ' + text)
                seen_title = True
            else:
                heading('### ' + text)
        else:
            out.append(line)
        i += 1

    text = re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip() + '\n'
    warnings = [] if articles else ['nessun articolo riconosciuto']
    return text, warnings
