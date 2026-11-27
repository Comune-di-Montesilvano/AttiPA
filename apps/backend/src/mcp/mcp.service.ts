import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { McpServer, createMcpHandler, fromJsonSchema, type McpHttpHandler, type McpRequestContext } from '@modelcontextprotocol/server';
import { TinnToolsService } from '../tools/tinn-tools.service.js';
import type { TokenPrincipal } from '../tokens/tokens.service.js';

/** Istruzioni per il modello del client MCP: le stesse regole dell'assistente interno. */
export const MCP_INSTRUCTIONS = [
  'Strumenti in sola lettura sulla contabilità (gestionale Tinn) di un Comune italiano.',
  'Cifre contabili solo dai risultati degli strumenti, mai stimate. Importi nel formato 1.234,56 €.',
  'I dati sono quelli del backup notturno: indicarne la data (strumento tinn_info).',
  'Capitoli con CUP, «PNRR» o «CAP. E nnnnn» nella descrizione sono fondi vincolati a un\'entrata: segnalarlo.',
  'Parametri «%» = tutti. I risultati contengono dati personali (creditori): non diffonderli.',
].join('\n');

/**
 * Server MCP (Streamable HTTP) sugli strumenti Tinn. Un'istanza di McpServer per richiesta
 * (stateless): la factory legge l'elenco delle query dal gateway, così una query nuova in
 * whitelist compare subito. Protocollo 2026-07-28 e, in fallback stateless, i client 2025.
 */
@Injectable()
export class McpService implements OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  readonly handler: McpHttpHandler;

  constructor(private readonly tools: TinnToolsService) {
    this.handler = createMcpHandler((ctx) => this.server(ctx), {
      // Nessuna notifica intermedia: una risposta JSON per richiesta.
      responseMode: 'json',
      onerror: (e) => this.logger.warn(`MCP: ${e.message}`),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.handler.close();
  }

  private async server(ctx: McpRequestContext): Promise<McpServer> {
    const principal = ctx.authInfo?.extra?.['principal'] as TokenPrincipal | undefined;
    const server = new McpServer(
      { name: 'attipa', version: process.env['APP_VERSION'] || 'dev' },
      { instructions: MCP_INSTRUCTIONS, maxToolInputElements: 100 },
    );
    const toolset = await this.tools.toolset();
    for (const t of toolset.tools) {
      server.registerTool(
        t.name,
        {
          description: t.description,
          inputSchema: fromJsonSchema<Record<string, unknown>>(t.parameters),
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (args: Record<string, unknown>) => {
          const out = await this.tools.run(toolset, t.name, args ?? {});
          // Chi e cosa, mai parametri o risultati (dati personali).
          this.logger.log(`MCP: ${principal?.username ?? '?'} → ${t.name}${out.step.error ? ' (errore)' : ''}`);
          return { content: [{ type: 'text' as const, text: out.text }], ...(out.step.error ? { isError: true } : {}) };
        },
      );
    }
    return server;
  }
}
