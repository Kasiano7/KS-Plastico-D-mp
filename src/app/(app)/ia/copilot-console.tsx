'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SEVERITY_CHIP, SEVERITY_TEXT } from '@/components/ui/severity';
import { Card, DataOrigin, buttonClass } from '@/components/ui/primitives';
import type { AiAnswer } from '@/server/ai/types';

const SUGGESTIONS = [
  "Comment va l'usine aujourd'hui ?",
  "Pourquoi l'atelier B est-il sous son objectif ?",
  'Quelles commandes risquent d’être en retard ?',
  'Ai-je assez de palettes cette semaine ?',
  'Quel est l’impact financier des problèmes en cours ?',
  'Avons-nous déjà rencontré ce problème d’alimentation matière ?',
  'Comment importer des références depuis une photo ou Excel ?',
];

type Exchange = { question: string; answer: AiAnswer | null; error?: string };

/**
 * Console plein écran du copilote — même API que le panneau latéral.
 *
 * Garde le fil de la conversation (comme le panneau) : le serveur mémorise
 * chaque échange dans notre base (mémoire IA Europe), on suit juste ici
 * l'identifiant renvoyé pour poursuivre le même fil d'un tour à l'autre.
 */
export function CopilotConsole({ canSeeFinancials }: { canSeeFinancials: boolean }) {
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, setPending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function ask(value: string) {
    const trimmed = value.trim();
    if (!trimmed || pending) return;

    setQuestion('');
    setPending(true);
    setExchanges((previous) => [...previous, { question: trimmed, answer: null }]);

    try {
      const response = await fetch('/api/copilote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
          className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 focus-within:border-brand"
        >
          <Sparkles className="size-4 shrink-0 text-brand" />
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Posez une question à votre usine…"
            aria-label="Question au copilote"
            className="h-11 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <button type="submit" disabled={pending} className={buttonClass('primary', 'sm')}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Demander
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.filter(
            (suggestion) => canSeeFinancials || !suggestion.includes('financier'),
          ).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => ask(suggestion)}
              className="rounded-full border border-line bg-surface-sunken px-3 py-1.5 text-[0.75rem] text-fg-muted transition-colors hover:border-brand/40 hover:text-brand"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </Card>

      {exchanges.length === 0 ? null : (
        <div className="space-y-4">
          {exchanges.map((exchange, index) => (
            <div key={index} className="space-y-2">
              <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                {exchange.question}
              </p>

              {exchange.error ? (
                <Card className="border-critical/30 p-4">
                  <p className="text-sm text-critical">{exchange.error}</p>
                </Card>
              ) : exchange.answer ? (
                <AnswerCard answer={exchange.answer} />
              ) : (
                <Card className="p-4">
                  <p className="flex items-center gap-2 text-[0.8125rem] text-fg-subtle">
                    <Loader2 className="size-3.5 animate-spin" />
                    Analyse des données de l’usine…
                  </p>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnswerCard({ answer }: { answer: AiAnswer }) {
  return (
    <Card className="animate-fade-up p-5">
      <p className="text-[0.9375rem] leading-relaxed text-fg">{answer.summary}</p>

      {answer.facts.length > 0 ? (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {answer.facts.map((fact, index) => (
            <div key={index} className="rounded-[var(--radius-control)] border border-line bg-surface-sunken p-3">
              <dt className="text-[0.75rem] text-fg-muted">{fact.label}</dt>
              <dd className="mt-1 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'tabular text-[0.9375rem] font-semibold',
                    fact.severity ? SEVERITY_TEXT[fact.severity] : 'text-fg',
                  )}
                >
                  {fact.value}
                </span>
                <DataOrigin origin={fact.origin} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {answer.breakdown && answer.breakdown.length > 0 ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-3 text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
            Pourquoi
          </p>
          <div className="space-y-2.5">
            {answer.breakdown.map((entry) => (
              <div key={entry.label}>
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-fg">{entry.label}</span>
                  <span className="tabular text-fg-muted">
                    {entry.pct} %{entry.detail ? ` · ${entry.detail}` : ''}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${entry.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {answer.actions && answer.actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          {answer.actions.map((action) => (
            <Link key={action.href + action.label} href={action.href} className={buttonClass('secondary', 'sm')}>
              {action.label}
              <ArrowRight className="size-3.5" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-4 text-[0.75rem] text-fg-subtle">
        <span className={cn('rounded-full border px-2 py-0.5', SEVERITY_CHIP[answer.severity])}>
          Confiance {Math.round(answer.confidence * 100)} %
        </span>
        {answer.sources.length > 0 ? <span>Sources : {answer.sources.join(' · ')}</span> : null}
      </div>
    </Card>
  );
}
