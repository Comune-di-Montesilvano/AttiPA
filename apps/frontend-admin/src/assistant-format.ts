import type { AssistantStep, LlmStatus } from '@attipa/shared-types';

/** Riga leggibile per uno strumento usato dall'assistente. */
export function describeStep(step: AssistantStep): string {
  const name = step.tool.replace(/^tinn_/, '').replace(/_/g, ' ');
  const params = Object.entries(step.params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ');
  const head = params ? `${name} (${params})` : name;
  if (step.error) return `${head}: errore — ${step.error}`;
  if (step.rows === undefined) return head;
  return `${head}: ${step.rows} ${step.rows === 1 ? 'riga' : 'righe'}${step.truncated ? ' (parziale)' : ''}`;
}

/** Stato del modello in una riga per l'operatore. */
export function describeLlmStatus(s: LlmStatus): string {
  const model = s.model || '(nessun modello)';
  if (s.error) return `Modello ${model} su ${s.endpoint}: ${s.error}`;
  return `Modello ${model} su ${s.endpoint}: pronto`;
}
