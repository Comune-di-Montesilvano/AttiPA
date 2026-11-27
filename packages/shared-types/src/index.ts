// Tipi condivisi tra backend e frontend.

/** Risposta di GET /version del backend. */
export interface VersionInfo {
  version: string;
}

/** Stato del DB Tinn ripristinato da tinn-gateway (GET /tinn/info del backend). */
export interface TinnInfo {
  /** Data del file di backup sul server SFTP (ISO 8601), null se mai ripristinato. */
  backupDate: string | null;
  /** Momento del ripristino (ISO 8601), null se mai ripristinato. */
  restoredAt: string | null;
}

/** Ruolo dell'operatore, dai gruppi AD (LDAP_ADMIN_GROUP / LDAP_REQUIRED_GROUP). */
export type OperatorRole = 'admin' | 'user';

/** Contenuto del JWT operatore emesso da POST /auth/login. */
export interface JwtOperatorPayload {
  sub: string;
  username: string;
  displayName: string;
  role: OperatorRole;
  type: 'operator';
  iat?: number;
  exp?: number;
}

/** Risposta di POST /auth/login. */
export interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  username: string;
  displayName: string;
  role: OperatorRole;
}

/** GET /llm/status: modello configurato e raggiungibilità dell'endpoint. */
export interface LlmStatus {
  provider: string;
  model: string;
  /** Host dell'endpoint (senza credenziali né percorso). */
  endpoint: string;
  reachable: boolean;
  /** Il modello configurato è tra quelli offerti dall'endpoint. */
  modelAvailable: boolean;
  error?: string;
}

/** Messaggio della conversazione con l'assistente (solo testo, lato utente). */
export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Strumento usato dall'assistente per rispondere (mostrato all'operatore per trasparenza). */
export interface AssistantStep {
  tool: string;
  params: Record<string, unknown>;
  /** Righe restituite (assente se errore). */
  rows?: number;
  truncated?: boolean;
  error?: string;
}

/** POST /assistant/chat */
export interface AssistantChatResponse {
  reply: string;
  steps: AssistantStep[];
}

/** Token personale per i client MCP (mai il token in chiaro, tranne alla creazione). */
export interface ApiTokenInfo {
  id: string;
  name: string;
  /** Primi caratteri, per riconoscerlo. */
  prefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** GET /tokens */
export interface ApiTokensResponse {
  /** Server MCP attivo (MCP_ENABLED). */
  mcpEnabled: boolean;
  /** URL dell'endpoint MCP da configurare nel client, vuoto se non impostato. */
  mcpUrl: string;
  maxDays: number;
  tokens: ApiTokenInfo[];
}

/** POST /tokens: il token in chiaro compare solo qui. */
export interface CreatedApiToken extends ApiTokenInfo {
  token: string;
}

/**
 * Importo in formato italiano: 1.234,56 €. A mano e non con Intl: in it-IT
 * Intl non separa le migliaia sotto 10.000 (1234,56).
 */
export function formatEuro(value: number): string {
  const [int = '0', dec = '00'] = Math.abs(value).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped},${dec} €`;
}
