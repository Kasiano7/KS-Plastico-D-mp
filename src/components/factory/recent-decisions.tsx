import Link from 'next/link';
import { Check, CircleDashed, X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatCents, formatDuration, formatSince } from '@/lib/format';
import type { RecentDecision } from '@/server/services/decisions';
import type { DecisionStats } from '@/server/domain/decisions';

/**
 * Fil « Décisions récentes ».
 *
 * Le produit affirme « l'IA recommande, l'humain décide ». Il ne montrait
 * jamais la suite : ce qui a été décidé, et ce que ça a donné. Sans cette
 * boucle, impossible de savoir si l'application sert à quelque chose — ni de
 * constater qu'une recommandation était mauvaise.
 *
 * Le résultat affiché est celui qui est **mesuré** : l'alerte s'est-elle
 * refermée, et au bout de combien de temps. Le gain figure comme « attendu »,
 * jamais comme constaté : personne ne mesure aujourd'hui l'euro réellement
 * économisé, et l'écrire serait un chiffre inventé.
 */
export function RecentDecisions({
  decisions,
  stats,
  canSeeFinancials,
}: {
  decisions: RecentDecision[];
  stats: DecisionStats;
  canSeeFinancials: boolean;
}) {
  if (decisions.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Décisions récentes"
          subtitle="Ce qui a été approuvé ou refusé, et ce que ça a donné"
        />
        <p className="px-5 pb-5 text-sm text-fg-muted">
          Aucune recommandation n’a encore été tranchée. Dès la première décision, ce fil montrera
          ce qu’elle a produit.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Décisions récentes"
        subtitle="Ce qui a été approuvé ou refusé, et ce que ça a donné"
        action={
          <span className="text-[0.75rem] text-fg-muted">
            <span className="tabular font-semibold text-fg">{stats.approved}</span> approuvée
            {stats.approved > 1 ? 's' : ''} ·{' '}
            <span className="tabular font-semibold text-fg">{stats.resolvedAfterApproval}</span>{' '}
            suivie{stats.resolvedAfterApproval > 1 ? 's' : ''} d’une résolution
          </span>
        }
      />

      <ol className="divide-y divide-line-soft px-5 pb-2">
        {decisions.map((entry) => (
          <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0">
            <DecisionIcon decision={entry.decision} />

            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-medium text-fg">{entry.recommendationTitle}</p>

              <p className="mt-0.5 text-[0.75rem] text-fg-muted">
                {entry.decision === 'rejected' ? 'Refusée' : 'Approuvée'} par {entry.decidedBy},{' '}
                {formatSince(entry.decidedAt)}
                {entry.alertTitle && entry.alertId ? (
                  <>
                    {' · '}
                    <Link
                      href={`/alertes?alerte=${entry.alertId}`}
                      prefetch={false}
                      className="text-brand hover:underline"
                    >
                      {entry.alertTitle}
                    </Link>
                  </>
                ) : null}
              </p>

              {entry.justification ? (
                <p className="mt-1 text-[0.75rem] text-fg-subtle italic">
                  « {entry.justification} »
                </p>
              ) : null}

              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem]">
                <Outcome entry={entry} />
                {canSeeFinancials && entry.expectedGainCents > 0 && entry.decision !== 'rejected' ? (
                  <span className="text-fg-muted">
                    Gain attendu{' '}
                    <span className="tabular font-medium text-fg">
                      {formatCents(entry.expectedGainCents)}
                    </span>
                  </span>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="border-t border-line px-5 py-2.5 text-[0.6875rem] leading-relaxed text-fg-subtle">
        Le gain affiché est celui qui était <strong>attendu</strong> au moment de la décision. Le
        gain réellement constaté n’est pas encore mesuré : il faudrait relever la situation avant
        et après chaque exécution.
      </p>
    </Card>
  );
}

function DecisionIcon({ decision }: { decision: string }) {
  const rejected = decision === 'rejected';
  return (
    <span
      className={cn(
        'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
        rejected ? 'bg-surface-sunken text-fg-subtle' : 'bg-normal-soft text-normal',
      )}
    >
      {rejected ? <X className="size-3.5" /> : <Check className="size-3.5" />}
    </span>
  );
}

/** Ce que la décision a produit — mesuré, jamais supposé. */
function Outcome({ entry }: { entry: RecentDecision }) {
  const { outcome } = entry;

  if (outcome.kind === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-normal">
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
        Alerte résolue {outcome.minutesToResolve > 0
          ? `en ${formatDuration(outcome.minutesToResolve)}`
          : 'dans la foulée'}
      </span>
    );
  }

  if (outcome.kind === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <CircleDashed aria-hidden className="size-3.5" strokeWidth={2.5} />
        Alerte encore ouverte
      </span>
    );
  }

  return (
    <span className="text-fg-muted">
      {outcome.resolved
        ? 'Refusée — l’alerte s’est réglée autrement'
        : 'Refusée — l’alerte reste ouverte'}
    </span>
  );
}
