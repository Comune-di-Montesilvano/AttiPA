"""Configurazione dalle variabili d'ambiente (.env letto da docker compose)."""
import os
from dataclasses import dataclass

DATA_DIR = os.environ.get('TINN_DATA', '/data')
DB_PATH = os.path.join(DATA_DIR, 'tinn.fdb')
STATE_PATH = os.path.join(DATA_DIR, 'state.json')


class ConfigError(Exception):
    pass


@dataclass
class Config:
    work: str
    host: str | None
    port: int
    user: str | None
    password: str | None
    path: str | None
    db_file: str
    host_key: str | None
    local_zip: str | None

    @classmethod
    def from_env(cls, env, local_zip=None):
        def get(name, default=None):
            value = (env.get(name) or '').strip()
            return value or default

        local_zip = local_zip or get('TINN_LOCAL_ZIP')
        required = ['TINN_DB_FILE'] + ([] if local_zip else
                                       ['TINN_SFTP_HOST', 'TINN_SFTP_USER', 'TINN_SFTP_PASSWORD', 'TINN_SFTP_PATH'])
        missing = [name for name in required if not get(name)]
        if missing:
            raise ConfigError('Variabili mancanti nel .env: ' + ', '.join(missing))
        return cls(
            # sftp.py salva known_hosts in work: deve sopravvivere tra un giro e l'altro.
            work=DATA_DIR,
            host=get('TINN_SFTP_HOST'),
            port=int(get('TINN_SFTP_PORT', '22')),
            user=get('TINN_SFTP_USER'),
            password=env.get('TINN_SFTP_PASSWORD') or None,
            path=get('TINN_SFTP_PATH'),
            db_file=get('TINN_DB_FILE'),
            host_key=get('TINN_SFTP_HOST_KEY'),
            local_zip=local_zip,
        )

    def secrets(self):
        return [s for s in (self.password, self.user) if s]
