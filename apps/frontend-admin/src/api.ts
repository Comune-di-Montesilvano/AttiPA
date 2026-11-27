import type { AssistantChatResponse, AssistantMessage, AuthResponse, LlmStatus, TinnInfo, VersionInfo } from '@attipa/shared-types';
import { clearSession, loadSession } from './session';

export function apiBase(config: Window['__ATTIPA_CONFIG__']): string {
  return (config?.apiBase || '/api').replace(/\/+$/, '');
}

/** Evento lanciato quando il backend rifiuta il token (scaduto o revocato): si torna al login. */
export const SESSION_EXPIRED_EVENT = 'attipa:session-expired';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    // corpo non JSON
  }
  return `HTTP ${res.status}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = loadSession(localStorage);
  const headers = new Headers(init.headers);
  if (session) headers.set('Authorization', `Bearer ${session.token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${apiBase(window.__ATTIPA_CONFIG__)}${path}`, { ...init, headers });
  if (res.status === 401 && session) {
    clearSession(localStorage);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as T;
}

export const getVersion = () => request<VersionInfo>('/version');
export const getTinnInfo = () => request<TinnInfo>('/tinn/info');
export const getLlmStatus = () => request<LlmStatus>('/llm/status');
export const askAssistant = (messages: AssistantMessage[]) =>
  request<AssistantChatResponse>('/assistant/chat', { method: 'POST', body: JSON.stringify({ messages }) });

export async function login(username: string, password: string): Promise<AuthResponse> {
  try {
    return await request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  } catch (e) {
    throw new Error(loginErrorMessage(e), { cause: e });
  }
}

/** Messaggio per l'utente in caso di login fallito. */
export function loginErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return e.message.startsWith('Accesso non autorizzato') ? e.message : 'Credenziali non valide';
    if (e.status === 400) return 'Username non valido';
    if (e.status === 503) return e.message;
    return `Errore del server (${e.status})`;
  }
  return 'Server non raggiungibile';
}

/** Data ISO → gg/mm/aaaa hh:mm, «mai» se assente. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return 'mai';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' });
}
