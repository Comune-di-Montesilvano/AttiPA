-- Impegni di competenza di un fornitore, con CIG ed estremi della determina.
-- Uso: verifica del contraente uscente (rotazione, art. 49 D.Lgs. 36/2023), storia dei contratti.
-- Parametri: FORNITORE = pattern LIKE sulla ragione sociale (maiuscolo, con % come jolly), DAL = primo anno.
-- Regole: solo competenza (ESERCIZIO = ANNO), esclusi annullati; importo valido = IMPORTO + V_VAR_P - V_VAR_N.
-- N_DELIBERA/D_DELIBERA = determina di settore; N_DELIBERA_OC/D_DELIBERA_OC = registro generale.
SELECT I.ANNO, I.ANNO_CREA, I.NUMERAZIONE, I.PROGRESSIVO,
       I.CAPITOLO, I.ARTICOLO, TRIM(I.CENTRO_RESP) AS SETTORE,
       ROUND(I.IMPORTO + I.V_VAR_P - I.V_VAR_N, 2) AS IMPORTO,
       TRIM(I.CODICE_CIG) AS CIG, TRIM(I.CODICE_CUP) AS CUP,
       I.N_DELIBERA AS DET_SETT, CAST(I.D_DELIBERA AS DATE) AS DATA_SETT,
       I.N_DELIBERA_OC AS DET_RG, CAST(I.D_DELIBERA_OC AS DATE) AS DATA_RG,
       TRIM(A.RAGIONE_SOC) AS FORNITORE, TRIM(I.DESCRIZIONE) AS OGGETTO
FROM GFIMDEN1 I
JOIN GFANCON1 A ON A.CODICE = I.CREDITORE
WHERE UPPER(A.RAGIONE_SOC) LIKE '{FORNITORE}'
  AND I.ESERCIZIO = I.ANNO
  AND I.ANNO >= {DAL}
  AND (I.ANNULLATO IS NULL OR I.ANNULLATO <> 'A')
ORDER BY I.ANNO, I.NUMERAZIONE, I.PROGRESSIVO
