from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

RTF = (rb'{\rtf1\ansi\deff0 {\fonttbl {\f0 Liberation Serif;}} \f0 '
       rb'Determina di prova: importo 1.234,56 \u8364? \par}')


def test_health():
    assert client.get('/health').json() == {'status': 'ok'}


def test_rtf_in_pdf():
    r = client.post('/convert?target=pdf', files={'file': ('atto.rtf', RTF, 'application/rtf')})
    assert r.status_code == 200, r.text
    assert r.headers['content-type'] == 'application/pdf'
    assert r.content.startswith(b'%PDF')


def test_formati_non_ammessi():
    assert client.post('/convert?target=exe', files={'file': ('atto.rtf', RTF)}).status_code == 400
    assert client.post('/convert?target=pdf', files={'file': ('atto.sh', b'x')}).status_code == 400
    assert client.post('/convert?target=rtf', files={'file': ('atto.rtf', RTF)}).status_code == 400
