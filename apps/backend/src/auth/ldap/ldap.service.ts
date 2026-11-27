import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AndFilter, Client, EqualityFilter, ExtensibleFilter, InvalidCredentialsError, OrFilter, type Entry } from 'ldapts';
import type { OperatorRole } from '@attipa/shared-types';
import type { AppConfiguration } from '../../config/configuration.js';
import { describeLdapError } from './ldap-errors.js';

export interface LdapUser {
  /** sAMAccountName in minuscolo. */
  username: string;
  displayName: string;
  role: OperatorRole;
}

/*
 * Filtri come oggetti ldapts, mai come stringhe: ogni valore va sul filo come octet
 * string BER a sé, quindi nessun input (username, DN di gruppo) altera la struttura
 * del filtro. Lo username è comunque limitato a [A-Za-z0-9._@-] da LoginDto, perché
 * finisce anche nel DN/UPN del bind.
 */

/** `(|(sAMAccountName=<u>)(userPrincipalName=<u>))` */
export function userLookupFilter(username: string): OrFilter {
  return new OrFilter({
    filters: [
      new EqualityFilter({ attribute: 'sAMAccountName', value: username }),
      new EqualityFilter({ attribute: 'userPrincipalName', value: username }),
    ],
  });
}

/** Utente membro di `groupDn` anche tramite gruppi annidati (LDAP_MATCHING_RULE_IN_CHAIN di AD). */
export function recursiveMembershipFilter(username: string, groupDn: string): AndFilter {
  return new AndFilter({
    filters: [
      userLookupFilter(username),
      new ExtensibleFilter({ matchType: 'memberOf', rule: '1.2.840.113556.1.4.1941', value: groupDn }),
    ],
  });
}

/** `(&(objectClass=group)(cn=<cn>))` */
export function groupByCnFilter(cn: string): AndFilter {
  return new AndFilter({
    filters: [
      new EqualityFilter({ attribute: 'objectClass', value: 'group' }),
      new EqualityFilter({ attribute: 'cn', value: cn }),
    ],
  });
}

/** CN del primo RDN di un DN (`CN=Ufficio,OU=...` → `Ufficio`). */
export function cnOf(dn: string): string {
  return /^CN=((?:\\.|[^,])+)/i.exec(dn)?.[1]?.replace(/\\(.)/g, '$1') ?? dn;
}

function text(value: Entry[string] | undefined): string {
  if (value === undefined) return '';
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined ? '' : first.toString();
}

function list(value: Entry[string] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => v.toString());
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  async authenticate(username: string, password: string): Promise<LdapUser> {
    const ldap = this.config.get('ldap', { infer: true });
    const forcedAdmin = ldap.adminUsernames.includes(username.toLowerCase());

    // Credenziali simulate SOLO in sviluppo (LDAP_HOST=mock, bloccato da auth-mode-lock
    // su un'istanza che ha già visto LDAP reale). Con un host reale nessun bypass.
    if (ldap.host === 'mock') {
      if (username === 'admin' && password === 'admin') {
        return { username: 'admin', displayName: 'Amministratore Simulato', role: 'admin' };
      }
      if (username === 'operator' && password === 'operator') {
        return { username: 'operator', displayName: 'Operatore Simulato', role: forcedAdmin ? 'admin' : 'user' };
      }
      throw new UnauthorizedException('Credenziali non valide');
    }

    if (!ldap.host || !ldap.baseDn) {
      throw new ServiceUnavailableException('Autenticazione non configurata (LDAP_HOST, LDAP_BASE_DN)');
    }
    if (!username || !password) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    const tlsOptions = { rejectUnauthorized: !ldap.tlsSkipVerify };
    const client = new Client({ url: ldap.host, timeout: 5000, connectTimeout: 5000, tlsOptions });
    try {
      if (ldap.startTls) await client.startTLS(tlsOptions);
      await client.bind(ldap.userDnTemplate.replace('%s', username), password);

      const { searchEntries } = await client.search(ldap.baseDn, {
        scope: 'sub',
        filter: userLookupFilter(username),
        attributes: ['sAMAccountName', 'displayName', 'cn', 'givenName', 'sn', 'memberOf'],
        sizeLimit: 1,
      });
      const entry = searchEntries[0];
      if (!entry) throw new UnauthorizedException('Utente non trovato in Active Directory');

      const isUser = await this.isMember(client, ldap.baseDn, username, entry, ldap.requiredGroup);
      const isAdmin = await this.isMember(client, ldap.baseDn, username, entry, ldap.adminGroup);
      // LDAP_ADMIN_USERNAMES alza il ruolo, non apre l'accesso: serve comunque un gruppo.
      if (!isUser && !isAdmin) {
        throw new UnauthorizedException('Accesso non autorizzato: utente fuori dai gruppi AD di AttiPA');
      }

      const parts = `${text(entry['givenName'])} ${text(entry['sn'])}`.trim();
      return {
        username: (text(entry['sAMAccountName']) || username).toLowerCase(),
        displayName: text(entry['displayName']) || parts || text(entry['cn']) || username,
        role: isAdmin || forcedAdmin ? 'admin' : 'user',
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof InvalidCredentialsError) {
        this.logger.warn(`Login fallito per ${username}: ${describeLdapError(error)}`);
        throw new UnauthorizedException('Credenziali non valide');
      }
      this.logger.error(`Errore LDAP per ${username}: ${describeLdapError(error)}`);
      throw new ServiceUnavailableException('Active Directory non raggiungibile');
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  /** Gruppo tra i memberOf diretti, altrimenti ricerca ricorsiva (gruppi annidati). */
  private async isMember(client: Client, baseDn: string, username: string, entry: Entry, groupCn: string): Promise<boolean> {
    if (!groupCn) return false;
    const wanted = groupCn.toLowerCase();
    if (list(entry['memberOf']).some((dn) => cnOf(dn).toLowerCase() === wanted)) return true;
    try {
      const groups = await client.search(baseDn, { scope: 'sub', filter: groupByCnFilter(groupCn), attributes: ['cn'], sizeLimit: 1 });
      const groupDn = groups.searchEntries[0]?.dn;
      if (!groupDn) return false;
      const nested = await client.search(baseDn, {
        scope: 'sub',
        filter: recursiveMembershipFilter(username, groupDn),
        attributes: ['sAMAccountName'],
        sizeLimit: 1,
      });
      return nested.searchEntries.length > 0;
    } catch (error) {
      this.logger.warn(`Gruppi annidati non risolti per ${username} (${groupCn}): ${describeLdapError(error)}`);
      return false;
    }
  }
}
