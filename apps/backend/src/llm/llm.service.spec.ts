import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../config/configuration.js';
import { LlmService } from './llm.service.js';

type Llm = AppConfiguration['llm'];
const base: Llm = { provider: 'openai-compatible', baseUrl: 'http://ollama:11434/v1', model: 'qwen3', apiKey: 'segreta', timeoutMs: 1000, maxSteps: 6 };
const service = (llm: Partial<Llm> = {}) => new LlmService({ get: () => ({ ...base, ...llm }) } as unknown as ConfigService<AppConfiguration, true>);
const models = (ids: string[]) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: ids.map((id) => ({ id })) })));

describe('LlmService.status', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('raggiungibile, modello senza tag = :latest; nessuna credenziale nella risposta', async () => {
    vi.stubGlobal('fetch', models(['qwen3:latest', 'llama3:8b']));
    const s = await service().status();
    expect(s).toEqual({ provider: 'openai-compatible', model: 'qwen3', endpoint: 'ollama:11434', reachable: true, modelAvailable: true });
    expect(JSON.stringify(s)).not.toContain('segreta');
  });

  it('modello assente sull\'endpoint', async () => {
    vi.stubGlobal('fetch', models(['llama3:8b']));
    await expect(service({ model: 'qwen3:8b' }).status()).resolves.toMatchObject({ reachable: true, modelAvailable: false, error: expect.stringContaining('non presente') });
  });

  it('endpoint giù', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(service().status()).resolves.toMatchObject({ reachable: false, error: 'Modello non raggiungibile' });
  });

  it('configurazione incompleta: nessuna chiamata, errore chiaro', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(service({ model: '' }).status()).resolves.toMatchObject({ error: 'LLM_MODEL non configurato' });
    await expect(service({ provider: 'altro' }).status()).resolves.toMatchObject({ error: expect.stringContaining("'altro' non supportato") });
    await expect(service({ model: '' }).chat({ messages: [] })).rejects.toThrow('LLM_MODEL non configurato');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
