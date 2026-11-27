import { describe, expect, it } from 'vitest';
import { describeLdapError } from './ldap-errors.js';

const AD_LOCKED = '80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data 775, v4563';

describe('describeLdapError', () => {
  it('traduce il sottocodice AD del bind', () => {
    const err = Object.assign(new Error(AD_LOCKED), { name: 'InvalidCredentialsError' });
    expect(describeLdapError(err)).toBe(`InvalidCredentialsError: ${AD_LOCKED} (AD: account bloccato)`);
    expect(describeLdapError(new Error('... data 52e, v4563'))).toContain('(AD: password errata)');
    expect(describeLdapError(new Error('... data 532, v4563'))).toContain('(AD: password scaduta)');
  });

  it('senza sottocodice noto: solo l\'errore', () => {
    expect(describeLdapError(new Error('Invalid Credentials'))).toBe('Error: Invalid Credentials');
    expect(describeLdapError(new Error('... data 999, v1'))).toBe('Error: ... data 999, v1');
    expect(describeLdapError('timeout')).toBe('timeout');
  });
});
