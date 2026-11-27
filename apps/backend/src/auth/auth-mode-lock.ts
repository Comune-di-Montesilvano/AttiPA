import type { Repository } from 'typeorm';
import { AppSetting } from '../entities/app-setting.entity.js';

/**
 * Blocco irreversibile (per istanza) della modalità di login simulata.
 *
 * `LDAP_HOST=mock` abilita admin/admin e operator/operator. Un'istanza che si è
 * avviata almeno una volta con LDAP reale scrive in `app_settings` la riga
 * `system.authRealSeen`; da quel momento un avvio con `LDAP_HOST=mock` sullo
 * stesso DB viene rifiutato (un .env sbagliato in produzione non apre l'accesso).
 *
 * Solo in sviluppo, per tornare in mock dopo un avvio reale:
 * `DELETE FROM app_settings WHERE key = 'system.authRealSeen';`
 */
export const AUTH_REAL_SEEN_KEY = 'system.authRealSeen';

export class AuthModeLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthModeLockError';
  }
}

type SettingsRepo = Pick<Repository<AppSetting>, 'findOneBy' | 'createQueryBuilder'>;

export async function enforceAuthModeLock(ldapHost: string, repo: SettingsRepo, now: Date = new Date()): Promise<'mock' | 'real'> {
  if (ldapHost === 'mock') {
    let marker: AppSetting | null;
    try {
      marker = await repo.findOneBy({ key: AUTH_REAL_SEEN_KEY });
    } catch (err) {
      throw new AuthModeLockError(
        `LDAP_HOST=mock: impossibile leggere "${AUTH_REAL_SEEN_KEY}" in app_settings ` +
          `(${err instanceof Error ? err.message : String(err)}). Avvio rifiutato.`,
      );
    }
    if (marker) {
      throw new AuthModeLockError(
        `LDAP_HOST=mock rifiutato: questa istanza si è già avviata con LDAP reale ` +
          `(${JSON.stringify(marker.value)}). Configurare l'LDAP reale nel .env.`,
      );
    }
    return 'mock';
  }

  // Idempotente: il primo timestamp non si sovrascrive.
  await repo
    .createQueryBuilder()
    .insert()
    .into(AppSetting)
    .values({ key: AUTH_REAL_SEEN_KEY, value: now.toISOString(), updatedBy: 'system' })
    .orIgnore()
    .execute();
  return 'real';
}
