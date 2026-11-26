"""Percorso completo sul driver vero: DB Firebird embedded dialect 1, charset NONE."""
import os

import pytest

from app import db

pytestmark = pytest.mark.skipif(not os.path.exists(db.FB_CLIENT), reason='Firebird non installato')


@pytest.fixture
def tinn_db(tmp_path, monkeypatch):
    from firebird.driver import create_database, driver_config

    driver_config.fb_client_library.value = db.FB_CLIENT
    defaults = driver_config.db_defaults
    monkeypatch.setattr(defaults.db_sql_dialect, 'value', 1)
    monkeypatch.setattr(defaults.db_charset, 'value', 'NONE')
    monkeypatch.setattr(defaults.sql_dialect, 'value', 1)
    path = str(tmp_path / 'tinn.fdb')
    with create_database(path, user='SYSDBA', charset='NONE') as con:
        con.execute_immediate('CREATE TABLE T (ANNO INTEGER, SETT CHAR(10), DESCR VARCHAR(40), IMPORTO DOUBLE PRECISION)')
        con.commit()
        cur = con.cursor()
        cur.execute("INSERT INTO T VALUES (2026, '01', 'CAFF' || ASCII_CHAR(200), 75.65000000000001)")
        cur.execute("INSERT INTO T VALUES (2025, '02', 'ALTRO', 1)")
        con.commit()
    queries = tmp_path / 'queries'
    queries.mkdir()
    (queries / 'prova.sql').write_text(
        "-- Query di prova\nSELECT SETT, DESCR, IMPORTO FROM T WHERE ANNO = {ANNO} AND SETT LIKE '{SETTORE}'\n",
        encoding='utf-8')
    monkeypatch.setattr(db, 'DB_PATH', path)
    monkeypatch.setattr(db, 'QUERIES_DIR', str(queries))
    return path


def test_query_su_firebird(tinn_db):
    res = db.run('prova', {'ANNO': '2026', 'SETTORE': '%'})
    assert res == {'columns': ['SETT', 'DESCR', 'IMPORTO'], 'rows': [['01', 'CAFFÈ', 75.65]], 'truncated': False}


def test_parametro_stringa_non_entra_nel_sql(tinn_db):
    res = db.run('prova', {'ANNO': '2026', 'SETTORE': "' OR ''='"})
    assert res['rows'] == []


def test_parametro_piu_lungo_del_campo(tinn_db):
    with pytest.raises(db.QueryError):
        db.run('prova', {'ANNO': '2026', 'SETTORE': 'X' * 11})


def test_limite_righe(tinn_db):
    res = db.run('prova', {'ANNO': '2025', 'SETTORE': '%'}, limit=1)
    assert len(res['rows']) == 1 and res['truncated'] is False
