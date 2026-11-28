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
