import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtOperatorPayload, OperatorRole } from '@attipa/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<OperatorRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: JwtOperatorPayload }>().user;
    if (!user) throw new ForbiddenException('Token operatore richiesto');
    if (!required.includes(user.role)) throw new ForbiddenException(`Ruolo richiesto: ${required.join(' o ')}`);
    return true;
  }
}
