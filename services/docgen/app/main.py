"""Generazione documenti: conversione con LibreOffice headless (RTF/DOCX/ODT → PDF, DOCX, ODT).

Servizio interno, nessuna porta sull'host. Ogni conversione in una cartella temporanea
propria, con profilo LibreOffice separato (due soffice sullo stesso profilo si bloccano).
"""
import os
import subprocess
import tempfile

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import Response

app = FastAPI(title='docgen', docs_url=None, redoc_url=None, openapi_url=None)

SOFFICE = os.environ.get('SOFFICE', 'soffice')
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


@app.post('/convert')
async def convert(file: UploadFile, target: str = 'pdf'):
    if target not in OUTPUTS:
        raise HTTPException(status_code=400, detail='formato di destinazione non ammesso')
    ext = os.path.splitext(file.filename or '')[1].lower()
    if ext not in INPUTS:
        raise HTTPException(status_code=400, detail='formato di origine non ammesso')
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail='file troppo grande')
    with tempfile.TemporaryDirectory() as work:
        # Nome fisso: il nome caricato non entra mai nella riga di comando.
        src = os.path.join(work, 'documento' + ext)
        if target == ext[1:]:
            raise HTTPException(status_code=400, detail='origine e destinazione coincidono')
        with open(src, 'wb') as f:
            f.write(data)
        try:
            out = convert_file(src, target, work)
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        with open(out, 'rb') as f:
            body = f.read()
    return Response(content=body, media_type=OUTPUTS[target])
