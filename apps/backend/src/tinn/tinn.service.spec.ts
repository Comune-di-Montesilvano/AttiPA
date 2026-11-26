import { vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/configuration.js';
import { TinnService } from './tinn.service.js';

function service(): TinnService {
  const config = { get: () => 'http://tinn-gateway:8000/' } as unknown as ConfigService<AppConfiguration, true>;
  return new TinnService(config);
}

describe('TinnService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte la risposta del gateway in TinnInfo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ backup_date: '2026-11-26T04:54:00', restored_at: '2026-11-26T05:30:00' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(service().info()).resolves.toEqual({
      backupDate: '2026-11-26T04:54:00',
      restoredAt: '2026-11-26T05:30:00',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://tinn-gateway:8000/info');
  });

  it('DB mai ripristinato: date null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(service().info()).resolves.toEqual({ backupDate: null, restoredAt: null });
  });

  it('gateway giù o in errore: 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(service().info()).rejects.toBeInstanceOf(ServiceUnavailableException);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(service().info()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
