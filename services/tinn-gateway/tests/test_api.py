import json

from fastapi.testclient import TestClient

from app import config, db
from app.main import app

client = TestClient(app)


def test_health():
    assert client.get('/health').json() == {'status': 'ok'}


def test_info_senza_ripristino(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'STATE_PATH', str(tmp_path / 'state.json'))
    assert client.get('/info').json() == {'backup_date': None, 'restored_at': None}


def test_info_dopo_ripristino(tmp_path, monkeypatch):
    state = tmp_path / 'state.json'
    state.write_text(json.dumps({'backup_date': '2026-11-26T04:54:00', 'restored_at': '2026-11-26T05:30:00',
                                 'sha256': 'x'}))
    monkeypatch.setattr(db, 'STATE_PATH', str(state))
    assert client.get('/info').json() == {'backup_date': '2026-11-26T04:54:00', 'restored_at': '2026-11-26T05:30:00'}


def test_query_errori(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DB_PATH', str(tmp_path / 'assente.fdb'))
    assert client.post('/queries/inesistente', json={}).status_code == 400
    assert client.post('/queries/storia_capitolo', json={'params': {'CAPITOLO': '10565'}}).status_code == 400
    r = client.post('/queries/storia_capitolo', json={'params': {'CAPITOLO': 10565, 'ARTICOLO': 0, 'DAL': 2022}})
    assert r.status_code == 503


def test_config_path_coerente():
    assert db.DB_PATH == config.DB_PATH
