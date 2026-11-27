import { HttpException, Injectable } from '@nestjs/common';
import type { AssistantStep } from '@attipa/shared-types';
import type { ToolDefinition } from '../llm/llm.types.js';
import { TinnService, type TinnQueryDef } from '../tinn/tinn.service.js';
import { TINN_INFO_TOOL, coerceParams, queryForToolName, resultForModel, tinnTools } from './tinn-tools.js';

/** Righe chieste al gateway per uno strumento: al modello ne arrivano al massimo MAX_ROWS_TO_MODEL. */
export const QUERY_LIMIT = 500;

/** Strumenti Tinn disponibili in questo momento (elenco letto dal gateway). */
export interface TinnToolset {
  /** false se il gateway non risponde: nessuno strumento. */
  available: boolean;
  tools: ToolDefinition[];
  queries: TinnQueryDef[];
}

export interface ToolOutcome {
  /** Testo per il modello: risultato JSON o `{"error": …}`. */
  text: string;
  step: AssistantStep;
}

/** Strumenti sul DB Tinn, condivisi da assistente interno e server MCP. */
@Injectable()
export class TinnToolsService {
  constructor(private readonly tinn: TinnService) {}

  async toolset(): Promise<TinnToolset> {
    try {
      const queries = await this.tinn.listQueries();
      return { available: true, tools: tinnTools(queries), queries };
    } catch {
      return { available: false, tools: [], queries: [] };
    }
  }

  /** Esegue uno strumento; ogni errore diventa testo per il modello, mai un'eccezione. */
  async run(toolset: TinnToolset, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    const step: AssistantStep = { tool: name, params: args };
    try {
      if (!toolset.tools.some((t) => t.name === name)) throw new Error(`strumento inesistente: ${name}`);
      if (name === TINN_INFO_TOOL) {
        const info = await this.tinn.info();
        step.rows = 1;
        return { text: JSON.stringify(info), step };
      }
      const def = toolset.queries.find((q) => q.name === queryForToolName(name))!;
      const params = coerceParams(def, args);
      step.params = params;
      const result = await this.tinn.runQuery(def.name, params, QUERY_LIMIT);
      step.rows = result.rows.length;
      step.truncated = result.truncated;
      return { text: resultForModel(result), step };
    } catch (e) {
      step.error = e instanceof HttpException || e instanceof Error ? e.message : String(e);
      return { text: JSON.stringify({ error: step.error }), step };
    }
  }
}
