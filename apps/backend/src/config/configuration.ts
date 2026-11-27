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
  /** Servizio interno di generazione documenti (RTF/DOCX/PDF). */
  docgenUrl: string;
  llm: {
    /** openai-compatible (Ollama, vLLM, LocalAI…), anthropic, openai. */
    provider: string;
    baseUrl: string;
    model: string;
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
  docgenUrl: process.env['DOCGEN_URL'] ?? 'http://docgen:8000',
  llm: {
    provider: process.env['LLM_PROVIDER'] ?? 'openai-compatible',
    baseUrl: process.env['LLM_BASE_URL'] ?? 'http://ollama:11434/v1',
    model: process.env['LLM_MODEL'] ?? '',
  },
});
