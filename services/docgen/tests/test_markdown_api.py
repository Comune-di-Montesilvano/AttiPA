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
