import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InvalidCredentialsError } from 'ldapts';
import type { AppConfiguration } from '../../config/configuration.js';
import { LdapService, cnOf, groupByCnFilter, recursiveMembershipFilter, userLookupFilter } from './ldap.service.js';

// Solo il Client è finto: le classi filtro sono quelle vere di ldapts.
const client = {
  startTLS: vi.fn(),
  bind: vi.fn(),
  search: vi.fn(),
  unbind: vi.fn(),
};
vi.mock('ldapts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ldapts')>();
  return { ...actual, Client: vi.fn(function Client() { return client; }) };
});

type Ldap = AppConfiguration['ldap'];
const baseLdap: Ldap = {
  host: 'ldaps://dc.test.local:636',
  baseDn: 'DC=test,DC=local',
  userDnTemplate: '%s@test.local',
  tlsSkipVerify: false,
  startTls: false,
  requiredGroup: 'ATTIPA_USERS',
  adminGroup: 'ATTIPA_ADMINS',
  adminUsernames: [],
};

function service(ldap: Partial<Ldap> = {}): LdapService {
  const cfg = { ...baseLdap, ...ldap };
  return new LdapService({ get: () => cfg } as unknown as ConfigService<AppConfiguration, true>);
}

const entry = (memberOf: string[] | string, extra: Record<string, unknown> = {}) => ({
  dn: 'CN=Mario Rossi,OU=Utenti,DC=test,DC=local',
  sAMAccountName: 'MRossi',
  displayName: 'Mario Rossi',
  memberOf,
  ...extra,
});

/** Risposte di search in ordine: utente, poi eventuali gruppi e appartenenze annidate. */
function searches(...results: object[][]) {
  for (const r of results) client.search.mockResolvedValueOnce({ searchEntries: r, searchReferences: [] });
}

describe('LdapService', () => {
  beforeEach(() => {
    // mockReset svuota anche le code mockResolvedValueOnce rimaste dal test precedente.
    for (const fn of Object.values(client)) fn.mockReset();
    client.bind.mockResolvedValue(undefined);
    client.unbind.mockResolvedValue(undefined);
    client.startTLS.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  describe('mock (solo sviluppo)', () => {
    it('admin/admin e operator/operator, altro rifiutato, nessun collegamento', async () => {
      const s = service({ host: 'mock' });
      await expect(s.authenticate('admin', 'admin')).resolves.toMatchObject({ username: 'admin', role: 'admin' });
      await expect(s.authenticate('operator', 'operator')).resolves.toMatchObject({ username: 'operator', role: 'user' });
      await expect(s.authenticate('admin', 'x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(client.bind).not.toHaveBeenCalled();
    });

    it('LDAP_ADMIN_USERNAMES alza operator ad admin', async () => {
      await expect(service({ host: 'mock', adminUsernames: ['operator'] }).authenticate('operator', 'operator')).resolves.toMatchObject({
        role: 'admin',
      });
    });
  });

  it('senza host o base DN: 503, nessun collegamento', async () => {
    await expect(service({ host: '' }).authenticate('mario', 'pw')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service({ baseDn: '' }).authenticate('mario', 'pw')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(client.bind).not.toHaveBeenCalled();
  });

  it('bind con il template, gruppo utente diretto → user, username minuscolo', async () => {
    searches([entry(['CN=ATTIPA_USERS,OU=Gruppi,DC=test,DC=local'])], [], []);
    const user = await service().authenticate('mrossi', 'pw');
    expect(client.bind).toHaveBeenCalledWith('mrossi@test.local', 'pw');
    expect(user).toEqual({ username: 'mrossi', displayName: 'Mario Rossi', role: 'user' });
    expect(client.unbind).toHaveBeenCalled();
  });

  it('gruppo admin diretto (CN senza distinzione di maiuscole) → admin', async () => {
    searches([entry('CN=attipa_admins,OU=Gruppi,DC=test,DC=local')], [], []);
    await expect(service().authenticate('mrossi', 'pw')).resolves.toMatchObject({ role: 'admin' });
  });

  it('gruppo annidato trovato con LDAP_MATCHING_RULE_IN_CHAIN', async () => {
    const groupDn = 'CN=ATTIPA_USERS,OU=Gruppi,DC=test,DC=local';
    // utente senza memberOf utili → gruppo utenti (DN) → appartenenza ricorsiva sì → gruppo admin non trovato
    searches([entry([])], [{ dn: groupDn }], [{ dn: 'CN=Mario Rossi' }], []);
    await expect(service().authenticate('mrossi', 'pw')).resolves.toMatchObject({ role: 'user' });
    const nested = client.search.mock.calls[2]![1] as { filter: object };
    expect(nested.filter.toString()).toContain('1.2.840.113556.1.4.1941');
    expect(nested.filter.toString()).toContain(groupDn);
  });

  it('fuori dai gruppi → 401 anche se in LDAP_ADMIN_USERNAMES', async () => {
    searches([entry([])], [], []);
    await expect(service({ adminUsernames: ['mrossi'] }).authenticate('mrossi', 'pw')).rejects.toThrow(/gruppi AD/);
  });

  it('LDAP_ADMIN_USERNAMES alza il ruolo di un utente del gruppo', async () => {
    searches([entry(['CN=ATTIPA_USERS,DC=test,DC=local'])], [], []);
    await expect(service({ adminUsernames: ['mrossi'] }).authenticate('MRossi', 'pw')).resolves.toMatchObject({ role: 'admin' });
  });

  it('password errata (InvalidCredentialsError) → 401 generico, connessione chiusa', async () => {
    client.bind.mockRejectedValue(new InvalidCredentialsError('AcceptSecurityContext error, data 52e, v4563'));
    await expect(service().authenticate('mrossi', 'pw')).rejects.toThrow(new UnauthorizedException('Credenziali non valide'));
    expect(client.unbind).toHaveBeenCalled();
  });

  it('AD irraggiungibile → 503', async () => {
    client.bind.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(service().authenticate('mrossi', 'pw')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('utente non trovato dopo il bind → 401', async () => {
    searches([]);
    await expect(service().authenticate('mrossi', 'pw')).rejects.toThrow(/non trovato/);
  });

  it('STARTTLS prima del bind se richiesto', async () => {
    searches([entry(['CN=ATTIPA_USERS,DC=x'])], [], []);
    await service({ host: 'ldap://dc:389', startTls: true }).authenticate('mrossi', 'pw');
    expect(client.startTLS).toHaveBeenCalledWith({ rejectUnauthorized: true });
    expect(client.startTLS.mock.invocationCallOrder[0]).toBeLessThan(client.bind.mock.invocationCallOrder[0]!);
  });
});

describe('filtri LDAP', () => {
  it('i valori con caratteri speciali restano valori, non struttura del filtro', () => {
    const f = userLookupFilter('a)(cn=*');
    expect(f.filters).toHaveLength(2);
    expect(f.toString()).toBe('(|(sAMAccountName=a\\29\\28cn=\\2a)(userPrincipalName=a\\29\\28cn=\\2a))');
  });

  it('gruppo per CN e appartenenza ricorsiva', () => {
    expect(groupByCnFilter('Ufficio (IT)').toString()).toBe('(&(objectClass=group)(cn=Ufficio \\28IT\\29))');
    expect(recursiveMembershipFilter('mario', 'CN=G,DC=x').filters).toHaveLength(2);
  });

  it('cnOf legge il primo RDN, anche con virgole escapate', () => {
    expect(cnOf('CN=ATTIPA_USERS,OU=Gruppi,DC=test')).toBe('ATTIPA_USERS');
    expect(cnOf('CN=Rossi\\, Mario,OU=Utenti')).toBe('Rossi, Mario');
    expect(cnOf('OU=strano')).toBe('OU=strano');
  });
});
