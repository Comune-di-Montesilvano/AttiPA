import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';
import { LlmError } from './llm.types.js';

const opts = { baseUrl: 'http://ollama:11434/v1/', model: 'qwen3:8b', apiKey: '', timeoutMs: 1000 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('OpenAiCompatibleProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('chat: corpo Chat Completions, strumenti, risposta testuale', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ choices: [{ message: { role: 'assistant', content: 'Ciao' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await new OpenAiCompatibleProvider(opts).chat({
      messages: [{ role: 'user', content: 'ciao' }],
      tools: [{ name: 't', description: 'd', parameters: { type: 'object', properties: {}, required: [] } }],
    });
    expect(res).toEqual({ content: 'Ciao', toolCalls: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ollama:11434/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'qwen3:8b', stream: true, messages: [{ role: 'user', content: 'ciao' }] });
    expect(body.tools[0]).toEqual({ type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object', properties: {}, required: [] } } });
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('tool call con argomenti stringa JSON (OpenAI) o oggetto (Ollama)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  { id: 'a', type: 'function', function: { name: 'x', arguments: '{"ANNO":2026}' } },
                  { function: { name: 'y', arguments: { CAPITOLO: '10565' } } },
                ],
              },
            },
          ],
        }),
      ),
    );
    const res = await new OpenAiCompatibleProvider(opts).chat({ messages: [] });
    expect(res).toEqual({
      content: '',
      toolCalls: [
        { id: 'a', name: 'x', arguments: { ANNO: 2026 } },
        { id: 'call_1', name: 'y', arguments: { CAPITOLO: '10565' } },
      ],
    });
  });

  it('messaggi assistant con tool call e messaggi tool nel formato del filo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await new OpenAiCompatibleProvider(opts).chat({
      messages: [
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'x', arguments: { A: 1 } }] },
        { role: 'tool', toolCallId: 'a', content: '{}' },
      ],
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.messages).toEqual([
      { role: 'assistant', content: '', tool_calls: [{ id: 'a', type: 'function', function: { name: 'x', arguments: '{"A":1}' } }] },
      { role: 'tool', tool_call_id: 'a', content: '{}' },
    ]);
    expect(body.tools).toBeUndefined();
  });

  it('chiave API come Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ id: 'm1' }, { id: 'm2' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OpenAiCompatibleProvider({ ...opts, apiKey: 'sk-x' }).models()).resolves.toEqual(['m1', 'm2']);
    expect(((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>)['Authorization']).toBe('Bearer sk-x');
  });

  it('errori: rete, HTTP, timeout, argomenti illeggibili, risposta vuota', async () => {
    const p = new OpenAiCompatibleProvider(opts);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(p.models()).rejects.toThrow(new LlmError('Modello non raggiungibile'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })));
    await expect(p.models()).rejects.toThrow('Modello non raggiungibile (ECONNREFUSED)');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })));
    await expect(p.models()).rejects.toThrow('entro 1 s');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('model "x" not found', { status: 404 })));
    await expect(p.chat({ messages: [] })).rejects.toThrow('HTTP 404: model "x" not found');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ choices: [{ message: { tool_calls: [{ function: { name: 'x', arguments: '{rotto' } }] } }] })));
    await expect(p.chat({ messages: [] })).rejects.toThrow('argomenti non validi');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ choices: [] })));
    await expect(p.chat({ messages: [] })).rejects.toThrow('senza messaggio');
  });

  it('streaming SSE: testo e tool call a frammenti ricomposti per index', async () => {
    const events = [
      { choices: [{ delta: { role: 'assistant', content: 'Contro' } }] },
      { choices: [{ delta: { content: 'llo.' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'tinn_q', arguments: '{"ANNO":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '2026}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 1, function: { name: 'tinn_info', arguments: { X: 1 } } }] } }] },
    ];
    const sse = events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('') + 'data: [DONE]';
    // Spezzato a metà di una riga, come può capitare sulla rete.
    const enc = new TextEncoder().encode(sse);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.slice(0, 37));
        c.enqueue(enc.slice(37));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })));
    await expect(new OpenAiCompatibleProvider(opts).chat({ messages: [] })).resolves.toEqual({
      content: 'Controllo.',
      toolCalls: [
        { id: 'a', name: 'tinn_q', arguments: { ANNO: 2026 } },
        { id: 'call_1', name: 'tinn_info', arguments: { X: 1 } },
      ],
    });
  });

  it('streaming SSE: frammento illeggibile → errore', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: {rotto\n\n', { headers: { 'Content-Type': 'text/event-stream' } })));
    await expect(new OpenAiCompatibleProvider(opts).chat({ messages: [] })).rejects.toThrow('non leggibile');
  });
});
