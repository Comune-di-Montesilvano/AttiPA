# CLAUDE.md

Guida per Claude Code in questo repository.

## Progetto

AttiPA — redazione assistita di atti amministrativi di un ente locale (determine, ordinanze,
decreti, richieste di variazione di bilancio, atti del personale) a partire da:

- contabilità **Tinn** dell'ente (Firebird, un solo ente per istanza), in sola lettura;
- regolamenti interni (incentivi, opere pubbliche, appalti, verde, polizia locale,
  organizzazione del personale) e leggi nazionali;
- modelli di atto (RTF/DOCX).

IA **agnostica**: endpoint compatibile OpenAI (Ollama, vLLM, LocalAI) come default, provider
cloud solo con contratto e DPA dell'ente. In programma un server MCP nel backend, così i client
ufficiali (Claude Desktop/Code, ChatGPT) possono usare gli stessi strumenti. Gli abbonamenti
personali (Claude Pro/Max) non si collegano dentro l'app: i termini Anthropic lo vietano.

**Dati reali con dati personali** (creditori, stipendi, tributi): mai nel repo, nei test, nei
messaggi di commit, nelle issue. Test solo con dati fittizi.

Rispondere in italiano. Importi in formato italiano (1.234,56 €).

## Architettura

Monorepo pnpm, tutto in Docker (Node/pnpm non servono sull'host). Base e pipeline CI/CD
riprese da ComunicaPA (`../comunicapa`): in caso di dubbio su un pattern, guardare lì.

```
apps/backend/          NestJS 12 (ESM) + TypeScript — API REST (porta 8080)
apps/frontend-admin/   React 19 + Vite 8 — interfaccia operatori (nginx in prod, /api → backend)
packages/shared-types/ @attipa/shared-types — tipi e helper condivisi (formatEuro, JWT operatore)
services/tinn-gateway/ FastAPI + Firebird 5 embedded — sync del backup Tinn e query in sola lettura
services/docgen/       FastAPI + LibreOffice headless — conversione RTF/DOCX/ODT → PDF/DOCX/ODT
postgres               pgvector/pgvector (Postgres 18 + pgvector) — utenti, impostazioni, poi atti e regolamenti
```

Non ancora presenti (prossimi passi): Redis/BullMQ, adattatore LLM, server MCP, servizio
Ollama nel compose, regolamenti e norme con embedding (pgvector).

### Autenticazione

- Login operatori su Active Directory (`apps/backend/src/auth`, da ComunicaPA ma con `ldapts`
  al posto di `ldapjs`, non più mantenuto): bind come utente (`LDAP_USER_DN_TEMPLATE`, `%s` =
  username), ricerca per `sAMAccountName`/`userPrincipalName`, gruppi `LDAP_REQUIRED_GROUP` e
  `LDAP_ADMIN_GROUP` anche annidati (`LDAP_MATCHING_RULE_IN_CHAIN`). `LDAP_ADMIN_USERNAMES` alza
  il ruolo ma non apre l'accesso. Filtri LDAP come oggetti, mai stringhe; username limitato a
  `[A-Za-z0-9._@-]` (finisce nel DN del bind).
- JWT HS256 (`JWT_SECRET`, almeno 32 caratteri fuori dallo sviluppo, altrimenti l'avvio fallisce),
  durata `JWT_EXPIRES_IN_SECONDS` (8 ore). Ruolo nel token: un cambio di gruppo AD vale dal login
  successivo.
- Guard globali (`JwtAuthGuard` + `RolesGuard`): ogni rotta richiede il login salvo `@Public()`;
  `@Roles('admin')` per le rotte di amministrazione. `auth/route-security.inventory.spec.ts`
  elenca le rotte pubbliche ammesse e fotografa la tabella delle autorizzazioni: una rotta nuova
  cambia lo snapshot e va rivista nella PR.
- `LDAP_HOST=mock` (solo sviluppo): admin/admin e operator/operator. Un'istanza avviata una
  volta senza mock scrive `system.authRealSeen` in `app_settings` e da allora rifiuta il mock
  (`auth/auth-mode-lock.ts`). Per tornare in mock in dev:
  `DELETE FROM app_settings WHERE key = 'system.authRealSeen';`
- Operatori in `users` (anagrafica AD aggiornata a ogni login). Frontend: token in
  `localStorage` (`attipa_session`), 401 → ritorno al login.

### Database

- TypeORM 1, schema **solo da migration anche in sviluppo** (niente `synchronize`): migration
  eseguite all'avvio del backend. Entity e migration elencate a mano in
  `database/schema.list.ts` (uno spec controlla che non manchi nulla).
- Migration nuova: modificare le entity, poi generare l'SQL con lo schema builder di TypeORM su
  un DB vuoto (`migrations.integration.spec.ts` fallisce se migration ed entity divergono), e
  scrivere `down()` reversibile. Ultima migration sempre reversibile (rollback provato dal test).

### tinn-gateway

- Ripreso da `tinn-contabilita` (`app/sftp.py`, `app/sync.py`, `app/config.py` copiati):
  download SFTP (prefetch 64, keepalive, chiave host fissata in `/data/known_hosts`), `gbak -c`
  in `/data/tmp`, `os.replace` solo a ripristino riuscito. Sync giornaliera all'ora
  `TINN_SYNC_HOUR` (default 6, `TZ=Europe/Rome`; `app/scheduler.py`, thread nel processo uvicorn,
  **un solo worker**): se fallisce riprova ogni 30 min per 4 ore. Prima sync reale (2026-11-26):
  ≈ 6 min di download + 2 min di `gbak`. A mano (non in contemporanea con quella automatica):
  `docker compose exec tinn-gateway python -m app.sync [--force] [--local-zip /backup/x.zip]`.
- Librerie Firebird copiate dall'immagine ufficiale `firebirdsql/firebird:5.0.3` su
  `python:3.15-slim` (+ `libtommath1`, `libtomcrypt1`, `libicu76`). `firebird.log` è un link
  a `/tmp` (filesystem in sola lettura). Gira come utente 10001; `/data` è il volume `tinn_data`.
- **Nessun SQL libero dalla rete**: solo le query di `services/tinn-gateway/queries/*.sql`
  (`GET /queries`, `POST /queries/{nome}` con `{"params": {...}, "limit": n}`). I segnaposto
  `{NOME}` diventano parametri posizionali del driver (`app/db.py: bind`): `'{NOME}'` tra
  apici = stringa, `{NOME}` senza apici = numero validato. Mai concatenare valori nel testo SQL.
- Query nuove: file `.sql` con commento in testa (scopo, parametri, regole). Le regole di
  calcolo sul DB Tinn (assestato, impegnato, residui, PdC…) sono documentate nel `CLAUDE.md`
  di `tinn-contabilita`: riportarle qui quando una query le usa.
- DB dialect 1, charset `NONE` con byte WIN1252, CHAR con spazi in coda: `app/db.py: to_json`
  decodifica cp1252, toglie gli spazi e arrotonda i double al centesimo.
- Parametro più lungo della colonna confrontata → Firebird «string right truncation» → 400.

### docgen

- `POST /convert?target=pdf|docx|odt` (multipart `file`, origine .rtf/.docx/.doc/.odt, max 20 MB).
  Ogni conversione in una cartella temporanea con profilo LibreOffice proprio
  (`-env:UserInstallation`): due soffice sullo stesso profilo si bloccano. Nome del file
  caricato mai nella riga di comando.

## Sviluppo

```bash
cp .env.example .env            # decommentare COMPOSE_FILE per lo sviluppo
docker compose build
docker compose up -d            # admin http://localhost:3000, backend http://localhost:8080
```

- `.env` di sviluppo: `POSTGRES_PASSWORD`, `JWT_SECRET` (anche corti in dev) e `LDAP_HOST=mock`.
- Il watch di Nest non vede le modifiche dai bind mount di Windows: `docker compose restart backend`.
- Porta 8080 occupata da altri progetti: `BACKEND_PORT` nel `.env` (il frontend dev punta però a
  `localhost:8080` in `public/config.js`).

- Compose diviso come ComunicaPA: `docker-compose.yml` = produzione (immagini ghcr, volumi
  named, `read_only`, `cap_drop: ALL`), `docker-compose.override.yml` = sviluppo (build da
  `Dockerfile.dev`, bind mount). Ogni modifica al compose va pensata per podman rootless
  (Portainer, stack da git).
- Da Git Bash: prefisso `MSYS_NO_PATHCONV=1` sui comandi con percorsi assoluti del container.
- Comandi Docker uno alla volta.

### Test

```bash
# Node (in container, workspace copiato: niente node_modules sull'host). Con Postgres avviato
# girano anche *.integration.spec.ts (DATABASE_URL del container; DB temporanei, mai quello dell'app)
docker compose run --rm --no-deps backend node_modules/.bin/vitest run
# Python (immagine dev + dipendenze di test dal lock con hash)
docker build -q -f services/tinn-gateway/Dockerfile.dev -t tinn-gateway:test .
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/services/tinn-gateway:/src:ro" tinn-gateway:test sh -ec \
  'pip install -q --require-hashes --no-deps -r /src/requirements-dev.txt; cp -r /src/tests ./tests; python -m pytest tests/ -q'
# Smoke dello stack di produzione (immagini taggate :smoke)
docker compose -f docker-compose.yml -p smoke --env-file <env con IMAGE_TAG=smoke> up -d
COMPOSE="docker compose -f docker-compose.yml -p smoke --env-file <env>" scripts/smoke-stack.sh
```

- `tests/test_firebird.py` crea un DB Firebird dialect 1 vero: il percorso driver + parametri
  è testato senza mock.
- pnpm v11 blocca i lifecycle script: `pnpm install --ignore-scripts` + `pnpm rebuild esbuild`.
- `shared-types` va compilato prima di backend/frontend (`main`/`types` puntano a `dist`).
- Gli spec backend usano `vi` di Vitest per `stubGlobal`/`unstubAllGlobals` (lo shim `jest`
  non li tipizza).

### Dipendenze Python

`requirements.in` → `requirements.txt` con hash, generato con pip-compile nella stessa immagine
Python dei Dockerfile:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/services:/w" -w /w python:3.15-slim sh -ec \
  'pip install -q pip-tools; cd <servizio>; pip-compile -q --allow-unsafe --generate-hashes --no-emit-index-url --output-file=requirements.txt --strip-extras requirements.in'
```

## CI/CD

Workflow copiati da ComunicaPA e adattati (vedi `docs/ci-cd-security-baseline.md`, nota in
testa): `tests.yml` (PR: lint/type-check; merge queue: build, test con copertura,
`integration-tests` su Postgres/pgvector, `python-tests` per tinn-gateway e docgen;
required check `python-tests-ok`), `security.yml`, `release.yml` (build, Trivy, firma
cosign, attestazioni, smoke sullo stack completo, poi tag), `security-autofix.yml` (richiede i
secret `BOT_CLIENT_ID`/`BOT_PRIVATE_KEY` della GitHub App), Dependabot.
Immagini: `ghcr.io/comune-di-montesilvano/attipa-{backend,frontend-admin,tinn-gateway,docgen}`.
Ruleset di `main` (merge queue, required check) da configurare sul repo come in ComunicaPA.

**Repo privato senza GitHub Advanced Security** (scelta voluta: il codice mostra la struttura
del DB Tinn, che è del fornitore). Due repo variable riaccendono le parti che lo richiedono:
`CODE_SCANNING=true` (upload SARIF su code scanning, `dependency-review`, `security-alerts.yml`)
e `PUBLIC_REPO=true` (Scorecard, validazione `publiccode.yml`, che scarica gli URL del repo).
Senza variabili i SARIF di Trivy restano artifact della run (`sarif-*`); il blocco su
vulnerabilità resta comunque nell'`exit-code` di Trivy.
