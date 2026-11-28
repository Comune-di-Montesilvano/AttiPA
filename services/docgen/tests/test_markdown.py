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
    md, w = normalize("Ai sensi dell'art. 5 del presente regolamento.")
    assert '####' not in md
    assert w == ['nessun articolo riconosciuto']


def test_immagini_e_righe_vuote():
    md, _ = normalize('Art. 1\n\n\n\n![logo](media/a.png)\n\nTesto.')
    assert '![' not in md and '\n\n\n' not in md


def test_escape_di_pandoc_su_commi_ed_elenchi():
    md, _ = normalize('Art. 2\n\n1\\. Il fondo è costituito da:\n\na\\) prima voce;')
    assert '#### Art. 2\n' in md
    assert '1. Il fondo è costituito da:' in md and 'a) prima voce;' in md


def test_richiami_a_inizio_riga_non_titoli():
    for riga in ('Art. 183, comma 3, del D.Lgs. 267/2000 prevede.',
                 'art. 45 D.Lgs. 36/2023 dispone che.',
                 'Art. 45 TUEL e successive modifiche'):
        md, _ = normalize(riga)
        assert '####' not in md, riga


def test_titoli_ammessi():
    md, _ = normalize('Art. 1 (Oggetto)\n\nArt. 2 - finalità\n\nArt. 3 Definizioni')
    assert '#### Art. 1 – Oggetto' in md
    assert '#### Art. 2 – finalità' in md
    assert '#### Art. 3 – Definizioni' in md


def test_numeri_romani_solo_maiuscoli():
    md, _ = normalize('Capo di Gabinetto\n\nSezione di Pescara\n\nCapo II')
    assert '## Capo DI' not in md and '### Sezione DI' not in md
    assert '## Capo II' in md


def test_riga_dopo_non_titolo_se_frase_o_tabella():
    md, _ = normalize('Art. 4\n\nAi fini del presente regolamento si intende per:\n\na) RUP;')
    assert '#### Art. 4\n' in md
    md, _ = normalize('Art. 7\n\n| Fascia | % |\n|---|---|\n| A | 2 |')
    assert '#### Art. 7\n' in md and '| Fascia | % |' in md
    md, _ = normalize('Art. 8\n\nil fondo è unico')
    assert '#### Art. 8\n' in md
