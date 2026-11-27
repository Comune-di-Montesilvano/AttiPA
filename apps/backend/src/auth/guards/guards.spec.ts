import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

function rolesContext(handlerRoles: string[] | undefined, user?: { role: string }): ExecutionContext {
  const handler = () => undefined;
  if (handlerRoles) Reflect.defineMetadata(ROLES_KEY, handlerRoles, handler);
  class Ctrl {}
  return {
    getHandler: () => handler,
    getClass: () => Ctrl,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('senza ruoli dichiarati basta il login', () => {
    expect(guard.canActivate(rolesContext(undefined))).toBe(true);
    expect(guard.canActivate(rolesContext([]))).toBe(true);
  });

  it('utente assente o ruolo non ammesso → 403', () => {
    expect(() => guard.canActivate(rolesContext(['admin']))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(rolesContext(['admin'], { role: 'user' }))).toThrow(new ForbiddenException('Ruolo richiesto: admin'));
  });

  it('ruolo ammesso → true', () => {
    expect(guard.canActivate(rolesContext(['user', 'admin'], { role: 'user' }))).toBe(true);
  });
});

function publicContext(publicOn: 'handler' | 'class' | 'none'): ExecutionContext {
  const handler = () => undefined;
  class Ctrl {}
  if (publicOn === 'handler') Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  if (publicOn === 'class') Reflect.defineMetadata(IS_PUBLIC_KEY, true, Ctrl);
  return { getHandler: () => handler, getClass: () => Ctrl } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  // super.canActivate = AuthGuard('jwt') di passport (prototipo del mixin).
  const passportProto = Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: (ctx: ExecutionContext) => unknown };
  let superCanActivate: MockInstance;
  const guard = new JwtAuthGuard(new Reflector());

  beforeEach(() => {
    superCanActivate = vi.spyOn(passportProto, 'canActivate').mockReturnValue('passport' as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['handler', 'class'] as const)('@Public su %s → true senza passport', (where) => {
    expect(guard.canActivate(publicContext(where))).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('senza @Public → delega a passport', () => {
    const ctx = publicContext('none');
    expect(guard.canActivate(ctx)).toBe('passport');
    expect(superCanActivate).toHaveBeenCalledWith(ctx);
  });
});
