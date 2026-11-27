// Tipi condivisi tra backend e frontend.

/** Risposta di GET /version del backend. */
export interface VersionInfo {
  version: string;
}

/** Stato del DB Tinn ripristinato da tinn-gateway (GET /tinn/info del backend). */
export interface TinnInfo {
  /** Data del file di backup sul server SFTP (ISO 8601), null se mai ripristinato. */
  backupDate: string | null;
  /** Momento del ripristino (ISO 8601), null se mai ripristinato. */
  restoredAt: string | null;
}

/** Ruolo dell'operatore, dai gruppi AD (LDAP_ADMIN_GROUP / LDAP_REQUIRED_GROUP). */
export type OperatorRole = 'admin' | 'user';

/** Contenuto del JWT operatore emesso da POST /auth/login. */
export interface JwtOperatorPayload {
  sub: string;
  username: string;
  displayName: string;
  role: OperatorRole;
  type: 'operator';
  iat?: number;
  exp?: number;
}

/** Risposta di POST /auth/login. */
export interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  username: string;
  displayName: string;
  role: OperatorRole;
}

/**
 * Importo in formato italiano: 1.234,56 €. A mano e non con Intl: in it-IT
 * Intl non separa le migliaia sotto 10.000 (1234,56).
 */
export function formatEuro(value: number): string {
  const [int = '0', dec = '00'] = Math.abs(value).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped},${dec} €`;
}
