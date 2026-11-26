## Cosa cambia

<!-- Descrizione breve del cambiamento e perché serve -->

## Come è stato testato

<!-- Comandi eseguiti, ambiente (locale/CI), esito -->

## Checklist

- [ ] `pnpm build` passa (stesso comando usato nelle immagini Docker)
- [ ] `pnpm lint` passa
- [ ] `pnpm test` e pytest dei servizi toccati passano (o CI verde su questa PR)
- [ ] Nuova funzionalità o bugfix coperti da test automatici (bugfix: test di regressione), oppure motivato sopra perché no
- [ ] Se ho toccato un `package.json`, ho aggiornato `pnpm-lock.yaml`; se ho toccato un `requirements.in`, ho rigenerato `requirements.txt` con pip-compile
- [ ] Nessun dato reale (creditori, importi di pratiche, CF) in codice, test o descrizione
