import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ApiTokensResponse, CreatedApiToken } from '@attipa/shared-types';
import { apiBase, createToken, formatDateTime, listTokens, revokeToken } from './api';
import { claudeCodeCommand, mcpEndpoint, tokenState } from './mcp-format';

const code = { display: 'block', background: '#f6f6f6', padding: '0.5rem', overflowX: 'auto', whiteSpace: 'pre' } as const;

/** Token personali per usare gli strumenti di AttiPA da un client MCP (Claude Code, Claude Desktop…). */
export function McpTokens() {
  const [data, setData] = useState<ApiTokensResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState(30);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listTokens()
      .then((d) => {
        setData(d);
        setDays((cur) => Math.min(cur, d.maxDays));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  if (!data) return error ? <p role="alert">{error}</p> : null;
  if (!data.mcpEnabled) return null;

  const url = mcpEndpoint(data.mcpUrl, apiBase(window.__ATTIPA_CONFIG__), window.location.origin);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCreated(await createToken(name.trim(), days));
      setName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    if (!window.confirm('Revocare il token? I client che lo usano smetteranno di funzionare.')) return;
    try {
      await revokeToken(id);
      if (created?.id === id) setCreated(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section>
      <h2>Accesso da client MCP</h2>
      <p style={{ fontSize: '0.9rem' }}>
        Un token personale permette a un client MCP (Claude Code, Claude Desktop, altri) di leggere la contabilità Tinn con i tuoi
        permessi. <strong>I dati, anche personali, passano al modello del client</strong>: usalo solo con servizi autorizzati
        dall&apos;ente.
      </p>
      <p>
        Endpoint: <code>{url}</code>
      </p>
      {error && <p role="alert">{error}</p>}
      {created && (
        <div role="status" style={{ border: '1px solid #c90', padding: '0.5rem', margin: '0.5rem 0' }}>
          <p>
            <strong>Copia ora il token «{created.name}»: non sarà più mostrato.</strong>
          </p>
          <code style={code}>{created.token}</code>
          <p>Claude Code:</p>
          <code style={code}>{claudeCodeCommand(url, created.token)}</code>
          <button type="button" onClick={() => setCreated(null)}>
            Ho copiato il token
          </button>
        </div>
      )}
      <form onSubmit={onCreate} style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', flexWrap: 'wrap' }}>
        <label>
          Nome
          <br />
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="es. Claude Code portatile" required />
        </label>
        <label>
          Giorni
          <br />
          <input type="number" min={1} max={data.maxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: '5rem' }} />
        </label>
        <button type="submit" disabled={busy || !name.trim()}>
          Crea token
        </button>
      </form>
      {data.tokens.length > 0 && (
        <table style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th align="left">Nome</th>
              <th align="left">Token</th>
              <th align="left">Scade</th>
              <th align="left">Ultimo uso</th>
              <th align="left">Stato</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.tokens.map((t) => {
              const state = tokenState(t);
              return (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <code>{t.prefix}…</code>
                  </td>
                  <td>{formatDateTime(t.expiresAt)}</td>
                  <td>{formatDateTime(t.lastUsedAt)}</td>
                  <td>{state}</td>
                  <td>
                    {state === 'attivo' && (
                      <button type="button" onClick={() => void onRevoke(t.id)}>
                        Revoca
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
