/** Chiamata a uno strumento richiesta dal modello. */
export interface ToolCall {
  id: string;
  name: string;
  /** Argomenti già decodificati dal JSON del modello. */
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

/** Strumento offerto al modello (parametri in JSON Schema). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: 'string' | 'number'; description?: string }>;
    required: string[];
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
}

/** Un fornitore di modelli: il resto del backend non sa quale c'è dietro. */
export interface LlmProvider {
  chat(req: ChatRequest): Promise<ChatResult>;
  /** Modelli offerti dall'endpoint. */
  models(): Promise<string[]>;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}
