# docgen `POST /markdown` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** docgen converte un file caricato (DOCX, ODT, RTF, DOC, HTML, PDF con testo) in Markdown normalizzato con titoli di capi e articoli, primo passo dell'import di regolamenti (PR 1 di 5).

**Architecture:** nuovo endpoint in `services/docgen/app/main.py`. DOCX/ODT/HTML → pandoc; RTF/DOC → LibreOffice in DOCX → pandoc; PDF → pypdfium2 + ricucitura righe. Tutti i percorsi finiscono in `normalize()` che riconosce Parte/Titolo/Capo/Sezione/Art. e fissa i livelli dei titoli. docgen resta senza rete.

**Tech Stack:** Python 3.15, FastAPI, pandoc 3.14 (release ufficiale .deb amd64), pypdfium2, LibreOffice headless, pytest.

**Spec:** `docs/superpowers/specs/2026-11-28-norme-regolamenti-design.md` (sezione «docgen: `POST /markdown`»).

## Global Constraints

- Licenze compatibili con EUPL 1.2: niente PyMuPDF/pymupdf4llm (AGPL).
- Dipendenze Python solo da `requirements.in` → `requirements.txt` con hash (pip-compile, comando in CLAUDE.md «Dipendenze Python»).
- Binari esterni con `ADD --checksum=sha256:` nei Dockerfile (come corepack); `Dockerfile` e `Dockerfile.dev` allineati (i test CI girano nell'immagine dev).
- Nome del file caricato mai nella riga di comando: nome fisso `documento<ext>` nella cartella temporanea.
- Limite 20 MB (`MAX_BYTES` esistente); timeout `DOCGEN_TIMEOUT` per ogni processo esterno.
- Livelli dei titoli: `#` titolo del documento, `##` Parte/Libro/Titolo/Capo, `###` Sezione e altri titoli, `####` articolo.
- Messaggi d'errore in italiano.

## Review Focus

- DOCX dove gli articoli sono paragrafi in grassetto (`**Art. 1 – Oggetto**`) e non stili Titolo: devono diventare `####` (test in Task 1).
- Titolo dell'articolo sulla riga dopo («Art. 3» a capo «Oggetto»): unito nel titolo, ma non se la riga dopo è il comma «1. Il presente…» (Task 1).
- PDF con intestazione/piè di pagina ripetuti e numeri di pagina: tolti, senza perdere righe vere ripetute una volta sola (Task 2).
- PDF scansionato (nessun testo): 422 «PDF senza testo (scansione?)», non Markdown vuoto (Task 3).
- Riferimenti interni nel testo («ai sensi dell'art. 5») non devono diventare titoli: solo a inizio riga e riga breve (Task 1).

---

### Task 1: Normalizzazione del Markdown

**Files:**
- Create: `services/docgen/app/markdown.py`
- Test: `services/docgen/tests/test_markdown.py`

**Interfaces:**
- Produces: `normalize(md: str) -> tuple[str, list[str]]` (Markdown normalizzato, avvisi). `ARTICLE_RE` esportata per Task 2.

Regole:
- Prima del riconoscimento ogni riga viene «spogliata»: tolti `#` iniziali, `**`/`__` che la racchiudono, spazi.
- Articolo: `^(Art\.|Articolo)\s*(\d+)(?:\s*[-‐–]?\s*(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?\s*[.:–—-]?\s*(.*)$` (case-insensitive), riga spogliata ≤ 200 caratteri → `#### Art. N[-suffisso][ – Titolo]`.
- Titolo dell'articolo sulla riga non vuota successiva se l'articolo non ne ha, la riga è ≤ 120 caratteri, non finisce con `.` o `;` e non inizia con `\d+\.` o `[a-z]\)`; quella riga viene consumata.
- `^(PARTE|LIBRO|TITOLO|CAPO)\s+([IVXLCDM]+|\d+)\b\s*[.:–—-]?\s*(.*)$` (case-insensitive, ≤ 200 car.) → `## Capo II – Titolo` (parola con iniziale maiuscola, numero come scritto). Stesso aggancio del titolo sulla riga dopo.
- `^SEZIONE\s+([IVXLCDM]+|\d+)…` → `###`.
- Altri titoli Markdown già presenti: il primo prima di qualunque titolo strutturale → `#`; gli altri → `###`.
- Immagini (`![…](…)`) rimosse; più di una riga vuota consecutiva → una.
- Avviso `nessun articolo riconosciuto` se zero `####`.

- [ ] **Step 1: Write the failing tests**

```python
from app.markdown import normalize

def test_articolo_in_grassetto_con_titolo():
    md, w = normalize('**Art. 1 – Oggetto**\n\n1. Il presente regolamento disciplina.')
    assert md.startswith('#### Art. 1 – Oggetto\n')
    assert w == []

def test_titolo_sulla_riga_dopo_e_bis():
    md, _ = normalize('Articolo 3 bis\nDefinizioni\n1. Ai fini del presente.')
    assert '#### Art. 3-bis – Definizioni' in md
    assert '1. Ai fini del presente.' in md

def test_comma_non_diventa_titolo():
    md, _ = normalize('Art. 2\n1. Il RUP è nominato.')
    assert '#### Art. 2\n' in md and '1. Il RUP è nominato.' in md

def test_capo_sezione_e_titolo_documento():
    md, _ = normalize('# Regolamento incentivi\n\nCAPO II - Disposizioni\n\nSezione I\n\nArt. 4. Fondo')
    assert md.splitlines()[0] == '# Regolamento incentivi'
    assert '## Capo II – Disposizioni' in md
    assert '### Sezione I' in md
    assert '#### Art. 4 – Fondo' in md

def test_riferimenti_nel_testo_non_titoli():
    md, w = normalize('Ai sensi dell\'art. 5 del presente regolamento.')
    assert '####' not in md
    assert w == ['nessun articolo riconosciuto']

def test_immagini_e_righe_vuote():
    md, _ = normalize('Art. 1\n\n\n\n![logo](media/a.png)\n\nTesto.')
    assert '![' not in md and '\n\n\n' not in md
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T docgen python -m pytest tests/test_markdown.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.markdown'`

- [ ] **Step 3: Implement `normalize` in `services/docgen/app/markdown.py`** secondo le regole sopra (scansione riga per riga, solo `re`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T docgen python -m pytest tests/test_markdown.py -q`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add services/docgen/app/markdown.py services/docgen/tests/test_markdown.py
git commit -m "feat(docgen): normalizzazione Markdown con titoli di capi e articoli"
```

### Task 2: Testo dai PDF

**Files:**
- Create: `services/docgen/app/pdf.py`
- Modify: `services/docgen/requirements.in` (aggiungi `pypdfium2`), `services/docgen/requirements.txt` (pip-compile)
- Test: `services/docgen/tests/test_pdf.py`

**Interfaces:**
- Consumes: `ARTICLE_RE` da Task 1 (riga strutturale = sempre paragrafo a sé).
- Produces: `pdf_pages(path: str) -> list[str]` (testo per pagina, pypdfium2 `get_textpage().get_text_range()`); `pages_to_text(pages: list[str]) -> str`.

Regole di `pages_to_text`:
- Righe di testata/piè: tra le prime 3 e le ultime 3 righe di ogni pagina, la riga con cifre sostituite da `#` che compare in ≥ 50% delle pagine (minimo 3 pagine) viene tolta ovunque.
- Numeri di pagina soli `^\s*(pag\.?\s*)?\d+(\s*(/|di)\s*\d+)?\s*$` (case-insensitive) tolti.
- Ricucitura: riga che finisce con `-` seguita da riga che inizia minuscola → parola unita senza trattino; riga che non finisce con `.:;!?` seguita da riga che inizia minuscola → unite con spazio; altrimenti nuovo paragrafo (riga vuota). Righe strutturali (articolo, capo…) ed elenchi `^\d+\.\s`, `^[a-z]\)\s` iniziano sempre un paragrafo.

- [ ] **Step 1: Aggiungi `pypdfium2` a `requirements.in` e rigenera `requirements.txt`** con il comando pip-compile di CLAUDE.md; poi `docker compose build docgen && docker compose up -d docgen`.

- [ ] **Step 2: Write the failing tests** (`pages_to_text` su liste di stringhe, senza PDF)

```python
from app.pdf import pages_to_text

def test_testata_e_numeri_pagina():
    pages = [f'Comune di Montesilvano\nArt. {i}\nTesto {i}.\nPag. {i} di 4' for i in range(1, 5)]
    t = pages_to_text(pages)
    assert 'Comune di Montesilvano' not in t and 'Pag.' not in t
    assert 'Art. 3' in t

def test_riga_ripetuta_una_volta_resta():
    t = pages_to_text(['Premessa\nA.', 'B.', 'C.'])
    assert 'Premessa' in t

def test_ricucitura_e_trattino():
    t = pages_to_text(['Il responsabile del procedi-\nmento è nominato\ndal dirigente.\n1. Secondo comma.'])
    assert 'Il responsabile del procedimento è nominato dal dirigente.' in t
    assert '\n\n1. Secondo comma.' in t
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose exec -T docgen python -m pytest tests/test_pdf.py -q`
Expected: FAIL, `No module named 'app.pdf'`

- [ ] **Step 4: Implement `pdf_pages` e `pages_to_text` in `services/docgen/app/pdf.py`**

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec -T docgen python -m pytest tests/test_pdf.py -q`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add services/docgen/app/pdf.py services/docgen/tests/test_pdf.py services/docgen/requirements.in services/docgen/requirements.txt
git commit -m "feat(docgen): estrazione e ricucitura del testo dei PDF con pypdfium2"
```

### Task 3: Endpoint `POST /markdown`, pandoc nell'immagine, documentazione

**Files:**
- Modify: `services/docgen/app/main.py`, `services/docgen/Dockerfile`, `services/docgen/Dockerfile.dev`, `.github/workflows/toolchain-version-check.yml`, `CLAUDE.md` (sezione docgen), `docs/superpowers/specs/2026-11-28-norme-regolamenti-design.md` (nessuna modifica attesa; solo se cambia qualcosa)
- Test: `services/docgen/tests/test_markdown_api.py`

**Interfaces:**
- Consumes: `normalize` (Task 1), `pdf_pages`, `pages_to_text` (Task 2), `convert_file(src, target, workdir)` esistente.
- Produces: `POST /markdown` multipart `file` → 200 `{"markdown": str, "warnings": list[str]}`; 400 formato non ammesso; 413 oltre 20 MB; 422 conversione fallita o PDF senza testo (`detail` = «PDF senza testo (scansione?)»). Estensioni: `.docx .odt .rtf .doc .html .htm .pdf`. Usato dal backend nella PR 3.

Percorsi:
- `.docx/.odt/.html/.htm` → `pandoc --from docx|odt|html --to gfm --wrap=none -o documento.md documento<ext>` (subprocess, timeout `TIMEOUT`).
- `.rtf/.doc` → `convert_file(src, 'docx', work)` poi pandoc.
- `.pdf` → `pdf_pages`; se la somma dei caratteri non spazio < 50 → 422; avviso `N pagine senza testo` se alcune pagine sono vuote; `pages_to_text` poi `normalize`.

- [ ] **Step 1: pandoc 3.14 in entrambi i Dockerfile**: `ADD --checksum=sha256:<sha256 calcolato del file> https://github.com/jgm/pandoc/releases/download/3.14/pandoc-3.14-1-amd64.deb /tmp/pandoc.deb`, poi `dpkg -i /tmp/pandoc.deb && rm /tmp/pandoc.deb` nello stesso `RUN` dell'apt. Rebuild: `docker compose build docgen && docker compose up -d docgen`; verifica `docker compose exec -T docgen pandoc --version` → `pandoc 3.14`.

- [ ] **Step 2: Write the failing tests** (fixture generati a runtime: RTF già nei test esistenti → DOCX/PDF con `convert_file`)

```python
RTF_REG = (rb'{\rtf1\ansi\deff0 {\fonttbl {\f0 Liberation Serif;}} \f0 '
           rb'{\b Art. 1 - Oggetto}\par 1. Il presente regolamento disciplina gli incentivi.\par '
           rb'{\b Art. 2 - Fondo}\par 1. Il fondo \u232? pari al 2 per cento.\par}')

def test_rtf_in_markdown():
    r = client.post('/markdown', files={'file': ('reg.rtf', RTF_REG)})
    assert r.status_code == 200, r.text
    md = r.json()['markdown']
    assert '#### Art. 1 – Oggetto' in md and '#### Art. 2 – Fondo' in md
    assert 'è pari al 2 per cento' in md
    assert r.json()['warnings'] == []

def _da_rtf(tmp_path, rtf, target):
    src = tmp_path / 'documento.rtf'
    src.write_bytes(rtf)
    return open(convert_file(str(src), target, str(tmp_path)), 'rb').read()

@pytest.mark.parametrize('target', ['docx', 'pdf'])
def test_docx_e_pdf(tmp_path, target):
    r = client.post('/markdown', files={'file': ('reg.' + target, _da_rtf(tmp_path, RTF_REG, target))})
    assert r.status_code == 200, r.text
    assert '#### Art. 2 – Fondo' in r.json()['markdown']

def test_html():
    r = client.post('/markdown', files={'file': ('a.html', b'<h1>Regolamento</h1><p><b>Art. 1</b></p><p>Oggetto</p><p>1. Testo.</p>')})
    assert r.json()['markdown'].startswith('# Regolamento\n')
    assert '#### Art. 1 – Oggetto' in r.json()['markdown']

def test_pdf_senza_testo(tmp_path):
    pdf = _da_rtf(tmp_path, rb'{\rtf1\ansi \par}', 'pdf')
    r = client.post('/markdown', files={'file': ('vuoto.pdf', pdf)})
    assert r.status_code == 422 and r.json()['detail'] == 'PDF senza testo (scansione?)'

def test_formato_e_dimensione():
    assert client.post('/markdown', files={'file': ('a.exe', b'x')}).status_code == 400
    assert client.post('/markdown', files={'file': ('a.rtf', b'x' * (20 * 1024 * 1024 + 1))}).status_code == 413
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose exec -T docgen python -m pytest tests/test_markdown_api.py -q`
Expected: FAIL, 404 su `/markdown`

- [ ] **Step 4: Implement `POST /markdown` in `main.py`** riusando lettura/limite/cartella temporanea di `/convert` (estrarre un helper comune `_save_upload(file, allowed) -> (work, src, ext)` se serve a non duplicare).

- [ ] **Step 5: Run all docgen tests**

Run: `docker compose exec -T docgen python -m pytest -q`
Expected: tutti passed (esistenti + 6 + 3 + 6)

- [ ] **Step 6: Version check di pandoc**: in `toolchain-version-check.yml` aggiungi `pandoc` alla matrice con un ramo che legge l'ultima release da `https://api.github.com/repos/jgm/pandoc/releases/latest` (`tag_name`) e la versione fissata da `pandoc-X.Y[.Z]-1-amd64.deb` in `services/docgen/Dockerfile*`; stesso testo d'issue degli altri strumenti.

- [ ] **Step 7: CLAUDE.md**: nella sezione docgen aggiungi `POST /markdown` (formati, percorsi, livelli dei titoli, 422 PDF senza testo, pandoc fissato con checksum).

- [ ] **Step 8: Build di produzione e smoke**

Run: `docker build -f services/docgen/Dockerfile -t ghcr.io/comune-di-montesilvano/attipa-docgen:smoke .` poi lo smoke dello stack (comando in memoria di progetto: `scripts/smoke-stack.sh` con `ADMIN_PORT=3300`).
Expected: build ok, smoke tutto OK.

- [ ] **Step 9: Commit, PR, merge automatico**

```bash
git add -A
git commit -m "feat(docgen): POST /markdown per importare documenti come Markdown"
gh pr create -R Comune-di-Montesilvano/AttiPA ...
gh pr merge <n> -R Comune-di-Montesilvano/AttiPA
```

## Piani successivi (uno per PR, dopo il merge di questa)

2. normattiva-gateway. 3. Backend `norme` (tabelle, bozze, pubblicazione, chunk, embedding, ricerca, sync). 4. Strumenti assistente/MCP. 5. Frontend.
