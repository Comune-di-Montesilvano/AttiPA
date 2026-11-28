import pytest
from fastapi.testclient import TestClient

from app.main import app, convert_file

client = TestClient(app)

RTF_REG = (rb'{\rtf1\ansi\deff0 {\fonttbl {\f0 Liberation Serif;}} \f0 '
           rb'{\b Art. 1 - Oggetto}\par 1. Il presente regolamento disciplina gli incentivi.\par '
           rb'{\b Art. 2 - Fondo}\par 1. Il fondo \u232? pari al 2 per cento.\par}')


def _da_rtf(tmp_path, rtf, target):
    src = tmp_path / 'documento.rtf'
    src.write_bytes(rtf)
    with open(convert_file(str(src), target, str(tmp_path)), 'rb') as f:
        return f.read()


def test_rtf_in_markdown():
    r = client.post('/markdown', files={'file': ('reg.rtf', RTF_REG)})
    assert r.status_code == 200, r.text
    md = r.json()['markdown']
    assert '#### Art. 1 – Oggetto' in md and '#### Art. 2 – Fondo' in md
    assert 'è pari al 2 per cento' in md
    assert r.json()['warnings'] == []


@pytest.mark.parametrize('target', ['docx', 'pdf'])
def test_docx_e_pdf(tmp_path, target):
    r = client.post('/markdown', files={'file': ('reg.' + target, _da_rtf(tmp_path, RTF_REG, target))})
    assert r.status_code == 200, r.text
    assert '#### Art. 2 – Fondo' in r.json()['markdown']


def test_html():
    html = b'<h1>Regolamento</h1><p><b>Art. 1</b></p><p>Oggetto</p><p>1. Testo.</p>'
    r = client.post('/markdown', files={'file': ('a.html', html)})
    assert r.status_code == 200, r.text
    assert r.json()['markdown'].startswith('# Regolamento\n')
    assert '#### Art. 1 – Oggetto' in r.json()['markdown']


def test_pdf_senza_testo(tmp_path):
    pdf = _da_rtf(tmp_path, rb'{\rtf1\ansi \par}', 'pdf')
    r = client.post('/markdown', files={'file': ('vuoto.pdf', pdf)})
    assert r.status_code == 422 and r.json()['detail'] == 'PDF senza testo (scansione?)'


def test_formato_e_dimensione():
    assert client.post('/markdown', files={'file': ('a.exe', b'x')}).status_code == 400
    assert client.post('/markdown', files={'file': ('a.rtf', b'x' * (20 * 1024 * 1024 + 1))}).status_code == 413


def test_html_non_scarica_risorse_esterne():
    import http.server
    import threading

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'DATI-INTERNI-RISERVATI')

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        html = f'<p>a</p><iframe src="http://127.0.0.1:{srv.server_port}/x.html"></iframe><p>b</p>'.encode()
        r = client.post('/markdown', files={'file': ('a.html', html)})
    finally:
        srv.shutdown()
    assert r.status_code == 200, r.text
    assert 'DATI-INTERNI' not in r.json()['markdown']


def test_niente_html_grezzo():
    html = b'<p>Testo</p><img src="http://evil/x.png" onerror="alert(1)"><table><tr><td colspan="2">A</td></tr></table>'
    md = client.post('/markdown', files={'file': ('a.html', html)}).json()['markdown']
    assert '<' not in md and 'onerror' not in md


def test_titolo_del_docx_conservato(tmp_path):
    import subprocess
    src = tmp_path / 't.md'
    src.write_text('---\ntitle: Regolamento incentivi\n---\n\nArt. 1 - Oggetto\n\nTesto.\n', encoding='utf-8')
    out = tmp_path / 't.docx'
    subprocess.run(['pandoc', str(src), '-o', str(out)], check=True)
    md = client.post('/markdown', files={'file': ('t.docx', out.read_bytes())}).json()['markdown']
    assert md.startswith('# Regolamento incentivi\n')
