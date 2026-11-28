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
ollama                 modello locale, facoltativo (profilo compose `llm-locale`)
```

Non ancora presenti (prossimi passi): Redis/BullMQ, regolamenti e norme con embedding (pgvector).

### IA

- `apps/backend/src/llm`: interfaccia `LlmProvider` (`chat` con strumenti, `models`), oggi un solo
  provider `openai-compatible` (fetch a `/chat/completions` e `/models`, nessun SDK). Chat sempre
  in streaming SSE: senza, la fetch di Node chiude dopo 300 s senza header (`headersTimeout` di
  undici, «Modello non raggiungibile (UND_ERR_HEADERS_TIMEOUT)»). Argomenti degli strumenti
  accettati sia come stringa JSON (OpenAI) sia come oggetto (Ollama), anche a frammenti.
  `GET /llm/status`: modello, host dell'endpoint (mai la chiave), raggiungibile, modello presente.
- `apps/backend/src/assistant`: `POST /assistant/chat` (`{messages:[{role:user|assistant, content}]}`,
  niente ruoli system/tool dal client). Ciclo strumenti: `tinn_info` + uno strumento `tinn_<query>`
  per ogni query della whitelist di tinn-gateway (descrizione = commento in testa al `.sql`,
  parametri tutti obbligatori, numeri passati come stringa convertiti). Errori degli strumenti
  restituiti al modello come testo; al massimo `LLM_MAX_STEPS` chiamate, poi una finale senza
  strumenti. Al modello al più 100 righe / 15.000 caratteri per risultato, con nota sul taglio.
  La risposta riporta gli strumenti usati (`steps`), mostrati all'operatore. Nel log solo utente
  e nomi degli strumenti, mai domande o risultati.
- **I risultati delle query (creditori, importi) vanno al modello**: endpoint senza contratto e
  DPA dell'ente vietati. Default: Ollama del compose, solo rete interna.
- Su CPU un modello da 4B genera ~7 token/s e qwen3 «ragiona» anche sulle risposte brevi: una
  domanda con strumenti richiede minuti (`LLM_TIMEOUT_MS`, default 120 s). In produzione serve
  GPU o un server di inferenza dell'ente.

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

### Server MCP

- `apps/backend/src/mcp`: `ALL /mcp` (`/api/mcp` dietro nginx) con `@modelcontextprotocol/server`
  v2 (`createMcpHandler`): protocollo 2026-07-28 e fallback stateless per i client 2025, una
  istanza di `McpServer` per richiesta con gli strumenti di `tools/TinnToolsService` (gli stessi
  dell'assistente), annotati `readOnlyHint`, risposta JSON. Schemi JSON delle query passati con
  `fromJsonSchema` (validatore ajv incluso nel pacchetto).
- Spento di default (`MCP_ENABLED=false` → 404): i client mandano i dati Tinn al loro modello.
- Autenticazione: niente JWT operatore (`@Public` in allowlist), token personale
  `Authorization: Bearer attipa_pat_<32 byte base64url>`. Tabella `api_tokens`: SHA-256 del token
  (mai in chiaro), prefisso, scadenza (max `MCP_TOKEN_MAX_DAYS`, default 90), revoca, ultimo uso
  (aggiornato al più ogni 5 minuti), max 10 attivi per operatore. `GET/POST /tokens`,
  `DELETE /tokens/:id`: ognuno vede e revoca solo i propri.
- Limite noto: il token vale finché non scade o viene revocato anche se l'operatore esce dal
  gruppo AD (il ruolo è quello dell'ultimo login). Scadenza breve per questo.
- Log: utente e nome dello strumento, mai parametri o risultati.

### Ollama

- `docker compose --profile llm-locale up -d ollama`, poi
  `docker compose exec ollama ollama pull qwen3:4b` e `LLM_MODEL=qwen3:4b` nel `.env`.
  Nessuna porta sull'host; modelli nel volume `ollama_data`.

### docgen

- `POST /convert?target=pdf|docx|odt` (multipart `file`, origine .rtf/.docx/.doc/.odt, max 20 MB).
  Ogni conversione in una cartella temporanea con profilo LibreOffice proprio
  (`-env:UserInstallation`): due soffice sullo stesso profilo si bloccano. Nome del file
  caricato mai nella riga di comando.
- `POST /markdown` (multipart `file`: .docx .odt .html .htm .rtf .doc .pdf, max 20 MB) →
  `{markdown, warnings}`: import di regolamenti e documenti (ogni import diventa Markdown).
  DOCX/ODT/HTML con pandoc (`--to gfm`), RTF/DOC prima in DOCX con LibreOffice, PDF con
  pypdfium2 (non PyMuPDF: AGPL) + ricucitura righe e rimozione di testata/piè ripetuti.
  `app/markdown.py` fissa i titoli: `#` documento, `##` Parte/Libro/Titolo/Capo, `###` Sezione,
  `####` «Art. N[-bis]» (anche da paragrafi in grassetto). PDF senza testo → 422
  «PDF senza testo (scansione?)». pandoc: .deb della release con `--checksum`, controllato da
  `toolchain-version-check.yml`.
- Test locali come in CI (app e test dal working tree, nell'immagine dev; il container dev
  monta solo `app/`):
  `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/services/docgen:/src:ro" attipa/docgen:dev sh -ec 'pip install -q --require-hashes --no-deps -r /src/requirements-dev.txt; rm -rf app; cp -r /src/app /src/tests .; python -m pytest tests -q'`.

## Sviluppo

```bash
cp .env.example .env            # decommentare COMPOSE_FILE per lo sviluppo
docker compose build
docker compose up -d            # http://localhost:${ADMIN_PORT} (API su /api)
```

- `.env` di sviluppo: `POSTGRES_PASSWORD`, `JWT_SECRET` (anche corti in dev) e `LDAP_HOST=mock`.
- Il watch di Nest non vede le modifiche dai bind mount di Windows: `docker compose restart backend`.
- Unica porta sull'host: `ADMIN_PORT` (dal `.env`); con Traefik nessuna (`docker-compose.traefik.yml`).
  Backend, Postgres, gateway e Ollama solo sulla rete interna. In dev il browser chiama `/api` sul server
  Vite, che lo inoltra a `backend:8080` (`vite.config.ts`, come nginx in produzione). Test nel container
  backend, SQL con `docker compose exec postgres psql`.

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
