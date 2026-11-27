import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtOperatorPayload } from '@attipa/shared-types';
import type { AppConfiguration } from '../../config/configuration.js';
import { JwtStrategy } from './jwt.strategy.js';

const config = { get: () => 'test-secret' } as unknown as ConfigService<AppConfiguration, true>;
const strategy = new JwtStrategy(config);

const operator: JwtOperatorPayload = { sub: 'mario', username: 'mario', displayName: 'Mario', role: 'user', type: 'operator' };

describe('JwtStrategy.validate', () => {
  it('accetta un token operatore (user e admin)', () => {
    expect(strategy.validate(operator)).toEqual(operator);
    expect(strategy.validate({ ...operator, role: 'admin' })).toEqual({ ...operator, role: 'admin' });
  });

  it('rifiuta type diverso, ruolo sconosciuto, username assente', () => {
    const bad = [
      { ...operator, type: 'citizen' },
      { ...operator, role: 'root' },
      { ...operator, username: '' },
      null,
    ];
    for (const p of bad) expect(() => strategy.validate(p as unknown as JwtOperatorPayload)).toThrow(UnauthorizedException);
  });
});
