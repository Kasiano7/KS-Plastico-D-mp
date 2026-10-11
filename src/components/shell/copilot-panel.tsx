'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SEVERITY_CHIP, type Severity } from '@/components/ui/severity';
import type { AiAnswer } from '@/server/ai/types';

const SUGGESTIONS = [
  "Comment va l'usine aujourd'hui ?",
  "Pourquoi l'atelier B est-il sous son objectif ?",
  'Quelles commandes risquent d’être en retard ?',
  'Ai-je assez de palettes cette semaine ?',
  'Avons-nous déjà rencontré ce problème d’alimentation matière ?',
  'Comment importer des références depuis une photo ou Excel ?',
];

type Exchange = { question: string; answer: AiAnswer | null; error?: string };

export type CopilotRequest = { id: number; question: string };

export function CopilotPanel({
  open,
  onClose,
  request,
}: {
  open: boolean;
  onClose: () => void;
  request?: CopilotRequest | null;
}) {
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handledRequestId = useRef<number | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [exchanges, pending]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const ask = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || pending) return;

    setQuestion('');
    setPending(true);
    setExchanges((previous) => [...previous, { question: trimmed, answer: null }]);

    try {
      const response = await fetch('/api/copilote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Le fil de conversation est mémorisé côté serveur (mémoire IA
        // Europe) : on transmet juste l'identifiant pour le poursuivre.
        body: JSON.stringify({ question: trimmed, conversationId: conversationId ?? undefined }),
      });
      const payload = await response.json();
      if (payload.conversationId) setConversationId(payload.conversationId);

      setExchanges((previous) =>
        previous.map((exchange, index) =>
          index === previous.length - 1
            ? { ...exchange, answer: payload.answer ?? null, error: payload.error }
            : exchange,
        ),
      );
    } catch {
      setExchanges((previous) =>
        previous.map((exchange, index) =>
          index === previous.length - 1
            ? { ...exchange, error: 'Le copilote est momentanément indisponible.' }
            : exchange,
        ),
      );
    } finally {
      setPending(false);
    }
  }, [pending, conversationId]);

  useEffect(() => {
    if (!open || !request || handledRequestId.current === request.id) return;
    handledRequestId.current = request.id;
    void ask(request.question);
  }, [ask, open, request]);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Fermer le copilote"
          onClick={onClose}
          className="fixed inset-0 z-50 bg-overlay"
        />
      ) : null}

      <aside
        aria-hidden={!open}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-[var(--shadow-float)] transition-transform duration-250 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">Copilote KS Plastico Demo</p>
              <p className="text-[0.6875rem] text-fg-subtle">
                Analyse et explication — l’IA ne modifie rien sans validation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1.5 text-fg-subtle hover:bg-surface-sunken hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {exchanges.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                Posez une question sur votre usine. Les réponses s’appuient uniquement sur les données
                de l’application, et chaque chiffre indique sa provenance.
              </p>
              <div className="space-y-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(suggestion)}
                    className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-surface-sunken px-3 py-2.5 text-left text-[0.8125rem] text-fg transition-colors hover:border-brand/40 hover:bg-brand-soft"
                  >
                    <span>{suggestion}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {exchanges.map((exchange, index) => (
                <div key={index} className="space-y-3">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-[0.8125rem] text-white">
                    {exchange.question}
                  </p>

                  {exchange.error ? (
                    <p className="rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft px-3.5 py-2.5 text-[0.8125rem] text-critical">
                      {exchange.error}
                    </p>
                  ) : exchange.answer ? (
                    <AnswerCard answer={exchange.answer} onClose={onClose} />
                  ) : (
                    <p className="flex items-center gap-2 text-[0.8125rem] text-fg-subtle">
                      <Loader2 className="size-3.5 animate-spin" />
                      Analyse des données de l’usine…
                    </p>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
          className="shrink-0 border-t border-line p-4"
        >
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 focus-within:border-brand">
            <input
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Posez une question à votre usine…"
              aria-label="Question au copilote"
              className="h-10 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || question.trim().length === 0}
              aria-label="Envoyer"
              className="flex size-7 items-center justify-center rounded-md bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

const ORIGIN_LABELS = {
  measured: 'Mesuré',
  computed: 'Calculé',
  estimated: 'Estimé',
  forecast: 'Prévisionnel',
} as const;

function AnswerCard({ answer, onClose }: { answer: AiAnswer; onClose: () => void }) {
  return (
    <div className="animate-fade-up space-y-3.5 rounded-[var(--radius-card)] border border-line bg-surface-sunken p-4">
      <p className="text-[0.8125rem] leading-relaxed text-fg">{answer.summary}</p>

      {answer.facts.length > 0 ? (
        <ul className="space-y-1.5">
          {answer.facts.map((fact, index) => (
            <li key={index} className="flex items-start justify-between gap-3 text-[0.8125rem]">
              <span className="text-fg-muted">{fact.label}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn(
                    'font-medium tabular',
                    fact.severity ? severityText(fact.severity) : 'text-fg',
                  )}
                >
                  {fact.value}
                </span>
                <span className="rounded border border-line px-1 text-[0.5625rem] tracking-wide text-fg-subtle uppercase">
                  {ORIGIN_LABELS[fact.origin]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {answer.breakdown && answer.breakdown.length > 0 ? (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
            Pourquoi
          </p>
          {answer.breakdown.map((entry) => (
            <div key={entry.label} className="space-y-1">
              <div className="flex items-baseline justify-between text-[0.8125rem]">
                <span className="text-fg">{entry.label}</span>
                <span className="tabular text-fg-muted">
                  {entry.pct} %{entry.detail ? ` · ${entry.detail}` : ''}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brand" style={{ width: `${entry.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {answer.actions && answer.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {answer.actions.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[0.75rem] font-medium text-fg transition-colors hover:border-brand/40 hover:text-brand"
            >
              {action.label}
              <ArrowRight className="size-3" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-[0.6875rem] text-fg-subtle">
        <span className={cn('rounded-full border px-1.5 py-0.5', SEVERITY_CHIP[answer.severity])}>
          Confiance {Math.round(answer.confidence * 100)} %
        </span>
        {answer.sources.length > 0 ? <span>Sources : {answer.sources.join(' · ')}</span> : null}
      </div>
    </div>
  );
}

function severityText(severity: Severity): string {
  return {
    normal: 'text-normal',
    info: 'text-info',
    warning: 'text-warning',
    critical: 'text-critical',
  }[severity];
}
