import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AssistantChatResponse, AssistantMessage, AssistantStep } from '@attipa/shared-types';
import { LlmService } from '../llm/llm.service.js';
import { LlmError, type ChatMessage, type ToolCall, type ToolDefinition } from '../llm/llm.types.js';
import { TinnService, type TinnQueryDef } from '../tinn/tinn.service.js';
import { systemPrompt } from './assistant.prompt.js';
import { TINN_INFO_TOOL, coerceParams, queryForToolName, resultForModel, tinnTools } from './tinn-tools.js';

/** Righe chieste al gateway per uno strumento: il modello ne vede al massimo MAX_ROWS_TO_MODEL. */
const QUERY_LIMIT = 500;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly tinn: TinnService,
  ) {}

  /**
   * Ciclo strumenti: il modello chiede query della whitelist, il backend le esegue e gli
   * restituisce i risultati, finché il modello risponde in testo o finiscono i passi.
   */
  async chat(history: AssistantMessage[], username: string, now: Date = new Date()): Promise<AssistantChatResponse> {
    let queries: TinnQueryDef[] = [];
    let tinnAvailable = true;
    try {
      queries = await this.tinn.listQueries();
    } catch {
      tinnAvailable = false;
    }
    const tools = tinnAvailable ? tinnTools(queries) : [];
    const today = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(today, tinnAvailable) }, ...history];
    const steps: AssistantStep[] = [];

    try {
      for (let i = 0; i < this.llm.maxSteps; i++) {
        const res = await this.llm.chat({ messages, tools });
        if (res.toolCalls.length === 0) return this.done(res.content, steps, username);
        messages.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
        for (const call of res.toolCalls) {
          messages.push({ role: 'tool', toolCallId: call.id, content: await this.runTool(call, queries, tools, steps) });
        }
      }
      // Passi finiti: ultima chiamata senza strumenti, il modello risponde con quello che ha.
      messages.push({ role: 'user', content: 'Rispondi ora con i dati già raccolti, senza altri strumenti.' });
      const last = await this.llm.chat({ messages });
      return this.done(last.content, steps, username);
    } catch (e) {
      if (e instanceof LlmError) throw new ServiceUnavailableException(e.message);
      throw e;
    }
  }

  private done(content: string, steps: AssistantStep[], username: string): AssistantChatResponse {
    // Nel log chi e quali strumenti, mai domande o risultati (possono contenere dati personali).
    this.logger.log(`assistente: ${username}, strumenti ${steps.map((s) => s.tool).join(',') || '-'}`);
    return { reply: content.trim() || 'Il modello non ha prodotto una risposta.', steps };
  }

  /** Esegue uno strumento; ogni errore torna al modello come testo, non interrompe la risposta. */
  private async runTool(call: ToolCall, queries: TinnQueryDef[], tools: ToolDefinition[], steps: AssistantStep[]): Promise<string> {
    const step: AssistantStep = { tool: call.name, params: call.arguments };
    steps.push(step);
    try {
      if (!tools.some((t) => t.name === call.name)) throw new Error(`strumento inesistente: ${call.name}`);
      if (call.name === TINN_INFO_TOOL) {
        const info = await this.tinn.info();
        step.rows = 1;
        return JSON.stringify(info);
      }
      const def = queries.find((q) => q.name === queryForToolName(call.name))!;
      const params = coerceParams(def, call.arguments);
      step.params = params;
      const result = await this.tinn.runQuery(def.name, params, QUERY_LIMIT);
      step.rows = result.rows.length;
      step.truncated = result.truncated;
      return resultForModel(result);
    } catch (e) {
      step.error = e instanceof HttpException || e instanceof Error ? e.message : String(e);
      return JSON.stringify({ error: step.error });
    }
  }
}
