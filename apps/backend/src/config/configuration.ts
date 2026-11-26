export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  /** Servizio interno che espone il DB Tinn in sola lettura. */
  tinnGatewayUrl: string;
  /** Servizio interno di generazione documenti (RTF/DOCX/PDF). */
  docgenUrl: string;
  llm: {
    /** openai-compatible (Ollama, vLLM, LocalAI…), anthropic, openai. */
    provider: string;
    baseUrl: string;
    model: string;
  };
}

export default (): AppConfiguration => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: Number(process.env['PORT'] ?? 8080),
  tinnGatewayUrl: process.env['TINN_GATEWAY_URL'] ?? 'http://tinn-gateway:8000',
  docgenUrl: process.env['DOCGEN_URL'] ?? 'http://docgen:8000',
  llm: {
    provider: process.env['LLM_PROVIDER'] ?? 'openai-compatible',
    baseUrl: process.env['LLM_BASE_URL'] ?? 'http://ollama:11434/v1',
    model: process.env['LLM_MODEL'] ?? '',
  },
});
