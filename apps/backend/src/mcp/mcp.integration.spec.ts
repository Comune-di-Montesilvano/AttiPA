import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ApiToken } from '../entities/api-token.entity.js';
import type { ApiTokensResponse, AuthResponse, CreatedApiToken } from '@attipa/shared-types';
import { createTempDatabase, migrateTestDatabase } from '../../vitest.global-setup.js';

/** tinn-gateway finto: una query con un parametro numerico. Dati fittizi. */
function fakeGateway(): Server {
  return createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/info') {
      res.end(JSON.stringify({ backup_date: '2026-11-27T04:01:53', restored_at: '2026-11-27T06:08:56' }));
      return;
    }
    if (req.url === '/queries') {
      res.end(JSON.stringify([{ name: 'storia_capitolo', description: 'Storia di un capitolo', params: [{ name: 'CAPITOLO', type: 'number' }] }]));
      return;
    }
    if (req.url === '/queries/storia_capitolo' && req.method === 'POST') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const { params } = JSON.parse(body) as { params: { CAPITOLO: number } };
        res.end(JSON.stringify({ columns: ['CAPITOLO', 'ASSESTATO'], rows: [[params.CAPITOLO, 1234.5]], truncated: false }));
      });
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
}

/** Risposta JSON-RPC da JSON o da SSE (`data: …`). */
async function rpcResult(res: Response): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
  const text = await res.text();
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .at(-1);
    return JSON.parse(data ?? '{}') as { result?: Record<string, unknown> };
  }
  return JSON.parse(text) as { result?: Record<string, unknown> };
}

/**
 * App completa con MCP_ENABLED=true su Postgres temporaneo: token personale creato via
 * API, poi un client MCP (protocollo 2025, stateless) che elenca e chiama gli strumenti.
 */
describe.skipIf(!process.env.DATABASE_URL)('server MCP con token personali', () => {
  let db: Awaited<ReturnType<typeof createTempDatabase>>;
  let app: INestApplication;
  let gateway: Server;
  let base: string;
  let jwt: string;

  beforeAll(async () => {
    gateway = fakeGateway();
    await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', r));
    db = await createTempDatabase(process.env.DATABASE_URL!, 'mcp');
    await migrateTestDatabase(db.url);
    vi.stubEnv('DATABASE_URL', db.url);
    vi.stubEnv('LDAP_HOST', 'mock');
    vi.stubEnv('JWT_SECRET', 'x'.repeat(64));
    vi.stubEnv('TINN_GATEWAY_URL', `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`);
    vi.stubEnv('MCP_ENABLED', 'true');
    vi.stubEnv('MCP_TOKEN_MAX_DAYS', '30');
    vi.stubEnv('MCP_PUBLIC_URL', 'https://attipa.example.test/api/mcp');
    const { AppModule } = await import('../app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'operator' }),
    });
    jwt = ((await login.json()) as AuthResponse).access_token;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await db?.drop();
    await new Promise((r) => gateway?.close(r));
    vi.unstubAllEnvs();
  }, 60000);

  const api = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...init.headers } });

  let nextId = 1;
  const mcp = (token: string, method: string, params: Record<string, unknown> = {}) =>
    fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });

  const create = async (name = 'Claude Desktop', days = 7) => {
    const res = await api('/tokens', { method: 'POST', body: JSON.stringify({ name, days }) });
    expect(res.status).toBe(201);
    return (await res.json()) as CreatedApiToken;
  };

  it('senza token o con token sconosciuto → 401 con WWW-Authenticate', async () => {
    const none = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toContain('Bearer');
    expect((await mcp('attipa_pat_inventato', 'tools/list')).status).toBe(401);
    // Il JWT dell'operatore non vale come token MCP.
    expect((await mcp(jwt, 'tools/list')).status).toBe(401);
  });

  it('creazione: token in chiaro solo una volta, nel DB solo hash; durata oltre il massimo → 400', async () => {
    const created = await create();
    expect(created.token).toMatch(/^attipa_pat_[A-Za-z0-9_-]{43}$/);
    expect(created.prefix).toBe(created.token.slice(0, 15));
    const list = (await (await api('/tokens')).json()) as ApiTokensResponse;
    expect(list).toMatchObject({ mcpEnabled: true, mcpUrl: 'https://attipa.example.test/api/mcp', maxDays: 30 });
    expect(JSON.stringify(list)).not.toContain(created.token);
    expect((await api('/tokens', { method: 'POST', body: JSON.stringify({ name: 'x', days: 31 }) })).status).toBe(400);
    expect((await api('/tokens', { method: 'POST', body: JSON.stringify({ name: '   ', days: 1 }) })).status).toBe(400);
  });

  it('initialize, tools/list e tools/call con il token personale', async () => {
    const { token } = await create('sessione MCP');
    const init = await rpcResult(
      await mcp(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }),
    );
    expect(init.result).toMatchObject({ serverInfo: { name: 'attipa' } });
    expect(String(init.result?.['instructions'])).toContain('sola lettura');

    const list = await rpcResult(await mcp(token, 'tools/list'));
    const tools = (list.result?.['tools'] ?? []) as { name: string; annotations?: { readOnlyHint?: boolean } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(['tinn_info', 'tinn_storia_capitolo']);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);

    const call = await rpcResult(await mcp(token, 'tools/call', { name: 'tinn_storia_capitolo', arguments: { CAPITOLO: 10565 } }));
    const content = call.result?.['content'] as { type: string; text: string }[];
    expect(JSON.parse(content[0]!.text)).toMatchObject({ columns: ['CAPITOLO', 'ASSESTATO'], rows: [[10565, 1234.5]] });

    // Parametro mancante: validato dallo schema, errore leggibile per il modello (isError), mai 500.
    const bad = await mcp(token, 'tools/call', { name: 'tinn_storia_capitolo', arguments: {} });
    expect(bad.status).toBe(200);
    expect((await rpcResult(bad)).result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("'CAPITOLO'") }] });
  });

  it('token scaduto → 401', async () => {
    const created = await create('in scadenza');
    expect((await mcp(created.token, 'tools/list')).status).toBe(200);
    await app.get<Repository<ApiToken>>(getRepositoryToken(ApiToken)).update({ id: created.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await mcp(created.token, 'tools/list')).status).toBe(401);
  });

  it('revoca: il token smette di funzionare; i token degli altri non si toccano', async () => {
    const created = await create('da revocare');
    expect((await mcp(created.token, 'tools/list')).status).toBe(200);
    expect((await api(`/tokens/${created.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await mcp(created.token, 'tools/list')).status).toBe(401);
    const list = (await (await api('/tokens')).json()) as ApiTokensResponse;
    expect(list.tokens.find((t) => t.id === created.id)?.revokedAt).not.toBeNull();

    // Un altro operatore non vede né revoca i token altrui.
    const other = (await (
      await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) })
    ).json()) as AuthResponse;
    const mine = await create('mio');
    const asOther = { Authorization: `Bearer ${other.access_token}` };
    expect(((await (await fetch(`${base}/tokens`, { headers: asOther })).json()) as ApiTokensResponse).tokens).toEqual([]);
    expect((await fetch(`${base}/tokens/${mine.id}`, { method: 'DELETE', headers: asOther })).status).toBe(404);
    expect((await mcp(mine.token, 'tools/list')).status).toBe(200);
  });
});
