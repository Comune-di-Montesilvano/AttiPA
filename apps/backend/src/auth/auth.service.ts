import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { AuthResponse, JwtOperatorPayload } from '@attipa/shared-types';
import { LdapService } from './ldap/ldap.service.js';
import { UsersService } from '../users/users.service.js';
import type { AppConfiguration } from '../config/configuration.js';
import type { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly ldap: LdapService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.ldap.authenticate(dto.username, dto.password);
    await this.users.recordLogin(user);
    const payload: JwtOperatorPayload = {
      sub: user.username,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      type: 'operator',
    };
    return {
      access_token: this.jwt.sign(payload),
      token_type: 'Bearer',
      expires_in: this.config.get('jwt.expiresInSeconds', { infer: true }),
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  }
}
