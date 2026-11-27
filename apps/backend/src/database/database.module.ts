import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ENTITIES, MIGRATIONS } from './schema.list.js';
import { AppSetting } from '../entities/app-setting.entity.js';
import type { AppConfiguration } from '../config/configuration.js';

/**
 * Schema solo da migration, anche in sviluppo (niente synchronize): il DB dev è
 * identico a quello di produzione e una migration mancante si vede subito.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>) => ({
        type: 'postgres' as const,
        url: config.get('database.url', { infer: true }),
        entities: ENTITIES,
        migrations: MIGRATIONS,
        migrationsRun: true,
        synchronize: false,
        logging: ['error' as const],
      }),
    }),
    // Repository usato all'avvio da startup-checks.ts (blocco della modalità mock).
    TypeOrmModule.forFeature([AppSetting]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
