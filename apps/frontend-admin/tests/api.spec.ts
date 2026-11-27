import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SESSION_EXPIRED_EVENT, apiBase, formatDateTime, getTinnInfo, login, loginErrorMessage, revokeToken } from '../src/api';
import { saveSession } from '../src/session';

describe('apiBase', () => {
  it('default /api senza config runtime', () => {
    expect(apiBase(undefined)).toBe('/api');
  });

  it('toglie lo slash finale', () => {
    expect(apiBase({ apiBase: 'http://localhost:8080/', sentryDsn: '', sentryEnvironment: '' })).toBe(
      'http://localhost:8080',
    );
  });
});

describe('formatDateTime', () => {
  it('null → mai', () => {
    expect(formatDateTime(null)).toBe('mai');
  });

  it('data in formato italiano, ora di Roma', () => {
    expect(formatDateTime('2026-11-26T03:54:00Z')).toBe('26/11/26, 04:54');
  });
});

describe('loginErrorMessage', () => {
  it('messaggi per l\'utente', () => {
    expect(loginErrorMessage(new ApiError(401, 'Credenziali non valide'))).toBe('Credenziali non valide');
    expect(loginErrorMessage(new ApiError(401, 'Utente non trovato in Active Directory'))).toBe('Credenziali non valide');
    expect(loginErrorMessage(new ApiError(401, 'Accesso non autorizzato: utente fuori dai gruppi AD di AttiPA'))).toMatch(/gruppi AD/);
    expect(loginErrorMessage(new ApiError(400, 'Username non valido'))).toBe('Username non valido');
    expect(loginErrorMessage(new ApiError(503, 'Active Directory non raggiungibile'))).toBe('Active Directory non raggiungibile');
    expect(loginErrorMessage(new ApiError(500, 'boom'))).toBe('Errore del server (500)');
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toBe('Server non raggiungibile');
  });
});

/** localStorage e window minimi per l'ambiente node dei test. */
function browser() {
  const data = new Map<string, string>();
  const events: string[] = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  vi.stubGlobal('window', { __ATTIPA_CONFIG__: undefined, dispatchEvent: (e: Event) => events.push(e.type) });
  return { data, events };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('richieste al backend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('token della sessione nell\'header Authorization', async () => {
    browser();
    saveSession(localStorage, { token: 'tok', username: 'm', displayName: 'M', role: 'user', expiresAt: Date.now() + 60_000 });
    const fetchMock = vi.fn().mockResolvedValue(json(200, { backupDate: null, restoredAt: null }));
    vi.stubGlobal('fetch', fetchMock);
    await getTinnInfo();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/tinn/info');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('revoca token: DELETE con id codificato, 204 senza corpo', async () => {
    browser();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(revokeToken('a/b')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/tokens/a%2Fb');
    expect(init.method).toBe('DELETE');
  });

  it('401 con sessione: sessione cancellata ed evento di scadenza', async () => {
    const { data, events } = browser();
    saveSession(localStorage, { token: 'tok', username: 'm', displayName: 'M', role: 'user', expiresAt: Date.now() + 60_000 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { message: 'Unauthorized' })));
    await expect(getTinnInfo()).rejects.toBeInstanceOf(ApiError);
    expect(data.size).toBe(0);
    expect(events).toEqual([SESSION_EXPIRED_EVENT]);
  });

  it('login: POST JSON senza token, errore tradotto', async () => {
    const { events } = browser();
    const fetchMock = vi.fn().mockResolvedValue(json(401, { message: 'Credenziali non valide' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(login('mario', 'x')).rejects.toThrow('Credenziali non valide');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ username: 'mario', password: 'x' });
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
    // Senza sessione un 401 non è una scadenza.
    expect(events).toEqual([]);
  });
});
