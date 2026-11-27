import { describe, expect, it } from 'vitest';
import { describeLlmStatus, describeStep } from '../src/assistant-format';

describe('describeStep', () => {
  it('query con parametri e righe', () => {
    expect(describeStep({ tool: 'tinn_storia_capitolo', params: { CAPITOLO: 10565, DAL: 2022 }, rows: 12, truncated: false })).toBe(
      'storia capitolo (CAPITOLO=10565, DAL=2022): 12 righe',
    );
    expect(describeStep({ tool: 'tinn_info', params: {}, rows: 1 })).toBe('info: 1 riga');
    expect(describeStep({ tool: 'tinn_impegni_fornitore', params: { FORNITORE: '%X%' }, rows: 500, truncated: true })).toBe(
      'impegni fornitore (FORNITORE=%X%): 500 righe (parziale)',
    );
  });

  it('errore', () => {
    expect(describeStep({ tool: 'tinn_q', params: {}, error: 'parametro mancante: ANNO' })).toBe('q: errore — parametro mancante: ANNO');
  });
});

describe('describeLlmStatus', () => {
  const base = { provider: 'openai-compatible', model: 'qwen3:8b', endpoint: 'ollama:11434', reachable: true, modelAvailable: true };
  it('pronto o con errore', () => {
    expect(describeLlmStatus(base)).toBe('Modello qwen3:8b su ollama:11434: pronto');
    expect(describeLlmStatus({ ...base, model: '', reachable: false, error: 'LLM_MODEL non configurato' })).toBe(
      'Modello (nessun modello) su ollama:11434: LLM_MODEL non configurato',
    );
  });
});
