"""Testo dai PDF (pypdfium2, Apache/BSD): righe di testata e piè tolte, paragrafi ricuciti."""
import math
import re

import pypdfium2 as pdfium

from app.markdown import ITEM_RE, is_structural

PAGE_NUMBER_RE = re.compile(r'^\s*(pag\.?\s*)?\d+(\s*(/|di)\s*\d+)?\s*$', re.I)
EDGE_LINES = 3
MIN_PAGES_RUNNING = 3


def pdf_pages(path):
    """Testo di ogni pagina, righe separate da \\n."""
    pdf = pdfium.PdfDocument(path)
    try:
        pages = []
        for page in pdf:
            textpage = page.get_textpage()
            pages.append(textpage.get_text_range().replace('\r\n', '\n').replace('\r', '\n'))
            textpage.close()
            page.close()
        return pages
    finally:
        pdf.close()


def _key(line):
    return re.sub(r'\d+', '#', line.strip().lower())


def _edges(lines):
    return set(range(min(EDGE_LINES, len(lines)))) | set(range(max(0, len(lines) - EDGE_LINES), len(lines)))


def _running_keys(pages):
    """Righe ai bordi della pagina ripetute in almeno metà delle pagine (testata, piè)."""
    if len(pages) < MIN_PAGES_RUNNING:
        return set()
    counts = {}
    for lines in pages:
        keys = {_key(lines[i]) for i in _edges(lines) if not is_structural(lines[i])}
        for k in keys:
            counts[k] = counts.get(k, 0) + 1
    need = max(MIN_PAGES_RUNNING, math.ceil(len(pages) / 2))
    return {k for k, n in counts.items() if n >= need}


def pages_to_text(pages):
    pages = [[line.strip() for line in p.split('\n') if line.strip()] for p in pages]
    running = _running_keys(pages)
    lines = []
    for p in pages:
        edges = _edges(p)
        lines.extend(line for i, line in enumerate(p)
                     if not PAGE_NUMBER_RE.match(line) and not (i in edges and _key(line) in running))

    paragraphs = []
    for line in lines:
        prev = paragraphs[-1] if paragraphs else None
        starts_block = is_structural(line) or ITEM_RE.match(line)
        if prev is None or starts_block or is_structural(prev) or not line[0].islower():
            paragraphs.append(line)
        elif prev.endswith('-'):
            paragraphs[-1] = prev[:-1] + line
        elif not prev.endswith(('.', ':', ';', '!', '?')):
            paragraphs[-1] = prev + ' ' + line
        else:
            paragraphs.append(line)
    return '\n\n'.join(paragraphs)
