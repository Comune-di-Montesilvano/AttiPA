import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { AppConfiguration } from '../config/configuration.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { TokensService } from '../tokens/tokens.service.js';
import { McpService } from './mcp.service.js';

/** Header HTTP che non si copiano dalla risposta web a quella Express. */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length']);

/** Express → Request web (il corpo JSON è già stato letto dal body parser di Nest). */
export function toWebRequest(req: ExpressRequest): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    for (const value of Array.isArray(v) ? v : [v]) headers.append(k, value);
  }
  const url = `http://${req.headers.host ?? 'localhost'}${req.originalUrl}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE' && req.body !== undefined;
  return new Request(url, { method: req.method, headers, ...(hasBody ? { body: JSON.stringify(req.body) } : {}) });
}

/**
 * Endpoint MCP. Non usa il JWT degli operatori (`@Public`): autentica il token personale
 * (`Authorization: Bearer attipa_pat_…`) creato dall'operatore in AttiPA. Spento (404)
 * finché MCP_ENABLED non è `true`.
 */
@Public()
@Controller('mcp')
export class McpController {
  private readonly enabled: boolean;

  constructor(
    private readonly mcp: McpService,
    private readonly tokens: TokensService,
    config: ConfigService<AppConfiguration, true>,
  ) {
    this.enabled = config.get('mcp', { infer: true }).enabled;
  }

  @All()
  async handle(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    if (!this.enabled) {
      res.status(404).json({ statusCode: 404, message: 'Server MCP non attivo' });
      return;
    }
    const auth = req.headers.authorization ?? '';
    const token = /^Bearer (.+)$/i.exec(auth)?.[1]?.trim() ?? '';
    const principal = token ? await this.tokens.verify(token) : null;
    if (!principal) {
      res
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="attipa", error="invalid_token"')
        .json({ statusCode: 401, message: 'Token personale mancante, scaduto o revocato' });
      return;
    }

    const response = await this.mcp.handler.fetch(toWebRequest(req), {
      parsedBody: req.body as unknown,
      authInfo: { token, clientId: principal.username, scopes: [], extra: { principal } },
    });
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) res.setHeader(key, value);
    });
    if (!response.body) {
      res.end();
      return;
    }
    // SSE (client 2025) o JSON: in streaming verso il client.
    const body = Readable.fromWeb(response.body as unknown as NodeReadableStream);
    res.on('close', () => body.destroy());
    body.pipe(res);
  }
}
