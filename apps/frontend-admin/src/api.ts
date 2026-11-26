import type { TinnInfo, VersionInfo } from '@attipa/shared-types';

export function apiBase(config: Window['__ATTIPA_CONFIG__']): string {
  return (config?.apiBase || '/api').replace(/\/+$/, '');
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase(window.__ATTIPA_CONFIG__)}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${path}`);
  return (await res.json()) as T;
}

export const getVersion = () => get<VersionInfo>('/version');
export const getTinnInfo = () => get<TinnInfo>('/tinn/info');

/** Data ISO → gg/mm/aaaa hh:mm, «mai» se assente. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return 'mai';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' });
}
