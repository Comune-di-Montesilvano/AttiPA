import type { TinnQueryDef, TinnQueryResult } from '../tinn/tinn.service.js';
import type { ToolDefinition } from '../llm/llm.types.js';

export const TINN_INFO_TOOL = 'tinn_info';
const QUERY_PREFIX = 'tinn_';

/** Righe e caratteri massimi passati al modello per un risultato (contesto dei modelli locali). */
export const MAX_ROWS_TO_MODEL = 100;
export const MAX_CHARS_TO_MODEL = 15_000;

export function toolNameForQuery(query: string): string {
  return `${QUERY_PREFIX}${query}`;
}

export function queryForToolName(tool: string): string | null {
  return tool.startsWith(QUERY_PREFIX) && tool !== TINN_INFO_TOOL ? tool.slice(QUERY_PREFIX.length) : null;
}

/** Strumenti per il modello: data del backup + una funzione per ogni query della whitelist. */
export function tinnTools(queries: TinnQueryDef[]): ToolDefinition[] {
  return [
    {
      name: TINN_INFO_TOOL,
      description: 'Data del backup del DB Tinn in uso e momento del ripristino.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    ...queries.map((q) => ({
      name: toolNameForQuery(q.name),
      description: q.description || q.name,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(q.params.map((p) => [p.name, { type: p.type }])),
        required: q.params.map((p) => p.name),
      },
    })),
  ];
}

/**
 * Argomenti del modello → parametri della query. I modelli piccoli passano spesso i numeri
 * come stringhe ("2026"): si convertono; tutto il resto è un errore restituito al modello.
 */
export function coerceParams(def: TinnQueryDef, args: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const p of def.params) {
    const v = args[p.name];
    if (v === undefined || v === null || v === '') throw new Error(`parametro mancante: ${p.name}`);
    if (p.type === 'number') {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
      if (!Number.isFinite(n)) throw new Error(`parametro ${p.name}: numero atteso, ricevuto ${JSON.stringify(v)}`);
      out[p.name] = n;
    } else {
      if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`parametro ${p.name}: testo atteso`);
      out[p.name] = String(v);
    }
  }
  return out;
}

/** Risultato in JSON compatto per il modello, entro MAX_ROWS/MAX_CHARS, con l'indicazione del taglio. */
export function resultForModel(r: TinnQueryResult): string {
  let rows = r.rows.slice(0, MAX_ROWS_TO_MODEL);
  const encode = () =>
    JSON.stringify({
      columns: r.columns,
      rows,
      shown: rows.length,
      ...(rows.length < r.rows.length || r.truncated
        ? { note: `Risultato parziale: mostrate ${rows.length} righe di ${r.rows.length}${r.truncated ? '+' : ''}. Restringi i parametri per vedere il resto.` }
        : {}),
    });
  let text = encode();
  while (text.length > MAX_CHARS_TO_MODEL && rows.length > 1) {
    rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)));
    text = encode();
  }
  return text;
}
