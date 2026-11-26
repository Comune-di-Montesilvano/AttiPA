from datetime import date, datetime, timedelta

from app import scheduler
from app.scheduler import should_run

OGGI = date(2026, 11, 26)


def at(h, m=0):
    return datetime(2026, 11, 26, h, m)


def test_prima_dell_ora_non_parte():
    assert not should_run(at(5, 59), 6, None, None)


def test_alle_6_parte():
    assert should_run(at(6, 0), 6, None, None)


def test_riuscita_non_riparte_lo_stesso_giorno():
    assert not should_run(at(6, 1), 6, OGGI, at(6, 0))
    assert not should_run(at(9, 0), 6, OGGI, at(6, 0))


def test_giorno_dopo_riparte():
    assert should_run(at(6, 0) + timedelta(days=1), 6, OGGI, at(6, 0))


def test_fallita_riprova_dopo_30_minuti():
    assert not should_run(at(6, 20), 6, None, at(6, 0))
    assert should_run(at(6, 30), 6, None, at(6, 0))


def test_fallita_smette_dopo_la_finestra():
    assert should_run(at(9, 59), 6, None, at(9, 0))
    assert not should_run(at(10, 0), 6, None, at(9, 30))


def test_ore_23_non_sfora_nel_giorno_dopo():
    assert should_run(at(23, 30), 23, None, None)
    # La finestra di ritentativi resta nel giorno: dopo mezzanotte si aspetta le 23.
    assert not should_run(datetime(2026, 11, 27, 0, 30), 23, None, at(23, 30))


def test_tick_aggiorna_stato(monkeypatch):
    codes = iter([1, 0])
    monkeypatch.setattr(scheduler.sync, 'main', lambda argv: next(codes))
    state = scheduler.State()
    scheduler.tick(at(6, 0), 6, state)
    assert state.last_ok is None and state.last_try == at(6, 0)
    scheduler.tick(at(6, 10), 6, state)  # troppo presto per riprovare
    assert state.last_try == at(6, 0)
    scheduler.tick(at(6, 30), 6, state)
    assert state.last_ok == OGGI


def test_tick_eccezione_non_ferma_lo_scheduler(monkeypatch):
    def boom(argv):
        raise RuntimeError('rete')
    monkeypatch.setattr(scheduler.sync, 'main', boom)
    state = scheduler.State()
    scheduler.tick(at(6, 0), 6, state)
    assert state.last_ok is None and state.last_try == at(6, 0)
