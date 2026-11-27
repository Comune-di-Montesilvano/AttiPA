import type { AuthResponse, OperatorRole } from '@attipa/shared-types';

/** Sessione operatore salvata nel browser dopo il login. */
export interface Session {
  token: string;
  username: string;
  displayName: string;
  role: OperatorRole;
  /** Scadenza del token (ms epoch). */
  expiresAt: number;
}

const KEY = 'attipa_session';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function sessionFromLogin(res: AuthResponse, now: number = Date.now()): Session {
  return {
    token: res.access_token,
    username: res.username,
    displayName: res.displayName,
    role: res.role,
    expiresAt: now + res.expires_in * 1000,
  };
}

/** Sessione salvata, null se assente, illeggibile o scaduta (che viene cancellata). */
export function loadSession(store: Store, now: number = Date.now()): Session | null {
  const raw = store.getItem(KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (typeof s.token === 'string' && s.token && typeof s.expiresAt === 'number' && s.expiresAt > now) return s;
  } catch {
    // valore corrotto: si cancella sotto
  }
  store.removeItem(KEY);
  return null;
}

export function saveSession(store: Store, s: Session): void {
  store.setItem(KEY, JSON.stringify(s));
}

export function clearSession(store: Store): void {
  store.removeItem(KEY);
}
