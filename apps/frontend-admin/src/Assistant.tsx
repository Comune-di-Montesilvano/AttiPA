import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AssistantMessage, AssistantStep, LlmStatus } from '@attipa/shared-types';
import { askAssistant, getLlmStatus } from './api';
import { describeLlmStatus, describeStep } from './assistant-format';

interface Turn extends AssistantMessage {
  steps?: AssistantStep[];
}

const bubble = (role: Turn['role']) =>
  ({
    background: role === 'user' ? '#eef3fb' : '#f6f6f6',
    borderRadius: 8,
    padding: '0.5rem 0.75rem',
    margin: '0.5rem 0',
    whiteSpace: 'pre-wrap',
  }) as const;

export function Assistant() {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getLlmStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [turns, busy]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const res = await askAssistant(next.map(({ role, content }) => ({ role, content })));
      setTurns([...next, { role: 'assistant', content: res.reply, steps: res.steps }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // La domanda torna nel campo per riprovare.
      setTurns(turns);
      setInput(text);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section>
      <h2>Assistente</h2>
      {status && <p style={{ color: status.error ? '#a33' : '#666', fontSize: '0.9rem' }}>{describeLlmStatus(status)}</p>}
      {turns.map((t, i) => (
        <div key={i} style={bubble(t.role)}>
          <strong>{t.role === 'user' ? 'Tu' : 'Assistente'}</strong>
          <div>{t.content}</div>
          {t.steps && t.steps.length > 0 && (
            <details style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#555' }}>
              <summary>Dati consultati ({t.steps.length})</summary>
              <ul>
                {t.steps.map((s, j) => (
                  <li key={j}>{describeStep(s)}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
      {busy && <p aria-live="polite">L'assistente sta lavorando… (con un modello locale può servire qualche minuto)</p>}
      {error && <p role="alert">{error}</p>}
      <div ref={end} />
      <form onSubmit={send} style={{ display: 'grid', gap: '0.5rem' }}>
        <textarea
          aria-label="Domanda all'assistente"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Es. quanto è disponibile sul capitolo 10565/0 nel 2026? (Invio per inviare, Maiusc+Invio per andare a capo)"
          disabled={busy}
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={busy || !input.trim()}>
            Invia
          </button>
          <button type="button" disabled={busy || turns.length === 0} onClick={() => setTurns([])}>
            Nuova conversazione
          </button>
        </div>
      </form>
    </section>
  );
}
