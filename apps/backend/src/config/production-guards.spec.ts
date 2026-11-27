import { describe, expect, it } from 'vitest';
import { assertProductionSecrets } from './production-guards.js';
import { DEFAULT_JWT_SECRET } from './configuration.js';

describe('assertProductionSecrets', () => {
  const strong = 'a'.repeat(64);

  it('in sviluppo accetta anche il default', () => {
    expect(() => assertProductionSecrets('development', DEFAULT_JWT_SECRET)).not.toThrow();
  });

  it('fuori dallo sviluppo rifiuta default e segreti corti', () => {
    expect(() => assertProductionSecrets('production', DEFAULT_JWT_SECRET)).toThrow(/JWT_SECRET/);
    expect(() => assertProductionSecrets('production', 'corto')).toThrow(/32 caratteri/);
    expect(() => assertProductionSecrets('test', DEFAULT_JWT_SECRET)).toThrow();
  });

  it('accetta un segreto robusto', () => {
    expect(() => assertProductionSecrets('production', strong)).not.toThrow();
  });
});
