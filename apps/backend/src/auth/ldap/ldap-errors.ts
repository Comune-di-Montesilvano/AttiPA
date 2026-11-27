/** Sottocodici AD del bind fallito (`data <hex>` nel messaggio diagnostico). */
const AD_BIND_SUBCODES: Record<string, string> = {
  '525': 'utente non trovato',
  '52e': 'password errata',
  '530': 'accesso non consentito in questo orario',
  '531': 'accesso non consentito da questa postazione',
  '532': 'password scaduta',
  '533': 'account disabilitato',
  '701': 'account scaduto',
  '773': 'cambio password obbligatorio',
  '775': 'account bloccato',
};

/** Errore LDAP per il log, con la causa AD in chiaro quando il server la indica. */
export function describeLdapError(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const code = /\bdata ([0-9a-f]{3})\b/i.exec(text)?.[1]?.toLowerCase();
  const hint = code ? AD_BIND_SUBCODES[code] : undefined;
  return hint ? `${text} (AD: ${hint})` : text;
}
