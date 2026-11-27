#!/usr/bin/env bash
# scripts/smoke-stack.sh — smoke test dello stack di produzione (docker-compose.yml) gia'
# avviato: servizi su, frontend e API attraverso nginx, backend → tinn-gateway, conversione
# docgen, Firebird embedded da utente non root, filesystem in sola lettura, Postgres migrato,
# login obbligatorio sulle API.
# Usato da release.yml prima di pubblicare i tag; in locale:
#   docker compose -f docker-compose.yml -p smoke --env-file <env> up -d
#   COMPOSE="docker compose -f docker-compose.yml -p smoke --env-file <env>" scripts/smoke-stack.sh
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose -f docker-compose.yml}
ADMIN=http://localhost:${ADMIN_PORT:-3000}
TIMEOUT=${SMOKE_TIMEOUT:-180}

fail() {
  echo "::error::$*"
  $COMPOSE ps -a || true
  $COMPOSE logs --no-color --tail 80 || true
  exit 1
}
ok() { echo "OK  $*"; }

# Backend pronto quando /version risponde attraverso il nginx dell'admin.
for ((i = 0; i < TIMEOUT; i += 5)); do
  curl -fsS "$ADMIN/api/version" >/dev/null 2>&1 && break
  sleep 5
done
version=$(curl -fsS "$ADMIN/api/version") || fail "backend non raggiungibile da $ADMIN/api/version entro ${TIMEOUT}s"
ok "versione $version"

for svc in postgres backend tinn-gateway docgen frontend-admin; do
  state=$($COMPOSE ps -a --format '{{.State}}' "$svc")
  [ "$state" = running ] || fail "$svc in stato '$state'"
done
verify=$($COMPOSE ps -a --format '{{.State}} {{.ExitCode}}' verify-images)
[ "$verify" = "exited 0" ] || fail "verify-images: '$verify'"
ok "servizi in esecuzione"

curl -fsS "$ADMIN/config.js" | grep -q "apiBase: '/api'" || fail "config.js non generato"
curl -fsS -o /dev/null "$ADMIN/" || fail "$ADMIN/ non servito"
ok "frontend, config.js e proxy /api"

# Migration eseguite all'avvio del backend (schema e pgvector).
$COMPOSE exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM migrations" -c "SELECT extname FROM pg_extension"' \
  | tr '\n' ' ' | grep -qE '^[1-9][0-9]* .*vector' || fail "migration o estensione vector assenti"
ok "Postgres: migration e pgvector"

# API protette: senza token 401; login senza LDAP configurato 503 (nessun accesso simulato
# in produzione).
code=$(curl -s -o /dev/null -w '%{http_code}' "$ADMIN/api/tinn/info")
[ "$code" = 401 ] || fail "/api/tinn/info senza token: $code invece di 401"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$ADMIN/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}')
[ "$code" = 503 ] || fail "login senza LDAP configurato: $code invece di 503"
ok "API protette, nessun login simulato"

# Token operatore firmato con il JWT_SECRET del container (HS256 con crypto di Node, nessuna
# dipendenza): stack nuovo, DB Tinn mai ripristinato, date null.
token=$($COMPOSE exec -T backend node -e '
const { createHmac } = require("node:crypto");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const body = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: "smoke", username: "smoke", displayName: "Smoke", role: "user", type: "operator", iat: now, exp: now + 300 });
process.stdout.write(body + "." + createHmac("sha256", process.env.JWT_SECRET).update(body).digest("base64url"));
') || fail "firma del token di prova"
curl -fsS "$ADMIN/api/tinn/info" -H "Authorization: Bearer $token" | grep -q '"backupDate":null' \
  || fail "backend → tinn-gateway con token (/api/tinn/info)"
ok "token operatore e backend → tinn-gateway"
# Nessun modello nello smoke: lo stato dell'IA risponde con l'errore di configurazione.
curl -fsS "$ADMIN/api/llm/status" -H "Authorization: Bearer $token" | grep -q '"error":"LLM_MODEL non configurato"'   || fail "/api/llm/status"
ok "stato IA senza modello configurato"

# Firebird embedded come utente 10001 su /data (volume) e /tmp (tmpfs): crea un DB dialect 1,
# backup e ripristino con gbak (lo stesso percorso della sync), query con il driver.
$COMPOSE exec -T tinn-gateway python - <<'EOF' || fail "Firebird embedded nel tinn-gateway"
import os, subprocess
from firebird.driver import connect, create_database, driver_config
driver_config.fb_client_library.value = '/opt/firebird/lib/libfbclient.so'
driver_config.db_defaults.db_sql_dialect.value = 1
src, fbk, dst = '/data/smoke-src.fdb', '/data/smoke.fbk', '/data/smoke-dst.fdb'
with create_database(src, user='SYSDBA', charset='NONE', overwrite=True) as con:
    con.execute_immediate('CREATE TABLE T (X DOUBLE PRECISION)')
    con.commit()
    con.cursor().execute('INSERT INTO T VALUES (75.65000000000001)')
    con.commit()
gbak = '/opt/firebird/bin/gbak'
for args in (['-b', src, fbk], ['-c', '-rep', fbk, dst]):
    r = subprocess.run([gbak, '-user', 'SYSDBA', *args], capture_output=True)
    assert r.returncode == 0, r.stderr.decode()
with connect(dst, user='SYSDBA', charset='WIN1252') as con:
    cur = con.cursor()
    cur.execute('SELECT X FROM T')
    assert round(cur.fetchone()[0], 2) == 75.65
for p in (src, fbk, dst):
    os.remove(p)
EOF
ok "Firebird embedded: gbak e query da utente non root"

$COMPOSE exec -T docgen python - <<'EOF' || fail "docgen /convert"
import urllib.request, uuid
rtf = rb'{\rtf1\ansi\deff0 {\fonttbl {\f0 Liberation Serif;}} \f0 Prova \par}'
b = uuid.uuid4().hex
body = (f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="atto.rtf"\r\n'
        'Content-Type: application/rtf\r\n\r\n').encode() + rtf + f'\r\n--{b}--\r\n'.encode()
req = urllib.request.Request('http://localhost:8000/convert?target=pdf', data=body,
                             headers={'Content-Type': f'multipart/form-data; boundary={b}'})
assert urllib.request.urlopen(req, timeout=120).read().startswith(b'%PDF')
EOF
ok "docgen: RTF → PDF"

for svc in postgres backend tinn-gateway docgen; do
  if $COMPOSE exec -T "$svc" sh -c 'touch /smoke' 2>/dev/null; then
    fail "filesystem di $svc scrivibile: read_only non applicato"
  fi
done
ok "filesystem in sola lettura"

# --- backend-ricreato (inizio) ---
# Solo il backend ricreato, con un IP diverso (redeploy che tocca solo lui, incidente
# ComunicaPA 2026-11-04): il frontend deve seguirlo senza riavvio. Docker riassegna subito
# l'IP appena liberato, quindi un segnaposto lo occupa mentre il backend riparte.
old_id=$($COMPOSE ps -q backend)
net=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$old_id" | head -n1)
ip_of() { docker inspect -f "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}" "$1"; }
old_ip=$(ip_of "$old_id")
img=$(docker inspect -f '{{.Config.Image}}' "$old_id")
$COMPOSE rm -sf backend >/dev/null 2>&1 || fail "rimozione del backend"
docker run -d --rm --name smoke-ip-hold --network "$net" --entrypoint sleep "$img" 600 >/dev/null \
  || fail "segnaposto per l'IP del backend"
$COMPOSE up -d --no-deps backend >/dev/null 2>&1 || fail "ricreazione del backend"
new_ip=$(ip_of "$($COMPOSE ps -q backend)")
docker rm -f smoke-ip-hold >/dev/null
[ "$new_ip" != "$old_ip" ] || fail "IP del backend invariato ($old_ip): controllo non significativo"
for ((i = 0; i < TIMEOUT; i += 3)); do
  curl -fsS "$ADMIN/api/version" >/dev/null 2>&1 && break
  sleep 3
done
curl -fsS "$ADMIN/api/version" >/dev/null 2>&1 \
  || fail "$ADMIN/api non segue il backend ricreato ($old_ip -> $new_ip) entro ${TIMEOUT}s"
ok "frontend segue il backend ricreato ($old_ip -> $new_ip)"
# --- backend-ricreato (fine) ---

# Il messaggio informativo dello script ipv6 di nginx menziona "read-only file system?".
if $COMPOSE logs --no-color | grep -iE 'EROFS|read-only file system|EACCES|permission denied' | grep -v 10-listen-on-ipv6; then
  fail "errori di filesystem nei log"
fi
ok "nessun errore di filesystem nei log"
