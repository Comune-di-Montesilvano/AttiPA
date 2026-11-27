import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { countControllerDecorators, listControllers, listRoutes, type RouteInfo } from '../common/testing/controller-routes.js';

/**
 * Inventario autorizzazioni di TUTTE le route HTTP.
 *
 * Le guard sono globali (APP_GUARD JwtAuthGuard + RolesGuard in app.module.ts):
 * una route è protetta solo dai metadata `@Public()`/`@Roles()`. Questo spec li
 * legge da ogni controller e fallisce se una route diventa pubblica senza essere
 * in allowlist o se cambia la tabella (snapshot inline: ogni cambio di
 * autorizzazione compare nel diff della PR).
 */

const key = (r: Pick<RouteInfo, 'method' | 'path'>) => `${r.method} ${r.path}`;

// Route pubbliche ammesse. Ogni aggiunta va motivata.
const PUBLIC_ALLOWLIST = [
  'GET /', // health
  'GET /version',
  'POST /auth/login',
];

describe('Inventario sicurezza route', () => {
  let routes: RouteInfo[];

  beforeAll(async () => {
    routes = await listRoutes();
  }, 60000);

  it('scansiona tutti i controller', async () => {
    // Contro il falso verde: se la lettura dei metadata fallisce la tabella è vuota.
    expect((await listControllers()).length).toBe(countControllerDecorators());
    expect(routes.map(key)).toContain('GET /tinn/info');
  });

  it('le route pubbliche sono solo quelle ammesse', () => {
    expect(routes.filter((r) => r.isPublic).map(key).sort()).toEqual([...PUBLIC_ALLOWLIST].sort());
  });

  it('tabella autorizzazioni', () => {
    const table = routes
      .map((r) => `${key(r)} | ${r.isPublic ? 'public' : 'auth'} | roles=${r.roles.join(',') || '-'} | guards=${r.guards.join(',') || '-'}`)
      .join('\n');
    expect('\n' + table + '\n').toMatchInlineSnapshot(`
      "
      GET / | public | roles=- | guards=-
      POST /auth/login | public | roles=- | guards=-
      GET /auth/me | auth | roles=- | guards=-
      GET /tinn/info | auth | roles=- | guards=-
      GET /version | public | roles=- | guards=-
      "
    `);
  });
});
