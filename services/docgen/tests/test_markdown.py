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
