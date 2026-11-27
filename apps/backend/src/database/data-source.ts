import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ENTITIES, MIGRATIONS } from './schema.list.js';

// DataSource per la CLI TypeORM (migration:generate / migration:run / migration:revert).
// Stesse entity e migration del runtime (schema.list.ts).
export default new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  entities: ENTITIES,
  migrations: MIGRATIONS,
});
