'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DemoDataBadge } from './demo-data-notice';
import { Panel, PanelLink } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import type { Tone } from '@/types/dashboard';
import type { MaintenanceWeek } from '@/types/maintenance';

/**
 * Calendrier hebdomadaire des interventions.
 *
 * La navigation est simulée : elle décale l'intitulé de semaine sans recharger
 * de données. Quand la GMAO sera reliée à la base, seul le chargement changera
 * — la grille, elle, restera identique.
 *
 * Les événements sont positionnés en absolu dans la colonne du jour : une
 * intervention de 8 h à 10 h occupe exactement deux rangées, ce qui rend la
 * charge de la journée lisible d'un coup d'œil.
 */

/** Une teinte = un type d'intervention. Le bloc porte aussi son libellé. */
const EVENT_STYLE: Record<Tone, string> = {
  blue: 'border-accent-blue/45 bg-accent-blue/15 text-accent-blue',
  cyan: 'border-accent-cyan/45 bg-accent-cyan/15 text-accent-cyan',
  purple: 'border-accent-purple/45 bg-accent-purple/15 text-accent-purple',
  orange: 'border-accent-orange/45 bg-accent-orange/15 text-accent-orange',
  green: 'border-accent-green/45 bg-accent-green/15 text-accent-green',
  red: 'border-danger/45 bg-danger/15 text-danger',
  neutral: 'border-edge bg-background-secondary text-ink-muted',
};

const HOUR_HEIGHT = 30;

export function MaintenanceCalendar({ week }: { week: MaintenanceWeek }) {
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<'calendrier' | 'gantt'>('calendrier');

  const hours = Array.from(
    { length: week.endHour - week.startHour },
    (_, index) => week.startHour + index,
  );

  const weekLabel = offset === 0 ? week.label : `Semaine ${20 + offset}`;
  const rangeLabel = offset === 0 ? week.rangeLabel : `Semaine décalée de ${offset > 0 ? '+' : ''}${offset}`;

  return (
    <Panel className="min-w-0">
      <header className="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-2">
        <h2 className="text-[0.8125rem] font-semibold text-ink">Calendrier des interventions</h2>
        <DemoDataBadge />

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded-chip border border-edge p-px">
            {(['calendrier', 'gantt'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                aria-pressed={mode === item}
                className={cn(
                  'rounded-[0.4375rem] px-2 py-[3px] text-[0.625rem] font-medium capitalize transition-colors',
                  mode === item ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink',
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOffset(0)}
            className="rounded-chip border border-edge px-2 py-[3px] text-[0.625rem] font-medium text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
          >
            Aujourd’hui
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 px-3.5 pb-2">
        <div className="flex items-center gap-1">
          <NavButton label="Semaine précédente" onClick={() => setOffset((value) => value - 1)}>
            <ChevronLeft className="size-3" strokeWidth={2.25} />
          </NavButton>
          <span className="tnum text-[0.6875rem] font-medium text-ink">{weekLabel}</span>
          <NavButton label="Semaine suivante" onClick={() => setOffset((value) => value + 1)}>
            <ChevronRight className="size-3" strokeWidth={2.25} />
          </NavButton>
        </div>
        <span className="truncate text-[0.625rem] text-ink-dim">{rangeLabel}</span>
      </div>

      {mode === 'gantt' ? (
        <div className="px-3.5 pb-4">
          <p className="rounded-chip border border-dashed border-edge px-3 py-6 text-center text-[0.6875rem] text-ink-dim">
            La vue Gantt sera branchée sur l’ordonnancement des interventions.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto px-3.5">
          <div className="min-w-[560px]">
            {/* En-tête des jours — la gouttière des heures reste alignée. */}
            <div className="flex">
              <span className="w-9 shrink-0" aria-hidden />
              {week.days.map((day, index) => (
                <div
                  key={day}
                  className={cn(
                    'flex-1 pb-1 text-center text-[0.625rem] font-medium',
                    index >= 5 ? 'text-ink-dim' : 'text-ink-muted',
                  )}
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="flex border-t border-edge">
              {/* Gouttière des heures */}
              <div className="w-9 shrink-0">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT }}
                    className="tnum -mt-[6px] pr-1.5 text-right text-[0.5625rem] text-ink-dim"
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {week.days.map((day, dayIndex) => (
                <div
                  key={day}
                  className={cn(
                    'relative flex-1 border-l border-edge-soft',
                    dayIndex >= 5 && 'bg-background-secondary/40',
                  )}
                  style={{ height: hours.length * HOUR_HEIGHT }}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: HOUR_HEIGHT }}
                      className="border-b border-edge-soft/60"
                    />
                  ))}

                  {week.events
                    .filter((event) => event.dayIndex === dayIndex)
                    .map((event) => (
                      <article
                        key={event.id}
                        title={`${event.title} — ${event.subtitle} (${event.owner})`}
                        style={{
                          top: (event.startHour - week.startHour) * HOUR_HEIGHT + 1,
                          height: (event.endHour - event.startHour) * HOUR_HEIGHT - 3,
                        }}
                        className={cn(
                          'absolute inset-x-[2px] overflow-hidden rounded-[0.375rem] border-l-2 px-1.5 py-1',
                          EVENT_STYLE[event.tone],
                        )}
                      >
                        <p className="truncate text-[0.5625rem] leading-tight font-semibold">
                          {event.title}
                        </p>
                        <p className="truncate text-[0.5625rem] leading-tight opacity-80">
                          {event.subtitle}
                        </p>
                        <p className="truncate text-[0.5625rem] leading-tight opacity-60">
                          {event.owner}
                        </p>
                      </article>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <PanelLink href="/maintenance?onglet=calendrier" align="end">
        Voir le calendrier complet
      </PanelLink>
    </Panel>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-5 place-items-center rounded-chip border border-edge text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
    >
      {children}
    </button>
  );
}
