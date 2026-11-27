import { useEffect, useState, type FormEvent } from 'react';
import type { TinnInfo } from '@attipa/shared-types';
import { SESSION_EXPIRED_EVENT, formatDateTime, getTinnInfo, getVersion, login } from './api';
import { clearSession, loadSession, saveSession, sessionFromLogin, type Session } from './session';

const page = { fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '3rem auto', padding: '0 1rem' } as const;

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession(localStorage));
  const [version, setVersion] = useState<string>('…');

  useEffect(() => {
    getVersion()
      .then((v) => setVersion(v.version))
      .catch(() => setVersion('backend non raggiungibile'));
    const expired = () => setSession(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);

  const logout = () => {
    clearSession(localStorage);
    setSession(null);
  };

  return (
    <main style={page}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>AttiPA</h1>
        {session && (
          <span>
            {session.displayName}
            {session.role === 'admin' ? ' (amministratore)' : ''} ·{' '}
            <button type="button" onClick={logout}>
              Esci
            </button>
          </span>
        )}
      </header>
      {session ? <Home /> : <LoginForm onLogin={setSession} />}
      <footer style={{ marginTop: '3rem', color: '#666' }}>Versione {version}</footer>
    </main>
  );
}

function LoginForm({ onLogin }: { onLogin: (s: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = sessionFromLogin(await login(username.trim(), password));
      saveSession(localStorage, s);
      onLogin(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 320 }}>
      <p>Accedi con le credenziali di dominio del Comune.</p>
      <label>
        Utente
        <input name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required style={{ display: 'block', width: '100%' }} />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ display: 'block', width: '100%' }} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Accesso…' : 'Accedi'}
      </button>
    </form>
  );
}

function Home() {
  const [tinn, setTinn] = useState<TinnInfo | null>(null);
  const [tinnError, setTinnError] = useState<string | null>(null);

  useEffect(() => {
    getTinnInfo()
      .then(setTinn)
      .catch((e: unknown) => setTinnError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <>
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
    </>
  );
}
