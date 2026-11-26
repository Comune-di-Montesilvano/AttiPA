-- Impegni collegati a una proposta di determina: controllo prima dell'invio in Ragioneria.
-- Parametri: ANNO = esercizio, PROPOSTA = numero della proposta (NUMEROPROP).
-- Regole: esclusi annullati; importo valido = IMPORTO + V_VAR_P - V_VAR_N.
-- PDC = V livello scelto sull'impegno (AC_IDPDC), altrimenti quello del capitolo.
-- ESEC: 'P' provvisorio / 'E' esecutivo. PROVV = 1: spunta «Provvisorio» (PROV_NO_CONV).
-- NON_RIC = 1: «Non ricorrente». Il backup è notturno: le modifiche del giorno si vedono dal giorno dopo.
SELECT I.ANNO, I.NUMERAZIONE, I.PROGRESSIVO, I.CAPITOLO, I.ARTICOLO,
       TRIM(P.COD_PDC) AS PDC,
       ROUND(I.IMPORTO + I.V_VAR_P - I.V_VAR_N, 2) AS IMPORTO,
       I.CREDITORE, TRIM(A.RAGIONE_SOC) AS RAGIONE_SOC,
       TRIM(I.CODICE_CIG) AS CIG, TRIM(I.CODICE_CUP) AS CUP,
       I.TIPO_ESEC AS ESEC, I.PROV_NO_CONV AS PROVV, I.AC_NRICORR AS NON_RIC,
       I.TA_ANNO_PRATICA AS FTE_ANNO, I.TA_NUMERO_PRATICA AS FTE_NUM,
       TRIM(I.DESCRIZIONE) AS OGGETTO
FROM GFIMDEN1 I
LEFT JOIN GFANCON1 A ON A.CODICE = I.CREDITORE
LEFT JOIN GFBIPRN1 B ON B.ESERCIZIO = I.ESERCIZIO AND B.ANNO = I.ANNO AND B.TIPO = 'S'
                    AND B.CAPITOLO = I.CAPITOLO AND B.ARTICOLO = I.ARTICOLO
LEFT JOIN GFPIANOCONTI P ON P.ESERCIZIO = I.ESERCIZIO AND P.TIPO = 'S'
                        AND P.AC_IDPDC = COALESCE(NULLIF(I.AC_IDPDC, 0), B.AC_IDPDC)
WHERE I.ESERCIZIO = {ANNO}
  AND I.NUMEROPROP = {PROPOSTA}
  AND (I.ANNULLATO IS NULL OR I.ANNULLATO <> 'A')
ORDER BY I.NUMERAZIONE, I.PROGRESSIVO
