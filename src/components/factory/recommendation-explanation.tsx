import { ChevronRight } from 'lucide-react';
import { DataOrigin } from '@/components/ui/primitives';
import { formatCents, formatDateTime, formatPercent } from '@/lib/format';
import { explainRecommendation, type ExplanationInput } from '@/server/domain/explanation';

/**
 * « Pourquoi cette recommandation ? »
 *
 * Replié par défaut : la plupart du temps, on approuve sans avoir besoin du
 * détail. Mais la confiance dans une recommandation ne se gagne pas avec un
 * pourcentage — elle se gagne quand on peut vérifier l'enchaînement et le
 * contester. C'est aussi ce qui permet à un chef d'atelier de dire « non,
 * la Presse 05 n'est pas libre » : sans le raisonnement affiché, il ne peut
 * qu'accepter ou refuser en bloc.
 *
 * `<details>` natif : ouverture au clavier, indexable, aucun état à gérer.
 */
export function RecommendationExplanation({
  input,
  canSeeFinancials,
}: {
  input: ExplanationInput;
  canSeeFinancials: boolean;
}) {
  const steps = explainRecommendation(
    input,
    { cents: formatCents, dateTime: formatDateTime, percent: (v) => formatPercent(v) },
    { canSeeFinancials },
  );

  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control)] text-[0.75rem] font-medium text-brand hover:underline">
        <ChevronRight
          aria-hidden
          className="size-3.5 transition-transform group-open:rotate-90"
          strokeWidth={2.5}
        />
        Pourquoi cette recommandation ?
      </summary>

      <ol className="mt-2.5 space-y-2.5 border-l-2 border-brand/25 pl-3.5">
        {steps.map((step, index) => (
          <li key={step.question}>
            <p className="flex items-baseline gap-1.5 text-[0.75rem] font-medium text-fg">
              {/* Le numéro dit que l'ordre compte : chaque étape s'appuie sur
                  la précédente. */}
              <span className="tabular text-fg-subtle">{index + 1}.</span>
              {step.question}
            </p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] leading-relaxed text-fg-muted">
              {step.answer}
              {step.origin ? <DataOrigin origin={step.origin} /> : null}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
