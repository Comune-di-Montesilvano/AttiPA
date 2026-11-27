import { DEFAULT_JWT_SECRET } from './configuration.js';

const MIN_SECRET_LENGTH = 32;

/**
 * Rifiuta l'avvio fuori dallo sviluppo con un segreto JWT di default o corto:
 * chi lo conosce firma token admin validi.
 */
export function assertProductionSecrets(nodeEnv: string, jwtSecret: string): void {
  if (nodeEnv === 'development') return;
  if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET assente, di default o più corto di ${MIN_SECRET_LENGTH} caratteri: ` +
        `generarne uno con "openssl rand -hex 32" prima di avviare in ambiente '${nodeEnv}'.`,
    );
  }
}
