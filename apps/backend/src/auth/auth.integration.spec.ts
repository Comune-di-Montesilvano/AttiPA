import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { AuthResponse } from '@attipa/shared-types';
import { createTempDatabase, migrateTestDatabase } from '../../vitest.global-setup.js';
import { User } from '../entities/user.entity.js';
import { AppSetting } from '../entities/app-setting.entity.js';
import { AUTH_REAL_SEEN_KEY } from './auth-mode-lock.js';

/**
 * App completa (guard globali, validazione, TypeORM) su un Postgres vero in un DB
 * temporaneo, con LDAP_HOST=mock. Gira solo con DATABASE_URL (job integration-tests).
 */
describe.skipIf(!process.env.DATABASE_URL)('login e rotte protette', () => {
  let db: Awaited<ReturnType<typeof createTempDatabase>>;
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    db = await createTempDatabase(process.env.DATABASE_URL!, 'auth');
    await migrateTestDatabase(db.url);
    vi.stubEnv('DATABASE_URL', db.url);
    vi.stubEnv('LDAP_HOST', 'mock');
    vi.stubEnv('JWT_SECRET', 'x'.repeat(64));
    vi.stubEnv('TINN_GATEWAY_URL', 'http://127.0.0.1:9');
    // Default di produzione, indipendente dal .env di chi lancia i test.
    vi.stubEnv('MCP_ENABLED', 'false');
    const { AppModule } = await import('../app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
    vi.unstubAllEnvs();
  }, 60000);

  const login = (username: string, password: string) =>
    fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

  it('controlli di avvio di main.ts: mock ammesso, poi bloccato dopo un avvio reale', async () => {
    const { runStartupChecks } = await import('../startup-checks.js');
    await expect(runStartupChecks(app)).resolves.toBe('mock');
    const settings = app.get<Repository<AppSetting>>(getRepositoryToken(AppSetting));
    await settings.save({ key: AUTH_REAL_SEEN_KEY, value: '2026-11-27T00:00:00.000Z', updatedBy: 'test' });
    await expect(runStartupChecks(app)).rejects.toThrow(/LDAP_HOST=mock rifiutato/);
    await settings.delete({ key: AUTH_REAL_SEEN_KEY });
  });

  it('rotte pubbliche senza token', async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect((await fetch(`${base}/version`)).status).toBe(200);
  });

  it('rotte protette senza token o con token non valido → 401', async () => {
    expect((await fetch(`${base}/auth/me`)).status).toBe(401);
    expect((await fetch(`${base}/tinn/info`)).status).toBe(401);
    expect((await fetch(`${base}/auth/me`, { headers: { Authorization: 'Bearer abc.def.ghi' } })).status).toBe(401);
  });

  it('credenziali errate → 401, username non valido → 400', async () => {
    expect((await login('admin', 'sbagliata')).status).toBe(401);
    expect((await login('a,OU=x', 'admin')).status).toBe(400);
  });

  it('login → token → /auth/me, operatore registrato nel DB', async () => {
    const res = await login('admin', 'admin');
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthResponse;
    expect(body).toMatchObject({ token_type: 'Bearer', username: 'admin', role: 'admin' });

    const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${body.access_token}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ username: 'admin', role: 'admin', type: 'operator' });

    // MCP spento (default): endpoint 404 anche con token, niente creazione di token personali.
    expect((await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer attipa_pat_x' } })).status).toBe(404);
    const auth = { Authorization: `Bearer ${body.access_token}`, 'Content-Type': 'application/json' };
    expect((await fetch(`${base}/tokens`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'x', days: 1 }) })).status).toBe(403);
    expect(await (await fetch(`${base}/tokens`, { headers: auth })).json()).toMatchObject({ mcpEnabled: false, tokens: [] });

    // Con il token si passa la guard: la rotta Tinn risponde 503 (gateway assente), non 401.
    const tinn = await fetch(`${base}/tinn/info`, { headers: { Authorization: `Bearer ${body.access_token}` } });
    expect(tinn.status).toBe(503);

    const users = app.get<Repository<User>>(getRepositoryToken(User));
    const saved = await users.findOneByOrFail({ username: 'admin' });
    expect(saved).toMatchObject({ displayName: 'Amministratore Simulato', role: 'admin' });

    // Secondo login: aggiorna last_login_at, non duplica.
    await login('admin', 'admin');
    expect(await users.count()).toBe(1);
    expect((await users.findOneByOrFail({ username: 'admin' })).lastLoginAt.getTime()).toBeGreaterThanOrEqual(saved.lastLoginAt.getTime());
  });
});
