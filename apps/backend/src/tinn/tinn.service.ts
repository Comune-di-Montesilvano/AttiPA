import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TinnInfo } from '@attipa/shared-types';
import type { AppConfiguration } from '../config/configuration.js';

/** Query della whitelist di tinn-gateway (services/tinn-gateway/queries). */
export interface TinnQueryDef {
  name: string;
  /** Commento in testa al file .sql: scopo, parametri, regole. */
  description: string;
  params: { name: string; type: 'string' | 'number' }[];
}

export interface TinnQueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

/** Client del servizio interno tinn-gateway (DB Tinn in sola lettura). */
@Injectable()
export class TinnService {
  private readonly baseUrl: string;

  constructor(config: ConfigService<AppConfiguration, true>) {
    this.baseUrl = config.get('tinnGatewayUrl', { infer: true }).replace(/\/+$/, '');
  }

  private async call(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ServiceUnavailableException('tinn-gateway non raggiungibile');
    }
    if (!res.ok) {
      const detail = await res
        .json()
        .then((b: { detail?: unknown }) => (typeof b.detail === 'string' ? b.detail : ''))
        .catch(() => '');
      // 400 = parametri o query non validi (messaggio del gateway); il resto è indisponibilità.
      if (res.status === 400) throw new BadRequestException(detail || 'Query non valida');
      throw new ServiceUnavailableException(detail ? `tinn-gateway: ${detail}` : `tinn-gateway: HTTP ${res.status}`);
    }
    return res.json();
  }

  async info(): Promise<TinnInfo> {
    const body = (await this.call('/info')) as { backup_date?: string | null; restored_at?: string | null };
    return { backupDate: body.backup_date ?? null, restoredAt: body.restored_at ?? null };
  }

  async listQueries(): Promise<TinnQueryDef[]> {
    return (await this.call('/queries')) as TinnQueryDef[];
  }

  /** Esegue una query della whitelist. Le query sui capitoli possono durare decine di secondi. */
  async runQuery(name: string, params: Record<string, string | number>, limit = 1000): Promise<TinnQueryResult> {
    return (await this.call(
      `/queries/${encodeURIComponent(name)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params, limit }) },
      120_000,
    )) as TinnQueryResult;
  }
}
