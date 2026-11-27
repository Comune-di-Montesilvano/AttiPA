import type { ApiTokenInfo } from '@attipa/shared-types';

/** URL dell'endpoint MCP: quello configurato (MCP_PUBLIC_URL) o ricavato dall'indirizzo dell'API. */
export function mcpEndpoint(configured: string, apiBaseUrl: string, origin: string): string {
  if (configured) return configured;
  const base = apiBaseUrl.startsWith('http') ? apiBaseUrl : `${origin}${apiBaseUrl}`;
  return `${base.replace(/\/+$/, '')}/mcp`;
}

/** Comando per Claude Code; altri client: header `Authorization: Bearer <token>`. */
export function claudeCodeCommand(url: string, token: string): string {
  return `claude mcp add --transport http attipa ${url} --header "Authorization: Bearer ${token}"`;
}

export type TokenState = 'attivo' | 'revocato' | 'scaduto';

export function tokenState(t: ApiTokenInfo, now: Date = new Date()): TokenState {
  if (t.revokedAt) return 'revocato';
  return new Date(t.expiresAt) <= now ? 'scaduto' : 'attivo';
}
