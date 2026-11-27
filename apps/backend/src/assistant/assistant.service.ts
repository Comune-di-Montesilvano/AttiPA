import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AssistantChatResponse, AssistantMessage, AssistantStep } from '@attipa/shared-types';
import { LlmService } from '../llm/llm.service.js';
import { LlmError, type ChatMessage } from '../llm/llm.types.js';
import { TinnToolsService } from '../tools/tinn-tools.service.js';
import { systemPrompt } from './assistant.prompt.js';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly tools: TinnToolsService,
  ) {}

  /**
   * Ciclo strumenti: il modello chiede query della whitelist, il backend le esegue e gli
   * restituisce i risultati, finché il modello risponde in testo o finiscono i passi.
   */
  async chat(history: AssistantMessage[], username: string, now: Date = new Date()): Promise<AssistantChatResponse> {
    const toolset = await this.tools.toolset();
    const today = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(today, toolset.available) }, ...history];
    const steps: AssistantStep[] = [];

    try {
      for (let i = 0; i < this.llm.maxSteps; i++) {
        const res = await this.llm.chat({ messages, tools: toolset.tools });
        if (res.toolCalls.length === 0) return this.done(res.content, steps, username);
        messages.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
        for (const call of res.toolCalls) {
          const out = await this.tools.run(toolset, call.name, call.arguments);
          steps.push(out.step);
          messages.push({ role: 'tool', toolCallId: call.id, content: out.text });
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
}
