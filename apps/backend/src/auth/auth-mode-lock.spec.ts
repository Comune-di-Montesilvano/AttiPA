import { describe, expect, it, vi } from 'vitest';
import { AUTH_REAL_SEEN_KEY, AuthModeLockError, enforceAuthModeLock } from './auth-mode-lock.js';

function makeRepo(initial: Record<string, unknown> = {}) {
  const rows = new Map<string, unknown>(Object.entries(initial));
  let pending: Record<string, unknown> = {};
  // Insert ... ON CONFLICT DO NOTHING: la riga esistente non cambia.
  const qb = {
    insert: () => qb,
    into: () => qb,
    values: (v: Record<string, unknown>) => {
      pending = v;
      return qb;
    },
    orIgnore: () => qb,
    execute: async () => {
      const key = String(pending['key']);
      if (!rows.has(key)) rows.set(key, pending['value']);
      return {};
    },
  };
  const repo = {
    findOneBy: vi.fn(async ({ key }: { key: string }) => (rows.has(key) ? { key, value: rows.get(key) } : null)),
    createQueryBuilder: vi.fn(() => qb),
  };
  return { repo, rows };
}

describe('enforceAuthModeLock', () => {
  const now = new Date('2026-11-27T08:00:00.000Z');

  it('mock senza marker: avvio consentito, nessuna scrittura', async () => {
    const { repo, rows } = makeRepo();
    await expect(enforceAuthModeLock('mock', repo as never, now)).resolves.toBe('mock');
    expect(rows.size).toBe(0);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('mock dopo un avvio reale: rifiutato', async () => {
    const { repo } = makeRepo({ [AUTH_REAL_SEEN_KEY]: '2026-01-01T00:00:00.000Z' });
    await expect(enforceAuthModeLock('mock', repo as never, now)).rejects.toThrow(AuthModeLockError);
    await expect(enforceAuthModeLock('mock', repo as never, now)).rejects.toThrow(/LDAP_HOST=mock rifiutato/);
  });

  it('mock con DB illeggibile: rifiutato', async () => {
    const { repo } = makeRepo();
    repo.findOneBy.mockRejectedValueOnce(new Error('relation does not exist'));
    await expect(enforceAuthModeLock('mock', repo as never, now)).rejects.toThrow(/relation does not exist/);
  });

  it('LDAP reale: scrive il marker una volta sola (primo timestamp)', async () => {
    const { repo, rows } = makeRepo();
    await expect(enforceAuthModeLock('ldaps://dc:636', repo as never, now)).resolves.toBe('real');
    await enforceAuthModeLock('ldaps://dc:636', repo as never, new Date('2027-01-01T00:00:00.000Z'));
    expect(rows.get(AUTH_REAL_SEEN_KEY)).toBe(now.toISOString());
  });
});
