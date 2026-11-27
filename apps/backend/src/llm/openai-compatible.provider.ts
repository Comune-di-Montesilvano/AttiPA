import { LlmError, type ChatMessage, type ChatRequest, type ChatResult, type LlmProvider, type ToolCall } from './llm.types.js';

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

interface WireToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string | Record<string, unknown> };
}

interface WireMessage {
  role: string;
  content?: string | null;
  tool_calls?: WireToolCall[];
  tool_call_id?: string;
}

function toWire(m: ChatMessage): WireMessage {
  switch (m.role) {
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.arguments) },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    default:
      return { role: m.role, content: m.content };
  }
}

/** Argomenti dello strumento: stringa JSON (OpenAI) o oggetto (alcune versioni di Ollama). */
function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new LlmError('Il modello ha restituito argomenti non validi per uno strumento');
  }
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null; tool_calls?: (WireToolCall & { index?: number })[] } }[];
}

/**
 * Server-Sent Events di Chat Completions: testo e tool call arrivano a pezzi (`delta`); gli
 * argomenti di una tool call sono frammenti di stringa da concatenare, per `index`.
 */
async function readStream(res: Response): Promise<WireMessage> {
  let content = '';
  const calls = new Map<number, { id?: string; name: string; args: string; obj?: Record<string, unknown> }>();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') return;
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      throw new LlmError('Frammento di risposta del modello non leggibile');
    }
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) content += delta.content;
    for (const [i, tc] of (delta.tool_calls ?? []).entries()) {
      const key = tc.index ?? i;
      const cur = calls.get(key) ?? { name: '', args: '' };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      const a = tc.function?.arguments;
      if (typeof a === 'string') cur.args += a;
      else if (a && typeof a === 'object') cur.obj = a;
      calls.set(key, cur);
    }
  };
  if (!res.body) throw new LlmError('Risposta del modello vuota');
  for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(part, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, nl).replace(/\r$/, ''));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle((buffer + decoder.decode()).trim());
  const tool_calls: WireToolCall[] = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, c]) => ({ ...(c.id ? { id: c.id } : {}), type: 'function', function: { name: c.name, arguments: c.obj ?? c.args } }));
  return { role: 'assistant', content, ...(tool_calls.length ? { tool_calls } : {}) };
}

/**
 * Qualunque endpoint con l'API Chat Completions di OpenAI: Ollama (`/v1`), vLLM, LocalAI,
 * OpenAI. Nessun SDK: una fetch, così la dipendenza dal fornitore resta zero.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly baseUrl: string;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
    };
  }

  private networkError(e: unknown): LlmError {
    if (e instanceof LlmError) return e;
    if (e instanceof Error && e.name === 'TimeoutError') {
      return new LlmError(`Il modello non ha risposto entro ${Math.round(this.opts.timeoutMs / 1000)} s`);
    }
    // undici mette il motivo vero (ECONNREFUSED, UND_ERR_…) in cause.code.
    const code = e instanceof Error ? (e.cause as { code?: unknown } | undefined)?.code : undefined;
    return new LlmError(`Modello non raggiungibile${typeof code === 'string' ? ` (${code})` : ''}`);
  }

  private async request(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: this.headers(), signal });
    } catch (e) {
      throw this.networkError(e);
    }
    if (!res.ok) {
      // Il corpo può contenere dettagli utili (modello assente), mai la chiave: si riporta un estratto.
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new LlmError(`Il modello ha risposto HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res;
  }

  /**
   * In streaming: senza, la fetch di Node chiude dopo 300 s senza header (headersTimeout di
   * undici) e un modello su CPU può impiegarci di più. Il timeout complessivo resta timeoutMs.
   */
  async chat(req: ChatRequest): Promise<ChatResult> {
    const body = {
      model: this.opts.model,
      messages: req.messages.map(toWire),
      temperature: 0.1,
      stream: true,
      ...(req.tools?.length
        ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }
        : {}),
    };
    const signal = AbortSignal.timeout(this.opts.timeoutMs);
    const res = await this.request('/chat/completions', { method: 'POST', body: JSON.stringify(body) }, signal);
    let message: WireMessage | undefined;
    try {
      // Alcuni server ignorano stream e rispondono con un JSON unico.
      message = (res.headers.get('content-type') ?? '').includes('text/event-stream')
        ? await readStream(res)
        : ((await res.json()) as { choices?: { message?: WireMessage }[] }).choices?.[0]?.message;
    } catch (e) {
      throw this.networkError(e);
    }
    if (!message) throw new LlmError('Risposta del modello senza messaggio');
    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((c, i) => ({
      id: c.id || `call_${i}`,
      name: c.function?.name ?? '',
      arguments: parseArguments(c.function?.arguments),
    }));
    return { content: message.content ?? '', toolCalls };
  }

  async models(): Promise<string[]> {
    const res = await this.request('/models', { method: 'GET' }, AbortSignal.timeout(Math.min(this.opts.timeoutMs, 15_000)));
    let data: { data?: { id?: string }[] };
    try {
      data = (await res.json()) as typeof data;
    } catch (e) {
      throw this.networkError(e);
    }
    return (data.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  }
}
