import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { AppConfiguration } from './config/configuration.js';
import { assertProductionSecrets } from './config/production-guards.js';
import { enforceAuthModeLock } from './auth/auth-mode-lock.js';
import { AppSetting } from './entities/app-setting.entity.js';

/**
 * Controlli prima di aprire la porta (main.ts): segreti di produzione e blocco della
 * modalità mock. Lancia se l'avvio va rifiutato. A questo punto il DB è già connesso
 * e migrato (NestFactory.create).
 */
export async function runStartupChecks(app: INestApplication): Promise<'mock' | 'real'> {
  const config = app.get<ConfigService<AppConfiguration, true>>(ConfigService);
  assertProductionSecrets(config.get('nodeEnv', { infer: true }), config.get('jwt.secret', { infer: true }));
  return enforceAuthModeLock(config.get('ldap.host', { infer: true }), app.get<Repository<AppSetting>>(getRepositoryToken(AppSetting)));
}
