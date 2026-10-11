'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { Check, ChevronDown, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCents, formatPercent, formatSince } from '@/lib/format';
import { SEVERITY_CHIP, SEVERITY_TEXT } from '@/components/ui/severity';
import { Badge, DataOrigin, buttonClass } from '@/components/ui/primitives';
import {
  decideRecommendationAction,
  updateAlertStatusAction,
  type ActionState,
} from '@/server/actions/alerts';
import type { AlertDetail } from '@/server/services/alerts';
import { RecommendationExplanation } from './recommendation-explanation';

const DOMAIN_LABELS: Record<string, string> = {
  machine: 'Machine',
  stock: 'Stock',
  commande: 'Commande',
  production: 'Production',
  personnel: 'Personnel',
  planning: 'Planning',
  qualite: 'Qualité',
};

/**
 * Carte d'alerte (§11 et §12).
 *
 * Elle déroule la chaîne complète : problème → cause probable → conséquences →
 * impact financier → recommandation → simulation → décision humaine.
 */
export function AlertCard({
  alert,
  canDecide,
  canWrite,
  canSeeFinancials,
  defaultOpen = false,
}: {
  alert: AlertDetail;
  canDecide: boolean;
  canWrite: boolean;
  canSeeFinancials: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article
      className={cn(
        'overflow-hidden rounded-[var(--radius-card)] border bg-surface shadow-[var(--shadow-card)] transition-colors',
        alert.severity === 'critical' ? 'border-critical/35' : 'border-line',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-sunken sm:px-5"
      >
        <span
          aria-hidden
          className={cn(
            'mt-1 flex size-6 shrink-0 items-center justify-center rounded-md border text-[0.5rem]',
            SEVERITY_CHIP[alert.severity],
          )}
        >
          {{ normal: '●', info: '◆', warning: '▲', critical: '■' }[alert.severity]}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[0.9375rem] font-semibold text-fg">{alert.title}</span>
            <Badge>{DOMAIN_LABELS[alert.domain] ?? alert.domain}</Badge>
            {alert.status === 'acknowledged' ? <Badge tone="brand">Prise en charge</Badge> : null}
          </span>
          <span className="mt-1 block text-[0.8125rem] leading-snug text-fg-muted">
            {alert.problem}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          {canSeeFinancials && alert.impactCents > 0 ? (
            <span className={cn('tabular text-[0.9375rem] font-semibold', SEVERITY_TEXT[alert.severity])}>
              {formatCents(alert.impactCents)}
            </span>
          ) : null}
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-fg-subtle">
            {formatSince(alert.detectedAt)}
            <ChevronDown
              className={cn('size-3.5 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </span>
        </span>
      </button>

      {open ? (
        <div className="animate-fade-up border-t border-line px-4 pt-4 pb-4 sm:px-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            {alert.probableCause ? (
              <Detail label="Cause probable">{alert.probableCause}</Detail>
            ) : null}
            {alert.consequences ? <Detail label="Conséquences">{alert.consequences}</Detail> : null}

            {canSeeFinancials && alert.impactCents > 0 ? (
              <Detail label="Impact financier">
                <span className="flex items-center gap-2">
                  <span className={cn('tabular font-semibold', SEVERITY_TEXT[alert.severity])}>
                    {formatCents(alert.impactCents)}
                  </span>
                  <DataOrigin origin={alert.impactOrigin} />
                </span>
              </Detail>
            ) : null}

            <Detail label="Éléments concernés">
              <span className="flex flex-wrap gap-1.5">
                {alert.machineName && alert.machineId ? (
                  <Link href={`/machines/${alert.machineId}`} className="underline-offset-2 hover:underline">
                    <Badge tone="outline">{alert.machineName}</Badge>
                  </Link>
                ) : null}
                {alert.workshopName ? <Badge tone="outline">{alert.workshopName}</Badge> : null}
                {alert.orderNumber && alert.orderId ? (
                  <Link href={`/commandes/${alert.orderId}`} className="underline-offset-2 hover:underline">
                    <Badge tone="outline">Commande #{alert.orderNumber}</Badge>
                  </Link>
                ) : null}
                {alert.incidentReference ? (
                  <Badge tone="outline">{alert.incidentReference}</Badge>
                ) : null}
                {!alert.machineName && !alert.workshopName && !alert.orderNumber ? (
                  <span className="text-fg-subtle">—</span>
                ) : null}
              </span>
            </Detail>
          </dl>

          {alert.recommendations.length > 0 ? (
            <div className="mt-5 space-y-3">
              {alert.recommendations.map((recommendation) => (
                <RecommendationBlock
                  key={recommendation.id}
                  alert={alert}
                  recommendation={recommendation}
                  canDecide={canDecide}
                  canSeeFinancials={canSeeFinancials}
                />
              ))}
            </div>
          ) : null}

          {canWrite && alert.status !== 'resolved' ? (
            <AlertStatusForm alertId={alert.id} status={alert.status} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[0.8125rem] leading-relaxed text-fg">{children}</dd>
    </div>
  );
}

function RecommendationBlock({
  alert,
  recommendation,
  canDecide,
  canSeeFinancials,
}: {
  /** L'alerte porte le constat, la cause et l'impact : le raisonnement les relit. */
  alert: AlertDetail;
  recommendation: AlertDetail['recommendations'][number];
  canDecide: boolean;
  canSeeFinancials: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(decideRecommendationAction, {});
  const decided = recommendation.decision !== null || recommendation.status === 'executed';

  return (
    <div className="rounded-[var(--radius-card)] border border-brand/25 bg-brand-soft/60 p-4">
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-brand uppercase">
            Recommandation
          </p>
          <p className="mt-1 text-[0.875rem] font-medium text-fg">{recommendation.title}</p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-muted">
            {recommendation.rationale}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.75rem]">
            {canSeeFinancials && recommendation.expectedGainCents > 0 ? (
              <span className="text-fg-muted">
                Gain attendu{' '}
                <span className="tabular font-semibold text-normal">
                  {formatCents(recommendation.expectedGainCents)}
                </span>
              </span>
            ) : null}
            <span className="text-fg-muted">
              Confiance{' '}
              <span className="tabular font-medium text-fg">
                {formatPercent(recommendation.confidence * 100)}
              </span>
            </span>
            {recommendation.simulation ? (
              <span className="text-fg-muted">
                Simulation{' '}
                <span className="tabular font-medium text-normal">
                  {formatPercent(recommendation.simulation.successProbability * 100)}
                </span>{' '}
                de tenir l’engagement
              </span>
            ) : null}
          </div>

          <RecommendationExplanation
            canSeeFinancials={canSeeFinancials}
            input={{
              problem: alert.problem,
              probableCause: alert.probableCause,
              consequences: alert.consequences,
              impactCents: alert.impactCents,
              impactOrigin: alert.impactOrigin,
              detectedAt: alert.detectedAt,
              recommendation: {
                title: recommendation.title,
                rationale: recommendation.rationale,
                expectedGainCents: recommendation.expectedGainCents,
                confidence: recommendation.confidence,
                origin: recommendation.origin,
              },
              simulation: recommendation.simulation
                ? {
                    successProbability: recommendation.simulation.successProbability,
                    summary: recommendation.simulation.scenario,
                  }
                : null,
            }}
          />

          {decided ? (
            <p
              className={cn(
                'mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[0.75rem] font-medium',
                recommendation.decision?.decision === 'rejected'
                  ? 'border-line bg-surface text-fg-muted'
                  : 'border-normal/25 bg-normal-soft text-normal',
              )}
            >
              {recommendation.decision?.decision === 'rejected' ? 'Refusée' : 'Approuvée et appliquée'}
            </p>
          ) : canDecide ? (
            <form action={formAction} className="mt-3.5 flex flex-wrap items-center gap-2">
              <input type="hidden" name="recommendationId" value={recommendation.id} />
              <DecisionButtons />
            </form>
          ) : (
            <p className="mt-3 text-[0.75rem] text-fg-subtle">
              La validation de cette recommandation relève du responsable de production.
            </p>
          )}

          {state.message ? (
            <p
              role="status"
              className={cn(
                'mt-2.5 text-[0.75rem]',
                state.ok ? 'text-normal' : 'text-critical',
              )}
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DecisionButtons() {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="submit"
        name="decision"
        value="approved"
        disabled={pending}
        className={buttonClass('primary', 'sm')}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Examiner et appliquer
      </button>
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className={buttonClass('secondary', 'sm')}
      >
        <X className="size-3.5" />
        Refuser
      </button>
    </>
  );
}

function AlertStatusForm({ alertId, status }: { alertId: string; status: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateAlertStatusAction, {});

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <input type="hidden" name="alertId" value={alertId} />
      {status === 'open' ? (
        <button type="submit" name="action" value="acknowledge" className={buttonClass('secondary', 'sm')}>
          Prendre en charge
        </button>
      ) : null}
      <button type="submit" name="action" value="resolve" className={buttonClass('ghost', 'sm')}>
        Clôturer l’alerte
      </button>
      {state.message ? (
        <span className={cn('text-[0.75rem]', state.ok ? 'text-normal' : 'text-critical')}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
