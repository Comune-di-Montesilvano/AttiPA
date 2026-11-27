"""Sync giornaliera del DB Tinn, con ritentativi se fallisce.

Parte all'ora TINN_SYNC_HOUR (ora locale del container, TZ=Europe/Rome). Se la sync
non riesce riprova ogni RETRY_EVERY fino a RETRY_HOURS ore dopo, senza sforare nel
giorno successivo. Una sync riuscita (anche «backup invariato») chiude la giornata.
"""
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app import sync

RETRY_EVERY = timedelta(minutes=30)
RETRY_HOURS = 4


@dataclass
class State:
    last_ok: date | None = None
    last_try: datetime | None = None


def should_run(now: datetime, hour: int, last_ok: date | None, last_try: datetime | None) -> bool:
    if last_ok == now.date():
        return False
    if not hour <= now.hour < hour + RETRY_HOURS:
        return False
    return last_try is None or last_try.date() != now.date() or now - last_try >= RETRY_EVERY


def tick(now: datetime, hour: int, state: State) -> None:
    if not should_run(now, hour, state.last_ok, state.last_try):
        return
    state.last_try = now
    try:
        code = sync.main([])
    except Exception as e:  # noqa: BLE001 - lo scheduler non deve morire
        sync.log('sync giornaliera: eccezione %s' % type(e).__name__)
        code = 1
    if code == 0:
        state.last_ok = now.date()
        sync.log('sync giornaliera riuscita')
    else:
        sync.log('sync giornaliera fallita (codice %s): nuovo tentativo tra %d minuti'
                 % (code, RETRY_EVERY.seconds // 60))


def loop(hour: int) -> None:
    state = State()
    while True:
        tick(datetime.now(), hour, state)
        time.sleep(60)
