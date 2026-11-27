export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  database: {
    /** postgresql://utente:password@postgres:5432/attipa */
    url: string;
  };
  jwt: {
    secret: string;
    /** Durata del token operatore in secondi. */
    expiresInSeconds: number;
  };
  ldap: {
    /** ldap://host:389, ldaps://host:636 oppure `mock` (solo sviluppo: admin/admin, operator/operator). */
    host: string;
    baseDn: string;
    /** DN o UPN per il bind dell'utente, `%s` = username (es. `%s@comune.local`). */
    userDnTemplate: string;
    tlsSkipVerify: boolean;
    startTls: boolean;
    requiredGroup: string;
    adminGroup: string;
    /** Username sempre admin, anche senza il gruppo AD (minuscoli). */
    adminUsernames: string[];
  };
  /** Servizio interno che espone il DB Tinn in sola lettura. */
  tinnGatewayUrl: string;
  mcp: {
    /** Server MCP su /mcp. Spento di default: i client MCP mandano i dati Tinn al loro modello (cloud). */
    enabled: boolean;
    /** Durata massima di un token personale. */
    tokenMaxDays: number;
    /** URL pubblico dell'endpoint MCP mostrato agli operatori (es. https://attipa.ente.it/api/mcp). */
    publicUrl: string;
  };
  /** Servizio interno di generazione documenti (RTF/DOCX/PDF). */
  docgenUrl: string;
  llm: {
    /** Oggi solo `openai-compatible` (Ollama, vLLM, LocalAI, OpenAI e altri con /v1/chat/completions). */
    provider: string;
    /** Base dell'API, es. http://ollama:11434/v1 */
    baseUrl: string;
    model: string;
    /** Bearer per i provider che la richiedono (vuota per Ollama locale). */
    apiKey: string;
    /** Timeout di una singola chiamata al modello. */
    timeoutMs: number;
    /** Chiamate al modello per una risposta dell'assistente (strumenti compresi). */
    maxSteps: number;
  };
}

export const DEFAULT_JWT_SECRET = 'change-me-in-production';

export default (): AppConfiguration => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: Number(process.env['PORT'] ?? 8080),
  database: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  jwt: {
    secret: process.env['JWT_SECRET'] || DEFAULT_JWT_SECRET,
    expiresInSeconds: Number(process.env['JWT_EXPIRES_IN_SECONDS'] || 8 * 60 * 60),
  },
  ldap: {
    host: process.env['LDAP_HOST'] ?? '',
    baseDn: process.env['LDAP_BASE_DN'] ?? '',
    userDnTemplate: process.env['LDAP_USER_DN_TEMPLATE'] || '%s',
    tlsSkipVerify: process.env['LDAP_TLS_SKIP_VERIFY'] === 'true',
    startTls: process.env['LDAP_STARTTLS'] === 'true',
    requiredGroup: process.env['LDAP_REQUIRED_GROUP'] || 'ATTIPA_USERS',
    adminGroup: process.env['LDAP_ADMIN_GROUP'] || 'ATTIPA_ADMINS',
    adminUsernames: (process.env['LDAP_ADMIN_USERNAMES'] ?? '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter((u) => u.length > 0),
  },
  tinnGatewayUrl: process.env['TINN_GATEWAY_URL'] ?? 'http://tinn-gateway:8000',
  mcp: {
    enabled: process.env['MCP_ENABLED'] === 'true',
    tokenMaxDays: Number(process.env['MCP_TOKEN_MAX_DAYS'] || 90),
    publicUrl: process.env['MCP_PUBLIC_URL'] || '',
  },
  docgenUrl: process.env['DOCGEN_URL'] ?? 'http://docgen:8000',
  // `||` e non `??`: il compose passa le variabili non impostate come stringa vuota.
  llm: {
    provider: process.env['LLM_PROVIDER'] || 'openai-compatible',
    baseUrl: process.env['LLM_BASE_URL'] || 'http://ollama:11434/v1',
    model: process.env['LLM_MODEL'] || '',
    apiKey: process.env['LLM_API_KEY'] || '',
    timeoutMs: Number(process.env['LLM_TIMEOUT_MS'] || 120_000),
    maxSteps: Number(process.env['LLM_MAX_STEPS'] || 6),
  },
});
