import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, type Repository } from 'typeorm';
import type { ApiTokenInfo, ApiTokensResponse, CreatedApiToken, OperatorRole } from '@attipa/shared-types';
import type { AppConfiguration } from '../config/configuration.js';
import { ApiToken } from '../entities/api-token.entity.js';
import { User } from '../entities/user.entity.js';

/** Prefisso riconoscibile (anche dai secret scanner) dei token personali. */
export const TOKEN_PREFIX = 'attipa_pat_';
/** Token attivi per operatore: oltre, revocare i vecchi. */
export const MAX_ACTIVE_TOKENS = 10;
/** last_used_at aggiornato al più una volta ogni tanto: non una scrittura per ogni chiamata MCP. */
const LAST_USED_RESOLUTION_MS = 5 * 60_000;

export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/** Operatore autenticato con un token personale. */
export interface TokenPrincipal {
  username: string;
  displayName: string;
  role: OperatorRole;
  tokenId: string;
}

function toInfo(t: ApiToken): ApiTokenInfo {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    createdAt: t.createdAt.toISOString(),
    expiresAt: t.expiresAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class TokensService {
  private readonly cfg: AppConfiguration['mcp'];

  constructor(
    @InjectRepository(ApiToken) private readonly tokens: Repository<ApiToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
    config: ConfigService<AppConfiguration, true>,
  ) {
    this.cfg = config.get('mcp', { infer: true });
  }

  async list(username: string): Promise<ApiTokensResponse> {
    const tokens = await this.tokens.find({ where: { username }, order: { createdAt: 'DESC' } });
    return { mcpEnabled: this.cfg.enabled, mcpUrl: this.cfg.publicUrl, maxDays: this.cfg.tokenMaxDays, tokens: tokens.map(toInfo) };
  }

  async create(username: string, name: string, days: number, now: Date = new Date()): Promise<CreatedApiToken> {
    if (!this.cfg.enabled) throw new ForbiddenException('Server MCP non attivo (MCP_ENABLED)');
    if (days > this.cfg.tokenMaxDays) throw new BadRequestException(`Durata massima ${this.cfg.tokenMaxDays} giorni`);
    const active = await this.tokens.count({ where: { username, revokedAt: IsNull(), expiresAt: MoreThan(now) } });
    if (active >= MAX_ACTIVE_TOKENS) throw new BadRequestException(`Al massimo ${MAX_ACTIVE_TOKENS} token attivi: revocane uno`);
    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const row = this.tokens.create({
      id: randomUUID(),
      username,
      name: name.trim(),
      tokenHash: hashToken(token),
      prefix: token.slice(0, TOKEN_PREFIX.length + 4),
      createdAt: now,
      expiresAt: new Date(now.getTime() + days * 86_400_000),
      lastUsedAt: null,
      revokedAt: null,
    });
    await this.tokens.insert(row);
    return { ...toInfo(row), token };
  }

  /** Revoca un token dell'operatore (idempotente). */
  async revoke(username: string, id: string, now: Date = new Date()): Promise<void> {
    const row = await this.tokens.findOne({ where: { id, username } });
    if (!row) throw new NotFoundException('Token non trovato');
    if (!row.revokedAt) await this.tokens.update({ id }, { revokedAt: now });
  }

  /**
   * Operatore del token, o null se sconosciuto, revocato, scaduto, o server MCP spento.
   * Il ruolo è quello dell'ultimo login AD: chi perde il gruppo smette di entrare in AttiPA
   * ma i suoi token restano validi fino a scadenza o revoca (vedi CLAUDE.md).
   */
  async verify(token: string, now: Date = new Date()): Promise<TokenPrincipal | null> {
    if (!this.cfg.enabled || !token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
    const row = await this.tokens.findOne({ where: { tokenHash: hashToken(token) } });
    if (!row || row.revokedAt || row.expiresAt <= now) return null;
    const user = await this.users.findOne({ where: { username: row.username } });
    if (!user) return null;
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      await this.tokens.update({ id: row.id }, { lastUsedAt: now });
    }
    return { username: user.username, displayName: user.displayName, role: user.role, tokenId: row.id };
  }
}
