"""Testo dai PDF (pypdfium2, Apache/BSD): righe di testata e piè tolte, paragrafi ricuciti."""
import math
import re

import pypdfium2 as pdfium

from app.markdown import ITEM_RE, is_structural

PAGE_NUMBER_RE = re.compile(r'^\s*(pag\.?\s*)?\d+(\s*(/|di)\s*\d+)?\s*$', re.I)
EDGE_LINES = 3
MIN_PAGES_RUNNING = 3
# Sotto questa soglia (caratteri non spazio, dopo aver tolto testate e timbri ripetuti) il PDF
# è una scansione: anche un timbro «firmato digitalmente» su ogni pagina non è testo.
MIN_PDF_CHARS = 50
NO_TEXT = 'PDF senza testo (scansione?)'
# Paragrafo ancora candidato a titolo dell'articolo (riga dopo «Art. 3»).
MAX_TITLE = 120


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
        # Numeri di pagina e testate solo ai bordi: un numero in mezzo è dato (tabelle).
        lines.extend(line for i, line in enumerate(p)
                     if not (i in edges and (PAGE_NUMBER_RE.match(line) or _key(line) in running)))

    paragraphs = []
    title_slot = False  # ultimo paragrafo = riga subito dopo un articolo/capo (forse il titolo)
    for line in lines:
        prev = paragraphs[-1] if paragraphs else None
        if prev is None or is_structural(line) or ITEM_RE.match(line) or is_structural(prev):
            title_slot = prev is not None and is_structural(prev) and not is_structural(line) \
                and not ITEM_RE.match(line)
            paragraphs.append(line)
        elif title_slot and not line[0].islower():
            # «Art. 3» / «Oggetto» / «Il presente…»: il titolo non assorbe il testo.
            title_slot = False
            paragraphs.append(line)
        elif prev.endswith('-') and line[0].islower():
            paragraphs[-1] = prev[:-1] + line
        elif not prev.endswith(('.', ':', ';', '!', '?')):
            paragraphs[-1] = prev + ' ' + line
        else:
            title_slot = False
            paragraphs.append(line)
        if title_slot and len(paragraphs[-1]) > MAX_TITLE:
            title_slot = False
    return '\n\n'.join(paragraphs)


def pdf_markdown(pages):
    """Testo del PDF e avvisi; RuntimeError(NO_TEXT) se non c'è testo vero (scansione)."""
    text = pages_to_text(pages)
    if len(''.join(text.split())) < MIN_PDF_CHARS:
        raise RuntimeError(NO_TEXT)
    empty = sum(1 for p in pages if not p.strip())
    return text, ['%d pagine senza testo' % empty] if empty else []
