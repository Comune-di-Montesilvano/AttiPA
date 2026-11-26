# AttiPA

Redazione assistita di atti amministrativi per gli enti locali: determine, ordinanze, decreti,
richieste di variazione di bilancio, atti del personale.

AttiPA mette insieme la contabilità dell'ente (Tinn, in sola lettura), i regolamenti interni,
la normativa nazionale e i modelli di atto, e usa un modello linguistico a scelta dell'ente
(locale per default) per proporre testi e controlli: capitolo e disponibilità, incentivi,
contributo ANAC, CIG/CUP, oggetto entro 255 caratteri.

> Stato: scheletro iniziale. Mancano ancora autenticazione, base documentale e integrazione IA:
> non esporre in produzione.

## Componenti

| Servizio | Tecnologia | Ruolo |
|---|---|---|
| `frontend-admin` | React + Vite, nginx | interfaccia operatori |
| `backend` | NestJS | API, orchestrazione, (in arrivo) adattatore LLM e server MCP |
| `tinn-gateway` | FastAPI + Firebird 5 embedded | sync giornaliera del backup Tinn, query in sola lettura |
| `docgen` | FastAPI + LibreOffice | conversione documenti (RTF/DOCX/ODT → PDF) |

## Avvio in sviluppo

```bash
cp .env.example .env      # decommentare COMPOSE_FILE, inserire le credenziali SFTP Tinn
docker compose build
docker compose up -d
```

Interfaccia su http://localhost:3000. Primo ripristino del DB Tinn:

```bash
docker compose exec tinn-gateway python -m app.sync
```

## Produzione

`docker-compose.yml` con le immagini firmate di `ghcr.io/comune-di-montesilvano/attipa-*`
(stack Portainer da git, podman rootless), opzionalmente dietro Traefik con
`docker-compose.traefik.yml`. Verifica delle firme: `VERIFY_IMAGES=true` o
`scripts/verify-images.sh <tag>`.

## Licenza

[EUPL-1.2](LICENSE).
