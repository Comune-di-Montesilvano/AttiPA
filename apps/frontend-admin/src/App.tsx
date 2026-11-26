import { useEffect, useState } from 'react';
import type { TinnInfo } from '@attipa/shared-types';
import { formatDateTime, getTinnInfo, getVersion } from './api';

export function App() {
  const [version, setVersion] = useState<string>('…');
  const [tinn, setTinn] = useState<TinnInfo | null>(null);
  const [tinnError, setTinnError] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then((v) => setVersion(v.version))
      .catch(() => setVersion('backend non raggiungibile'));
    getTinnInfo()
      .then(setTinn)
      .catch((e: unknown) => setTinnError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>AttiPA</h1>
      <p>Redazione assistita di atti amministrativi.</p>
      <h2>Contabilità Tinn</h2>
      {tinnError ? (
        <p role="alert">DB Tinn non disponibile: {tinnError}</p>
      ) : tinn ? (
        <dl>
          <dt>Backup del</dt>
          <dd>{formatDateTime(tinn.backupDate)}</dd>
          <dt>Ripristinato il</dt>
          <dd>{formatDateTime(tinn.restoredAt)}</dd>
        </dl>
      ) : (
        <p>Caricamento…</p>
      )}
      <footer style={{ marginTop: '3rem', color: '#666' }}>Versione {version}</footer>
    </main>
  );
}
