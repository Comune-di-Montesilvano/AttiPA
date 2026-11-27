import { describe, expect, it } from 'vitest';
import type { ApiTokenInfo } from '@attipa/shared-types';
import { claudeCodeCommand, mcpEndpoint, tokenState } from '../src/mcp-format';

describe('mcpEndpoint', () => {
  it('URL configurato, altrimenti base API relativa o assoluta + /mcp', () => {
    expect(mcpEndpoint('https://attipa.ente.it/api/mcp', '/api', 'http://x')).toBe('https://attipa.ente.it/api/mcp');
    expect(mcpEndpoint('', '/api', 'https://attipa.ente.it')).toBe('https://attipa.ente.it/api/mcp');
    expect(mcpEndpoint('', 'http://localhost:8081/', 'http://localhost:3000')).toBe('http://localhost:8081/mcp');
  });
});

describe('claudeCodeCommand', () => {
  it('trasporto http con header Authorization', () => {
    expect(claudeCodeCommand('https://a/api/mcp', 'attipa_pat_x')).toBe(
      'claude mcp add --transport http attipa https://a/api/mcp --header "Authorization: Bearer attipa_pat_x"',
    );
  });
});

describe('tokenState', () => {
  const t: ApiTokenInfo = {
    id: '1',
    name: 'n',
    prefix: 'attipa_pat_abcd',
    createdAt: '2026-11-01T00:00:00Z',
    expiresAt: '2026-12-01T00:00:00Z',
    lastUsedAt: null,
    revokedAt: null,
  };
  const now = new Date('2026-11-27T00:00:00Z');
  it('attivo, scaduto, revocato', () => {
    expect(tokenState(t, now)).toBe('attivo');
    expect(tokenState({ ...t, expiresAt: '2026-11-26T00:00:00Z' }, now)).toBe('scaduto');
    expect(tokenState({ ...t, revokedAt: '2026-11-20T00:00:00Z' }, now)).toBe('revocato');
  });
});
