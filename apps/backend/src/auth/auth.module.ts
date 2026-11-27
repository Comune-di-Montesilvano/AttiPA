import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { LdapService } from './ldap/ldap.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { UsersModule } from '../users/users.module.js';
import type { AppConfiguration } from '../config/configuration.js';

@Module({
  imports: [
    // @nestjs/passport 12: AuthGuard() vuole AuthModuleOptions via DI, che fornisce solo register().
    PassportModule.register({}),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>) => ({
        secret: config.get('jwt.secret', { infer: true }),
        signOptions: { algorithm: 'HS256' as const, expiresIn: config.get('jwt.expiresInSeconds', { infer: true }) },
      }),
    }),
    UsersModule,
  ],
  providers: [AuthService, LdapService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
