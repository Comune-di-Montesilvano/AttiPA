import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { AppConfiguration } from './config/configuration.js';
import { runStartupChecks } from './startup-checks.js';

const LOG_LEVELS_BY_NAME: Record<string, LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  info: ['error', 'warn', 'log'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

async function bootstrap(): Promise<void> {
  const logLevelName = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
  const logger = LOG_LEVELS_BY_NAME[logLevelName] ?? LOG_LEVELS_BY_NAME['info'];
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  const config = app.get<ConfigService<AppConfiguration, true>>(ConfigService);

  try {
    await runStartupChecks(app);
  } catch (err) {
    new Logger('Bootstrap').error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (config.get('nodeEnv', { infer: true }) !== 'production') {
    // Solo dev: il browser chiama il backend diretto. In produzione passa dal nginx del frontend.
    app.enableCors({ origin: ['http://localhost:3000'] });
  }

  await app.listen(config.get('port', { infer: true }));
}

void bootstrap();
