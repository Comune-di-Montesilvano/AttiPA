"""Scarica il backup Tinn (SFTP o zip locale), lo ripristina con gbak su un file
nuovo e lo sostituisce a quello in uso solo se il ripristino riesce.

Uso: python3 -m app.sync [--force] [--local-zip /backup/file.zip] [--fbk /backup/file.fbk]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime

from app import sftp
from app.config import DATA_DIR, DB_PATH, STATE_PATH, Config, ConfigError

GBAK = os.path.join(os.environ.get('FB_BIN', '/opt/firebird/bin'), 'gbak')
TMP = os.path.join(DATA_DIR, 'tmp')


def log(msg):
    print('[%s] %s' % (datetime.now().strftime('%H:%M:%S'), msg), flush=True)


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def unzip_member(zip_path, member, dest):
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if os.path.basename(n) == member]
        if not names:
            raise RuntimeError('%s non trovato nello zip (contiene: %s)' % (member, ', '.join(z.namelist())))
        with z.open(names[0]) as src, open(dest, 'wb') as out:
            shutil.copyfileobj(src, out, 1 << 20)


def restore(fbk, db):
    res = subprocess.run([GBAK, '-c', '-p', '16384', '-user', 'SYSDBA', fbk, db], capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode('utf-8', errors='replace').strip()[:500] or 'gbak non riuscito')


def mask(text, secrets):
    for s in secrets:
        text = text.replace(s, '***')
    return text


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--force', action='store_true', help='ripristina anche se lo zip non è cambiato')
    p.add_argument('--local-zip', help='zip già scaricato (percorso nel container)')
    p.add_argument('--fbk', help='.fbk già estratto (percorso nel container): niente download')
    args = p.parse_args(argv)

    shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP)
    state = read_state()
    secrets = []
    try:
        if args.fbk:
            fbk, backup_date, sha = args.fbk, datetime.fromtimestamp(os.path.getmtime(args.fbk)), None
        else:
            cfg = Config.from_env(os.environ, args.local_zip)
            secrets = cfg.secrets()
            zip_path = os.path.join(TMP, 'backup.zip')
            log('scaricamento %s' % ('zip locale' if cfg.local_zip else 'via SFTP'))
            backup_date = sftp.download(cfg, zip_path)
            sha = sha256_of(zip_path)
            if not args.force and sha == state.get('sha256') and os.path.exists(DB_PATH):
                log('backup invariato (%s): DB in uso già aggiornato' % state.get('backup_date'))
                return 0
            fbk = os.path.join(TMP, 'backup.fbk')
            unzip_member(zip_path, cfg.db_file, fbk)
            os.remove(zip_path)
        new_db = os.path.join(TMP, 'tinn.fdb')
        log('ripristino con gbak (circa 3 minuti)')
        restore(fbk, new_db)
        os.replace(new_db, DB_PATH)
        state = {'backup_date': backup_date.isoformat(timespec='seconds'), 'sha256': sha,
                 'restored_at': datetime.now().isoformat(timespec='seconds')}
        with open(STATE_PATH, 'w') as f:
            json.dump(state, f, indent=2)
        log('DB pronto: backup del %s' % state['backup_date'])
        return 0
    except ConfigError as e:
        log(str(e))
        return 2
    except Exception as e:  # noqa: BLE001
        log('ERRORE: ' + mask(str(e), secrets))
        return 1
    finally:
        shutil.rmtree(TMP, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
