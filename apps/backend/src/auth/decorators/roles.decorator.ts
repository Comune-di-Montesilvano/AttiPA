import { SetMetadata } from '@nestjs/common';
import type { OperatorRole } from '@attipa/shared-types';

export const ROLES_KEY = 'roles';
/** Ruoli ammessi sulla rotta (RolesGuard globale). Senza decoratore basta il login. */
export const Roles = (...roles: OperatorRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
