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


def test_ricucitura_anche_con_maiuscola():
    t = pages_to_text(['Il fondo è ripartito dal\nDirigente del Settore entro il\n31 dicembre di ogni anno.'])
    assert t == 'Il fondo è ripartito dal Dirigente del Settore entro il 31 dicembre di ogni anno.'


def test_titolo_su_riga_propria_non_assorbe_il_testo():
    t = pages_to_text(['Art. 3\nOggetto\nIl presente regolamento disciplina.'])
    assert t == 'Art. 3\n\nOggetto\n\nIl presente regolamento disciplina.'


def test_numeri_nel_mezzo_della_pagina_restano():
    page = 'Titolo pagina\nRiga due.\nRiga tre.\nRUP\n47\nDEC\n23\nTotale\n100\nRiga dieci.\nRiga undici.\nRiga dodici.\n7'
    t = pages_to_text([page])
    assert '47' in t and '23' in t and '100' in t
    assert not t.rstrip().endswith('7')


def test_pdf_solo_timbro_di_firma_e_senza_testo():
    import pytest
    from app.pdf import pdf_markdown, NO_TEXT
    pages = ['Documento firmato digitalmente da Mario Rossi il 0%d/11/2025' % i for i in range(1, 5)]
    with pytest.raises(RuntimeError, match=NO_TEXT.replace('(', r'\(').replace(')', r'\)').replace('?', r'\?')):
        pdf_markdown(pages)
