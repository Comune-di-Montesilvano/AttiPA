import { describe, expect, it } from 'vitest';
import type { TinnQueryDef } from '../tinn/tinn.service.js';
import { MAX_CHARS_TO_MODEL, MAX_ROWS_TO_MODEL, coerceParams, queryForToolName, resultForModel, tinnTools, toolNameForQuery } from './tinn-tools.js';

const storia: TinnQueryDef = {
  name: 'storia_capitolo',
  description: 'Storia di un capitolo',
  params: [
    { name: 'CAPITOLO', type: 'number' },
    { name: 'ARTICOLO', type: 'number' },
    { name: 'DAL', type: 'number' },
  ],
};
const fornitore: TinnQueryDef = { name: 'impegni_fornitore', description: '', params: [{ name: 'FORNITORE', type: 'string' }] };

describe('strumenti Tinn', () => {
  it('tinn_info + uno strumento per query, parametri tutti obbligatori', () => {
    const tools = tinnTools([storia, fornitore]);
    expect(tools.map((t) => t.name)).toEqual(['tinn_info', 'tinn_storia_capitolo', 'tinn_impegni_fornitore']);
    expect(tools[1]!.parameters).toEqual({
      type: 'object',
      properties: { CAPITOLO: { type: 'number' }, ARTICOLO: { type: 'number' }, DAL: { type: 'number' } },
      required: ['CAPITOLO', 'ARTICOLO', 'DAL'],
    });
    expect(tools[2]!.description).toBe('impegni_fornitore');
  });

  it('nome strumento ↔ query', () => {
    expect(queryForToolName(toolNameForQuery('storia_capitolo'))).toBe('storia_capitolo');
    expect(queryForToolName('tinn_info')).toBeNull();
    expect(queryForToolName('altro')).toBeNull();
  });

  it('coerceParams: numeri anche da stringa (virgola decimale), testi come stringa', () => {
    expect(coerceParams(storia, { CAPITOLO: '10565', ARTICOLO: 0, DAL: '2022' })).toEqual({ CAPITOLO: 10565, ARTICOLO: 0, DAL: 2022 });
    expect(coerceParams({ name: 'q', description: '', params: [{ name: 'MINIMO', type: 'number' }] }, { MINIMO: '1,5' })).toEqual({ MINIMO: 1.5 });
    expect(coerceParams(fornitore, { FORNITORE: '%ROSSI%' })).toEqual({ FORNITORE: '%ROSSI%' });
  });

  it('coerceParams: mancanti o di tipo sbagliato → errore leggibile per il modello', () => {
    expect(() => coerceParams(storia, { CAPITOLO: 1, ARTICOLO: 0 })).toThrow('parametro mancante: DAL');
    expect(() => coerceParams(storia, { CAPITOLO: 'dieci', ARTICOLO: 0, DAL: 2022 })).toThrow('CAPITOLO: numero atteso');
    expect(() => coerceParams(fornitore, { FORNITORE: { a: 1 } })).toThrow('testo atteso');
  });

  it('resultForModel: righe limitate, nota sul taglio, entro il limite di caratteri', () => {
    const small = JSON.parse(resultForModel({ columns: ['A'], rows: [[1], [2]], truncated: false }));
    expect(small).toEqual({ columns: ['A'], rows: [[1], [2]], shown: 2 });

    const many = JSON.parse(resultForModel({ columns: ['A'], rows: Array.from({ length: 300 }, (_, i) => [i]), truncated: true }));
    expect(many.shown).toBe(MAX_ROWS_TO_MODEL);
    expect(many.note).toContain('mostrate 100 righe di 300+');

    const wide = resultForModel({ columns: ['T'], rows: Array.from({ length: 100 }, () => ['x'.repeat(1000)]), truncated: false });
    expect(wide.length).toBeLessThanOrEqual(MAX_CHARS_TO_MODEL);
    expect(JSON.parse(wide).note).toContain('Risultato parziale');
  });
});
