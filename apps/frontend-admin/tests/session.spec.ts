import { describe, expect, it } from 'vitest';
import { clearSession, loadSession, saveSession, sessionFromLogin } from '../src/session';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const res = {
  access_token: 'tok',
  token_type: 'Bearer' as const,
  expires_in: 3600,
  username: 'mrossi',
  displayName: 'Mario Rossi',
  role: 'user' as const,
};

describe('sessione', () => {
  it('scadenza dal login, salvata e riletta', () => {
    const store = memoryStore();
    const s = sessionFromLogin(res, 1_000);
    expect(s).toEqual({ token: 'tok', username: 'mrossi', displayName: 'Mario Rossi', role: 'user', expiresAt: 3_601_000 });
    saveSession(store, s);
    expect(loadSession(store, 2_000)).toEqual(s);
  });

  it('scaduta o corrotta → null e cancellata', () => {
    const store = memoryStore();
    saveSession(store, sessionFromLogin(res, 0));
    expect(loadSession(store, 3_600_000)).toBeNull();
    expect(store.data.size).toBe(0);
    store.setItem('attipa_session', '{non json');
    expect(loadSession(store)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('logout cancella', () => {
    const store = memoryStore();
    saveSession(store, sessionFromLogin(res));
    clearSession(store);
    expect(loadSession(store)).toBeNull();
  });
});
