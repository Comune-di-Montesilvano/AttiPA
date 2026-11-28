# Leggi e regolamenti: import in Markdown e ricerca per l'IA

Stato: bozza da approvare (2026-11-28).

## Perché

AttiPA è agnostico: nessun tipo di atto, modello o norma scritto nel codice. Tutto il contenuto
dell'ente entra come documento importato. Questo primo passo porta dentro **leggi** (da Normattiva)
e **regolamenti interni** (file caricati), perché l'assistente e i client MCP possano cercarli,
citarli per articolo e controllarli. Su questa base arriveranno poi i **modelli degli atti**
(caricati dall'admin) e gli **atti tipo** degli utenti, con lo stesso meccanismo di import.

Regola dell'utente: **ogni import viene convertito in Markdown**. Il Markdown è il testo di lavoro
(ricerca, embedding, citazioni); l'originale si conserva solo per poterlo riconvertire.

## Obiettivi

- Admin aggiunge una legge con il suo riferimento Normattiva (URN o URL); AttiPA scarica il testo
  vigente in Akoma Ntoso, lo converte in Markdown, lo spezza per articolo e lo indicizza.
- Controllo periodico delle nuove versioni vigenti; ogni versione conservata con la data di vigenza.
- Admin carica un regolamento (DOCX, ODT, RTF, DOC, HTML, PDF con testo), vede l'anteprima del
  Markdown, la corregge, indica gli estremi (es. «DGC n. 291 del 07/11/2025») e la data da cui è
  vigente, poi pubblica. Nuove versioni dello stesso regolamento con la loro data.
- Ricerca ibrida (parole + significato) e lettura di un articolo, come strumenti per l'assistente e
  per il server MCP, con la versione vigente alla data richiesta (default oggi).
- Pagina di consultazione per tutti gli utenti: elenco, testo per articolo, ricerca.

## Non obiettivi (ora)

- Modelli degli atti e atti tipo degli utenti: stesso modello dati (campo `kind`) ma interfaccia,
  permessi per utente e generazione degli atti in un passo successivo.
- OCR dei PDF scansionati (eventuale servizio opzionale con Docling, a parte).
- Giurisprudenza, circolari, prassi.
- Modifica a mano del testo delle leggi: arrivano già strutturate.

## Anti-obiettivi

- L'IA che cita un articolo abrogato o una versione non vigente alla data dell'atto.
- Testo di Normattiva presentato come ufficiale: fa fede la Gazzetta Ufficiale, avviso sempre visibile.
- Un regolamento indicizzato senza che un admin abbia visto e approvato il Markdown.
- Uscita in rete del servizio che apre i file caricati (LibreOffice): resta senza accesso esterno.

## Vincoli

- Stack esistente: NestJS 12 + TypeORM (schema solo da migrazioni, test di drift), Postgres 18 con
  pgvector già attivo, servizi Python FastAPI con lock pip a hash, immagini read_only/cap_drop ALL,
  podman rootless. Nessuna porta sull'host.
- IA agnostica: embedding dallo stesso endpoint OpenAI-compatible della chat (`/v1/embeddings`),
  modello configurabile.
- Dipendenze all'ultima versione; licenze compatibili con EUPL 1.2 (niente AGPL nel nostro codice:
  esclude PyMuPDF/pymupdf4llm).
- Sincronizzazione Normattiva: unico servizio con uscita verso `www.normattiva.it` e
  `api.normattiva.it`.

## Approcci considerati

1. **Import file con pandoc in docgen + Normattiva via Akoma Ntoso** (scelto dall'utente). Struttura
   degli articoli conservata, conversione deterministica, servizi leggeri.
2. Docling per tutto: migliore su PDF complessi e scansioni, ma immagine di GB e lento su CPU;
   rinviato a servizio opzionale.
3. MarkItDown: leggero ma sui PDF testo piatto senza titoli; scartato.
4. Leggi caricate a mano come file: niente aggiornamenti automatici; scartato per le leggi.

## Architettura

```
admin ──► frontend ──► backend ──┬─► docgen  (POST /markdown: file → md)        rete interna
                                 ├─► normattiva-gateway (POST /fetch: URN → md) uscita normattiva.it
                                 ├─► LLM endpoint (/v1/embeddings)
                                 └─► Postgres (documenti, versioni, chunk, vettori)
assistente / MCP ──► backend: strumenti norme_cerca, norme_articolo
```

### docgen: `POST /markdown`

- Input multipart `file` (.docx .odt .rtf .doc .html .pdf, max 20 MB). Output JSON
  `{markdown, warnings[]}`.
- DOCX/ODT/HTML → `pandoc -t gfm` (tabelle, elenchi, grassetti, titoli). RTF/DOC → LibreOffice in
  DOCX, poi pandoc. PDF → `pypdfium2` (Apache/BSD) per il testo pagina per pagina, poi euristica:
  righe «Art. N[-bis…]» / «Articolo N», «Capo», «Titolo», «Sezione» diventano titoli; testata e piè
  di pagina ripetuti tolti; a capo di riga ricuciti. Se un PDF non ha testo: errore
  «PDF senza testo (scansione?)».
- Normalizzazione comune: titoli degli articoli sempre al livello `####` come Normattiva
  (`# titolo`, `##` capo, `###` sezione), spazi e trattini uniformati.
- pandoc: binario della release ufficiale con checksum nel Dockerfile. Resta senza rete.

### normattiva-gateway (nuovo servizio Python)

- `POST /fetch {urn, date?}` → `{markdown, title, dataGU, codiceRedaz, dataVigenza, urnCanonica}`.
  `date` assente = vigente oggi.
- Usa la libreria `normattiva2md` (MIT, PyPI) dietro un modulo nostro (`app/source.py`), così si
  sostituisce se Normattiva cambia. Strade: link `caricaAKN` del permalink, poi API open data
  `api.normattiva.it/.../bff-opendata/v1` (ZIP con le versioni `VIGENZA_*`).
- Nessuno stato: la lista delle leggi e le versioni stanno in Postgres.
- Rete: `attipa-net` + una rete con uscita; nessuna porta. User-Agent generico, una richiesta alla
  volta, pausa tra le richieste.

### Backend: modulo `norme`

Tabelle (migrazione unica, uuid dall'app):

- `documents`: id, kind (`legge` | `regolamento` | `modello` | `atto_tipo`), title, reference
  (estremi, es. «D.Lgs. 31/03/2023, n. 36» o «DGC n. 291 del 07/11/2025»), source (`normattiva` |
  `upload`), normattiva_urn (unico, nullable), owner (FK users, null = dell'ente), created_by,
  created_at, archived_at.
- `document_versions`: id, document_id, valid_from (date), status (`draft` | `published`),
  markdown, source_hash (sha256 del file o dell'XML), source_meta (jsonb: dataGU, codiceRedaz,
  dataVigenza…), original (bytea, solo upload), original_name, original_type, created_by,
  created_at, published_at. Unico (document_id, valid_from) tra le pubblicate.
- `document_chunks`: id, version_id (FK, cascade), ordinal, heading (percorso, es. «Capo II › Art. 12
  – Incentivi»), article (es. «12», «12-bis», null), text, tsv (`tsvector` italiano, colonna
  generata, indice GIN), embedding (`vector` senza dimensione fissa), embedding_model.

Chunk: uno per articolo; articolo oltre ~2.000 caratteri spezzato per comma/paragrafo con il
percorso del titolo ripetuto in testa. Embedding calcolati alla pubblicazione, a lotti.

Ricerca (vigente alla data D): versioni pubblicate con `valid_from <= D` e massima per documento;
fusione RRF di full-text (`websearch_to_tsquery('italian')`) e coseno su pgvector (ricerca esatta:
corpus piccolo, nessun indice ANN; colonna senza dimensione per poter cambiare modello). Cambio
modello di embedding = ricalcolo di tutti i chunk (comando admin).

Rotte:

- `GET /norme` (tutti): elenco documenti con versione vigente.
- `GET /norme/:id?data=` (tutti): versione vigente in Markdown, con versioni disponibili.
- `GET /norme/cerca?q=&data=&kind=` (tutti).
- `POST /norme/normattiva {urn}` (admin): scarica e pubblica subito.
- `POST /norme/upload` multipart (admin): crea bozza con Markdown convertito.
- `PUT /norme/versioni/:id` (admin, solo bozze): titolo, estremi, valid_from, Markdown corretto.
- `POST /norme/versioni/:id/pubblica` (admin): chunk + embedding.
- `DELETE /norme/versioni/:id` (admin, solo bozze); `POST /norme/:id/archivia` (admin).
- `POST /norme/normattiva/aggiorna` (admin): controllo immediato.

Aggiornamento Normattiva: `@nestjs/schedule`, ogni giorno all'ora `NORME_SYNC_HOUR` (default 5,
prima del sync Tinn). Per ogni legge: fetch del vigente; se `dataVigenza` o `source_hash` diversi
dall'ultima versione, nuova versione pubblicata con `valid_from = dataVigenza`. Errori loggati,
legge saltata, nessun blocco delle altre.

### LLM

- `LlmProvider.embed(texts[]): Promise<number[][]>` su `/v1/embeddings`; config `LLM_EMBED_MODEL`
  (es. `bge-m3`, multilingue). Senza modello: ricerca solo full-text, stato visibile in
  `/llm/status`.

### Strumenti (assistente e MCP)

- `norme_cerca {domanda, data?, tipo?}` → fino a 8 passaggi con documento, estremi, articolo,
  vigenza, testo.
- `norme_articolo {documento, articolo, data?}` → testo completo dell'articolo vigente;
  `documento` = estremi o titolo (ricerca tollerante).
- Prompt di sistema: citare sempre estremi e articolo; per le leggi ricordare che il testo
  Normattiva non è ufficiale.

### Frontend

- «Norme e regolamenti» (tutti): elenco con filtro per tipo, ricerca, lettura per articolo con
  indice laterale, selettore della data di vigenza, avviso Normattiva.
- Admin: «Aggiungi legge» (URN/URL), «Carica regolamento» → editor Markdown a due colonne
  (testo / anteprima) con elenco degli articoli riconosciuti, poi «Pubblica». Storico versioni.

## Rilascio in più PR

1. docgen `POST /markdown` (pandoc, pypdfium2, euristica articoli) con test sui fixture.
2. normattiva-gateway con test su XML Akoma Ntoso salvati (nessuna rete in CI).
3. Backend: tabelle, upload/bozza/pubblicazione, chunk, embedding, ricerca, sync Normattiva.
4. Strumenti per assistente e MCP.
5. Frontend consultazione e admin.

## Aperti / da verificare

- Licenza e condizioni d'uso dei dati Normattiva e limiti di richieste: verificare prima della
  produzione.
- Il link `caricaAKN` non è documentato: se cambia, resta la strada open data.

## Scelte mie (correggibili)

- Originale in Postgres (bytea) e non su volume: un solo backup.
- Leggi pubblicate senza revisione; regolamenti sempre con revisione.
- PDF con pypdfium2 + euristica invece di PyMuPDF (AGPL).
- Ricerca esatta senza indice ANN; ibrida con RRF.
- Normattiva in un servizio separato per non dare rete a docgen.
- Aggiornamento leggi giornaliero alle 5.
