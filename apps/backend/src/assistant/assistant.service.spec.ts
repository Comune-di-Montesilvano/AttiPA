import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { LlmService } from '../llm/llm.service.js';
import { LlmError, type ChatRequest, type ChatResult } from '../llm/llm.types.js';
import type { TinnService } from '../tinn/tinn.service.js';
import { TinnToolsService } from '../tools/tinn-tools.service.js';
import { AssistantService as Svc } from './assistant.service.js';

/** Servizio con il vero TinnToolsService sopra il TinnService finto. */
class AssistantService extends Svc {
  constructor(llm: LlmService, tinn: TinnService) {
    super(llm, new TinnToolsService(tinn));
  }
}

const queries = [{ name: 'storia_capitolo', description: 'Storia', params: [{ name: 'CAPITOLO', type: 'number' as const }] }];

/** Modello finto: risponde in sequenza con i risultati dati e registra le richieste. */
function fakeLlm(results: ChatResult[], maxSteps = 6) {
  const requests: ChatRequest[] = [];
  const chat = vi.fn(async (req: ChatRequest) => {
    requests.push(structuredClone(req));
    const next = results.shift();
    if (!next) throw new Error('nessuna risposta preparata');
    return next;
  });
  return { llm: { chat, maxSteps } as unknown as LlmService, requests, chat };
}

function fakeTinn(overrides: Partial<Record<keyof TinnService, unknown>> = {}) {
  return {
    listQueries: vi.fn().mockResolvedValue(queries),
    info: vi.fn().mockResolvedValue({ backupDate: '2026-11-27T04:01:53', restoredAt: '2026-11-27T06:08:56' }),
    runQuery: vi.fn().mockResolvedValue({ columns: ['ANNO', 'ASSESTATO'], rows: [[2026, 1500.5]], truncated: false }),
    ...overrides,
  } as unknown as TinnService & { runQuery: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
}

const ask = [{ role: 'user' as const, content: 'storia del capitolo 10565' }];
const now = new Date('2026-11-27T10:00:00Z');
const text = (content: string): ChatResult => ({ content, toolCalls: [] });
const call = (name: string, args: Record<string, unknown>, id = 'c1'): ChatResult => ({ content: '', toolCalls: [{ id, name, arguments: args }] });

describe('AssistantService', () => {
  it('risposta diretta: prompt di sistema con la data, strumenti Tinn offerti', async () => {
    const { llm, requests } = fakeLlm([text('Ciao')]);
    const res = await new AssistantService(llm, fakeTinn()).chat(ask, 'mrossi', now);
    expect(res).toEqual({ reply: 'Ciao', steps: [] });
    expect(requests[0]!.messages[0]).toMatchObject({ role: 'system', content: expect.stringContaining('27/11/2026') });
    expect(requests[0]!.messages[1]).toEqual(ask[0]);
    expect(requests[0]!.tools!.map((t) => t.name)).toEqual(['tinn_info', 'tinn_storia_capitolo']);
  });

  it('ciclo strumenti: query eseguita con parametri convertiti, risultato restituito al modello', async () => {
    const { llm, requests } = fakeLlm([call('tinn_storia_capitolo', { CAPITOLO: '10565' }), text('Assestato 1.500,50 €')]);
    const tinn = fakeTinn();
    const res = await new AssistantService(llm, tinn).chat(ask, 'mrossi', now);
    expect(tinn.runQuery).toHaveBeenCalledWith('storia_capitolo', { CAPITOLO: 10565 }, 500);
    expect(res).toEqual({ reply: 'Assestato 1.500,50 €', steps: [{ tool: 'tinn_storia_capitolo', params: { CAPITOLO: 10565 }, rows: 1, truncated: false }] });
    const second = requests[1]!.messages;
    expect(second.at(-2)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1', name: 'tinn_storia_capitolo' }] });
    expect(second.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'c1' });
    expect(JSON.parse((second.at(-1) as { content: string }).content)).toMatchObject({ columns: ['ANNO', 'ASSESTATO'], rows: [[2026, 1500.5]] });
  });

  it('tinn_info e più strumenti nello stesso turno', async () => {
    const both: ChatResult = {
      content: '',
      toolCalls: [
        { id: 'a', name: 'tinn_info', arguments: {} },
        { id: 'b', name: 'tinn_storia_capitolo', arguments: { CAPITOLO: 1 } },
      ],
    };
    const { llm, requests } = fakeLlm([both, text('fatto')]);
    const res = await new AssistantService(llm, fakeTinn()).chat(ask, 'u', now);
    expect(res.steps.map((s) => s.tool)).toEqual(['tinn_info', 'tinn_storia_capitolo']);
    expect(requests[1]!.messages.filter((m) => m.role === 'tool')).toHaveLength(2);
  });

  it('errori degli strumenti tornano al modello, non interrompono la risposta', async () => {
    const tinn = fakeTinn({ runQuery: vi.fn().mockRejectedValue(new BadRequestException('string right truncation')) });
    const { llm, requests } = fakeLlm([
      call('tinn_inventato', {}, 'x'),
      call('tinn_storia_capitolo', {}, 'y'),
      call('tinn_storia_capitolo', { CAPITOLO: 1 }, 'z'),
      text('Non riesco a leggere il dato.'),
    ]);
    const res = await new AssistantService(llm, tinn).chat(ask, 'u', now);
    expect(res.steps.map((s) => s.error)).toEqual(['strumento inesistente: tinn_inventato', 'parametro mancante: CAPITOLO', 'string right truncation']);
    expect(requests[1]!.messages.at(-1)).toMatchObject({ role: 'tool', content: JSON.stringify({ error: 'strumento inesistente: tinn_inventato' }) });
    expect(res.reply).toBe('Non riesco a leggere il dato.');
  });

  it('passi esauriti: chiamata finale senza strumenti', async () => {
    const { llm, requests } = fakeLlm([call('tinn_info', {}), call('tinn_info', {}), text('Riepilogo')], 2);
    const res = await new AssistantService(llm, fakeTinn()).chat(ask, 'u', now);
    expect(res.reply).toBe('Riepilogo');
    expect(requests).toHaveLength(3);
    expect(requests[2]!.tools).toBeUndefined();
    expect(requests[2]!.messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('Rispondi ora') });
  });

  it('gateway giù: nessuno strumento, avviso nel prompt', async () => {
    const { llm, requests } = fakeLlm([text('Il DB non è disponibile.')]);
    await new AssistantService(llm, fakeTinn({ listQueries: vi.fn().mockRejectedValue(new Error('giù')) })).chat(ask, 'u', now);
    expect(requests[0]!.tools).toEqual([]);
    expect(requests[0]!.messages[0]).toMatchObject({ content: expect.stringContaining('non è raggiungibile') });
  });

  it('modello giù → 503 con il messaggio; risposta vuota → testo di ripiego', async () => {
    const { llm } = fakeLlm([]);
    (llm.chat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new LlmError('Modello non raggiungibile'));
    await expect(new AssistantService(llm, fakeTinn()).chat(ask, 'u', now)).rejects.toThrow(new ServiceUnavailableException('Modello non raggiungibile'));
    const empty = fakeLlm([text('  ')]);
    await expect(new AssistantService(empty.llm, fakeTinn()).chat(ask, 'u', now)).resolves.toMatchObject({ reply: expect.stringContaining('non ha prodotto') });
  });
});
