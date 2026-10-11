import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SEVERITY_TEXT, type Severity } from '@/components/ui/severity';
import { healthSeverity, type HealthResult } from '@/server/domain/health-score';

/**
 * Score de santé de l'usine (§9).
 *
 * L'arc n'est pas décoratif : sa longueur est le score, sa couleur la
 * sévérité. Chaque sous-score porte son explication en clair.
 */
export function FactoryHealthScore({
  health,
  severity,
  variation,
  previousScore,
}: {
  health: HealthResult;
  severity: Severity;
  variation: string | null;
  previousScore: number | null;
}) {
  const radius = 78;
  const circumference = Math.PI * radius; // demi-cercle
  const progress = (health.global / 100) * circumference;
  const delta = previousScore !== null ? health.global - previousScore : null;

  return (
    <section className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <header className="px-5 pt-5">
        <h2 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-fg-subtle uppercase">
          Santé de l’usine
        </h2>
      </header>

      <div className="flex flex-col items-center px-5 pt-2">
        <div className="relative">
          <svg
            viewBox="0 0 200 108"
            className="w-[200px]"
            role="img"
            aria-label={`Score de santé : ${health.global} sur 100`}
          >
            <path
              d={`M ${100 - radius} 100 A ${radius} ${radius} 0 0 1 ${100 + radius} 100`}
              fill="none"
              stroke="var(--border)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d={`M ${100 - radius} 100 A ${radius} ${radius} 0 0 1 ${100 + radius} 100`}
              fill="none"
              stroke={`var(--${severity})`}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${progress} ${circumference}`}
            />
          </svg>

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className={cn('tabular text-[2.75rem] leading-none font-semibold tracking-tight', SEVERITY_TEXT[severity])}>
              {health.global}
            </span>
            <span className="mt-1 text-xs text-fg-subtle">sur 100</span>
          </div>
        </div>

        {delta !== null ? (
          <p className="mt-3 text-xs text-fg-muted">
            {delta === 0 ? (
              'Stable depuis le dernier relevé'
            ) : (
              <>
                <span className={delta > 0 ? 'text-normal' : 'text-warning'}>
                  {delta > 0 ? '+' : ''}
                  {delta} point{Math.abs(delta) > 1 ? 's' : ''}
                </span>{' '}
                depuis le dernier relevé
              </>
            )}
          </p>
        ) : null}
      </div>

      <div className="mt-5 space-y-2.5 px-5">
        {health.dimensions.map((dimension) => {
          const dimensionSeverity = healthSeverity(dimension.score) as Severity;
          return (
            <div key={dimension.dimension} title={dimension.explanation}>
              <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                <span className="text-fg-muted">{dimension.label}</span>
                <span className={cn('tabular font-medium', SEVERITY_TEXT[dimensionSeverity])}>
                  {dimension.score}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={cn(
                    'h-full rounded-full',
                    {
                      normal: 'bg-normal',
                      info: 'bg-info',
                      warning: 'bg-warning',
                      critical: 'bg-critical',
                    }[dimensionSeverity],
                  )}
                  style={{ width: `${dimension.score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {variation ? (
        <div className="mt-5 flex items-start gap-2.5 border-t border-line px-5 py-4">
          <Info className="mt-0.5 size-3.5 shrink-0 text-brand" />
          <p className="text-[0.75rem] leading-relaxed text-fg-muted">{variation}</p>
        </div>
      ) : null}
    </section>
  );
}
