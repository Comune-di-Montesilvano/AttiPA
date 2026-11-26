import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TinnInfo } from '@attipa/shared-types';
import type { AppConfiguration } from '../config/configuration.js';

/** Client del servizio interno tinn-gateway (DB Tinn in sola lettura). */
@Injectable()
export class TinnService {
  private readonly baseUrl: string;

  constructor(config: ConfigService<AppConfiguration, true>) {
    this.baseUrl = config.get('tinnGatewayUrl', { infer: true }).replace(/\/+$/, '');
  }

  async info(): Promise<TinnInfo> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/info`, { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new ServiceUnavailableException('tinn-gateway non raggiungibile');
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(`tinn-gateway: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { backup_date?: string | null; restored_at?: string | null };
    return { backupDate: body.backup_date ?? null, restoredAt: body.restored_at ?? null };
  }
}
