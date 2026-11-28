"""Generazione documenti: conversione con LibreOffice headless (RTF/DOCX/ODT → PDF, DOCX, ODT)
e import in Markdown (POST /markdown: pandoc, pypdfium2, titoli di capi e articoli).

Servizio interno, nessuna porta sull'host. Ogni conversione in una cartella temporanea
propria, con profilo LibreOffice separato (due soffice sullo stesso profilo si bloccano).
"""
import os
import subprocess
import tempfile

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import Response
import pypdfium2 as pdfium

from app.markdown import normalize
from app.pdf import pdf_markdown, pdf_pages

app = FastAPI(title='docgen', docs_url=None, redoc_url=None, openapi_url=None)

SOFFICE = os.environ.get('SOFFICE', 'soffice')
PANDOC = os.environ.get('PANDOC', 'pandoc')
PANDOC_FORMATS = {'.docx': 'docx', '.odt': 'odt', '.html': 'html', '.htm': 'html'}
MARKDOWN_INPUTS = set(PANDOC_FORMATS) | {'.rtf', '.doc', '.pdf'}
# Titolo di Word (stile Titolo) dai metadati del DOCX/ODT, perso senza template.
TITLE_TEMPLATE = os.path.join(os.path.dirname(__file__), 'title.gfm')
TIMEOUT = int(os.environ.get('DOCGEN_TIMEOUT', '120'))
MAX_BYTES = 20 * 1024 * 1024
INPUTS = {'.rtf', '.docx', '.doc', '.odt'}
OUTPUTS = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'odt': 'application/vnd.oasis.opendocument.text',
}


@app.get('/health')
def health():
    return {'status': 'ok'}


def convert_file(src, target, workdir):
    """Converte src in target dentro workdir e restituisce il percorso del risultato."""
    profile = 'file://' + os.path.join(workdir, 'profile')
    res = subprocess.run(
        [SOFFICE, '--headless', '--norestore', '-env:UserInstallation=' + profile,
         '--convert-to', target, '--outdir', workdir, src],
        capture_output=True, timeout=TIMEOUT,
    )
    out = os.path.splitext(src)[0] + '.' + target
    if res.returncode != 0 or not os.path.exists(out):
        raise RuntimeError(res.stderr.decode('utf-8', errors='replace').strip()[:300] or 'conversione non riuscita')
    return out


async def read_upload(file, allowed):
    """Estensione e contenuto del file caricato, con controllo di formato e dimensione."""
    uploaded = os.path.splitext(file.filename or '')[1].lower()
    # Estensione presa dalla whitelist, non dal nome caricato: nei percorsi entrano solo costanti.
    ext = next((e for e in sorted(allowed) if e == uploaded), None)
    if ext is None:
        raise HTTPException(status_code=400, detail='formato di origine non ammesso')
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail='file troppo grande')
    return ext, data


def save(work, ext, data):
    # Nome fisso: il nome caricato non entra mai nella riga di comando.
    src = os.path.join(work, 'documento' + ext)
    with open(src, 'wb') as f:
        f.write(data)
    return src


def pandoc_to_markdown(src, fmt, workdir):
    out = os.path.join(workdir, 'documento.md')
    # --sandbox: nessun accesso a rete o file oltre all'input (un <iframe src> di un HTML
    # caricato verrebbe scaricato e copiato nel testo). gfm-raw_html: niente HTML grezzo
    # (immagini con attributi, script, tabelle complesse) nel Markdown.
    cmd = [PANDOC, '--sandbox', '--from', fmt, '--to', 'gfm-raw_html', '--wrap=none', '-o', out]
    if fmt in ('docx', 'odt'):
        cmd += ['--standalone', '--template', TITLE_TEMPLATE]
    res = subprocess.run(
        cmd + [src],
        capture_output=True, timeout=TIMEOUT,
    )
    if res.returncode != 0 or not os.path.exists(out):
        raise RuntimeError(res.stderr.decode('utf-8', errors='replace').strip()[:300] or 'conversione non riuscita')
    with open(out, encoding='utf-8') as f:
        return f.read()


def to_markdown(src, ext, workdir):
    """Markdown grezzo del documento e avvisi."""
    if ext == '.pdf':
        return pdf_markdown(pdf_pages(src))
    if ext in ('.rtf', '.doc'):
        src, ext = convert_file(src, 'docx', workdir), '.docx'
    return pandoc_to_markdown(src, PANDOC_FORMATS[ext], workdir), []


@app.post('/markdown')
async def markdown(file: UploadFile):
    ext, data = await read_upload(file, MARKDOWN_INPUTS)
    with tempfile.TemporaryDirectory() as work:
        src = save(work, ext, data)
        try:
            raw, warnings = to_markdown(src, ext, work)
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        except pdfium.PdfiumError as e:
            raise HTTPException(status_code=422, detail='PDF non leggibile') from e
    md, more = normalize(raw)
    return {'markdown': md, 'warnings': warnings + more}


@app.post('/convert')
async def convert(file: UploadFile, target: str = 'pdf'):
    # Formato preso dalla whitelist, non dal parametro: nei percorsi entrano solo costanti.
    target = next((t for t in sorted(OUTPUTS) if t == target), None)
    if target is None:
        raise HTTPException(status_code=400, detail='formato di destinazione non ammesso')
    ext, data = await read_upload(file, INPUTS)
    if target == ext[1:]:
        raise HTTPException(status_code=400, detail='origine e destinazione coincidono')
    with tempfile.TemporaryDirectory() as work:
        src = save(work, ext, data)
        try:
            out = convert_file(src, target, work)
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        with open(out, 'rb') as f:
            body = f.read()
    return Response(content=body, media_type=OUTPUTS[target])
