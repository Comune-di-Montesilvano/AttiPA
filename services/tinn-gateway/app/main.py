"""API interna (nessuna porta sull'host) sul DB Tinn in sola lettura."""
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app import db, sync

log = logging.getLogger('tinn-gateway')


def _scheduler(hour):
    """Una sync al giorno all'ora indicata (il fornitore scrive lo zip verso le 05:00)."""
    last = None
    while True:
        now = datetime.now()
        if now.hour == hour and last != now.date():
            last = now.date()
            code = sync.main([])
            log.info('sync giornaliera terminata con codice %s', code)
        time.sleep(60)


@asynccontextmanager
async def lifespan(_app):
    hour = os.environ.get('TINN_SYNC_HOUR', '').strip()
    if hour.isdigit():
        threading.Thread(target=_scheduler, args=(int(hour),), daemon=True).start()
    yield


app = FastAPI(title='tinn-gateway', docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


class QueryRequest(BaseModel):
    params: dict[str, str | int | float] = Field(default_factory=dict)
    limit: int = Field(default=1000, ge=1, le=5000)


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.get('/info')
def info():
    state = db.read_state()
    return {'backup_date': state.get('backup_date'), 'restored_at': state.get('restored_at')}


@app.get('/queries')
def queries():
    return db.list_queries()


@app.post('/queries/{name}')
def run_query(name: str, req: QueryRequest):
    try:
        return db.run(name, req.params, req.limit)
    except db.QueryError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except db.DbMissing as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

