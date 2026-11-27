import { vi } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/configuration.js';
import { TinnService } from './tinn.service.js';

function service(): TinnService {
  const config = { get: () => 'http://tinn-gateway:8000/' } as unknown as ConfigService<AppConfiguration, true>;
  return new TinnService(config);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('TinnService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converte la risposta del gateway in TinnInfo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ backup_date: '2026-11-26T04:54:00', restored_at: '2026-11-26T05:30:00' }));
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

  it('runQuery: POST con parametri e limite, nome codificato nel percorso', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ columns: ['A'], rows: [[1]], truncated: false }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(service().runQuery('storia_capitolo', { CAPITOLO: 10565 }, 50)).resolves.toEqual({
      columns: ['A'],
      rows: [[1]],
      truncated: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://tinn-gateway:8000/queries/storia_capitolo');
    expect(JSON.parse(init.body as string)).toEqual({ params: { CAPITOLO: 10565 }, limit: 50 });
    await service().runQuery('../x', {});
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://tinn-gateway:8000/queries/..%2Fx');
  });

  it('runQuery: 400 del gateway → BadRequest con il suo messaggio; 503 → indisponibile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'parametro mancante: ANNO' }, 400)));
    await expect(service().runQuery('q', {})).rejects.toThrow(new BadRequestException('parametro mancante: ANNO'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'DB Tinn non ancora ripristinato' }, 503)));
    await expect(service().runQuery('q', {})).rejects.toThrow('tinn-gateway: DB Tinn non ancora ripristinato');
  });

  it('listQueries restituisce l\'elenco del gateway', async () => {
    const list = [{ name: 'q', description: 'd', params: [{ name: 'ANNO', type: 'number' }] }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(list)));
    await expect(service().listQueries()).resolves.toEqual(list);
  });
});
