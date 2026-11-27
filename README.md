# AttiPA

Redazione assistita di atti amministrativi per gli enti locali: determine, ordinanze, decreti,
richieste di variazione di bilancio, atti del personale.

AttiPA mette insieme la contabilità dell'ente (Tinn, in sola lettura), i regolamenti interni,
la normativa nazionale e i modelli di atto, e usa un modello linguistico a scelta dell'ente
(locale per default) per proporre testi e controlli: capitolo e disponibilità, incentivi,
contributo ANAC, CIG/CUP, oggetto entro 255 caratteri.

> Stato: in sviluppo. Login su Active Directory, assistente che interroga la contabilità
> Tinn e server MCP (facoltativo) presenti; mancano base documentale e redazione degli atti.

## Componenti

| Servizio | Tecnologia | Ruolo |
|---|---|---|
| `frontend-admin` | React + Vite, nginx | interfaccia operatori |
| `backend` | NestJS | API, orchestrazione, assistente IA (provider compatibili OpenAI), server MCP con token personali |
| `tinn-gateway` | FastAPI + Firebird 5 embedded | sync giornaliera del backup Tinn, query in sola lettura |
| `docgen` | FastAPI + LibreOffice | conversione documenti (RTF/DOCX/ODT → PDF) |
| `postgres` | Postgres 18 + pgvector | operatori, impostazioni, (in arrivo) atti e regolamenti |
| `ollama` | Ollama (facoltativo, profilo `llm-locale`) | modello locale: i dati non escono dal server |

## Avvio in sviluppo

```bash
cp .env.example .env      # decommentare COMPOSE_FILE; POSTGRES_PASSWORD, JWT_SECRET,
                          # LDAP_HOST=mock (admin/admin) e credenziali SFTP Tinn
docker compose build
docker compose up -d
```

Interfaccia su http://localhost:3000. Primo ripristino del DB Tinn:

```bash
docker compose exec tinn-gateway python -m app.sync
```

Assistente con modello locale (lento senza GPU):

```bash
docker compose --profile llm-locale up -d ollama
docker compose exec ollama ollama pull qwen3:4b   # poi LLM_MODEL=qwen3:4b nel .env
docker compose up -d backend
```

## Produzione

`docker-compose.yml` con le immagini firmate di `ghcr.io/comune-di-montesilvano/attipa-*`
(stack Portainer da git, podman rootless), opzionalmente dietro Traefik con
`docker-compose.traefik.yml`. Verifica delle firme: `VERIFY_IMAGES=true` o
`scripts/verify-images.sh <tag>`. Obbligatori nel `.env`: `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`JWT_SECRET` (`openssl rand -hex 32`) e la configurazione `LDAP_*` di Active Directory.

## Licenza

[EUPL-1.2](LICENSE).
