import { describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtOperatorPayload } from '@attipa/shared-types';
import type { AppConfiguration } from '../config/configuration.js';
import type { LdapService } from './ldap/ldap.service.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const jwt = new JwtService({ secret: 's'.repeat(32), signOptions: { algorithm: 'HS256', expiresIn: 3600 } });
const config = { get: () => 3600 } as unknown as ConfigService<AppConfiguration, true>;

function build(authenticate: LdapService['authenticate']) {
  const users = { recordLogin: vi.fn() };
  const auth = new AuthService({ authenticate } as LdapService, users as unknown as UsersService, jwt, config);
  return { auth, users };
}

describe('AuthService.login', () => {
  it('token operatore firmato, operatore registrato', async () => {
    const user = { username: 'mrossi', displayName: 'Mario Rossi', role: 'admin' as const };
    const { auth, users } = build(vi.fn().mockResolvedValue(user));
    const res = await auth.login({ username: 'MRossi', password: 'pw' });
    expect(users.recordLogin).toHaveBeenCalledWith(user);
    expect(res).toMatchObject({ token_type: 'Bearer', expires_in: 3600, username: 'mrossi', role: 'admin' });
    const payload = jwt.verify<JwtOperatorPayload>(res.access_token);
    expect(payload).toMatchObject({ sub: 'mrossi', username: 'mrossi', displayName: 'Mario Rossi', role: 'admin', type: 'operator' });
    expect(payload.exp! - payload.iat!).toBe(3600);
  });

  it('login fallito: nessun token né registrazione', async () => {
    const { auth, users } = build(vi.fn().mockRejectedValue(new UnauthorizedException()));
    await expect(auth.login({ username: 'x', password: 'y' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.recordLogin).not.toHaveBeenCalled();
  });
});
