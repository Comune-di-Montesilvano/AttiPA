import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmStatus } from '@attipa/shared-types';
import type { AppConfiguration } from '../config/configuration.js';
import { LlmError, type ChatRequest, type ChatResult, type LlmProvider } from './llm.types.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

/** Punto unico verso il modello: provider scelto da LLM_PROVIDER. */
@Injectable()
export class LlmService {
  private readonly cfg: AppConfiguration['llm'];
  private readonly provider: LlmProvider | null;

  constructor(config: ConfigService<AppConfiguration, true>) {
    this.cfg = config.get('llm', { infer: true });
    this.provider =
      this.cfg.provider === 'openai-compatible'
        ? new OpenAiCompatibleProvider({ baseUrl: this.cfg.baseUrl, model: this.cfg.model, apiKey: this.cfg.apiKey, timeoutMs: this.cfg.timeoutMs })
        : null;
  }

  get maxSteps(): number {
    return this.cfg.maxSteps;
  }

  /** Errore di configurazione, null se il provider è utilizzabile. */
  private configError(): string | null {
    if (!this.provider) return `LLM_PROVIDER '${this.cfg.provider}' non supportato (disponibile: openai-compatible)`;
    if (!this.cfg.model) return 'LLM_MODEL non configurato';
    return null;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const err = this.configError();
    if (err) throw new LlmError(err);
    return this.provider!.chat(req);
  }

  async status(): Promise<LlmStatus> {
    let endpoint: string;
    try {
      endpoint = new URL(this.cfg.baseUrl).host;
    } catch {
      endpoint = '(LLM_BASE_URL non valido)';
    }
    const base = { provider: this.cfg.provider, model: this.cfg.model, endpoint, reachable: false, modelAvailable: false };
    const err = this.configError();
    if (err) return { ...base, error: err };
    try {
      const models = await this.provider!.models();
      // Ollama elenca `qwen3:8b`; un modello configurato senza tag equivale a `:latest`.
      const wanted = this.cfg.model.includes(':') ? this.cfg.model : `${this.cfg.model}:latest`;
      const available = models.some((m) => m === this.cfg.model || m === wanted);
      return { ...base, reachable: true, modelAvailable: available, ...(available ? {} : { error: "Modello non presente sull'endpoint" }) };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
