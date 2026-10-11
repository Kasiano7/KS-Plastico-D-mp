import { Panel, PanelHeader, PeriodLabel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import type { GanttPlanning, GanttStatus } from '@/types/dashboard';

/**
 * Planning hebdomadaire par ligne de production, en lecture seule.
 *
 * Construit avec une grille CSS et non une bibliothèque : un Gantt de lecture
 * n'est qu'un placement `colonne / durée`.
 */

const STATUS_LABEL: Record<GanttStatus, string> = {
  done: 'Terminée',
  running: 'En cours',
  planned: 'Planifiée',
  late: 'Retard',
  maintenance: 'Maintenance',
};

const STATUS_BAR: Record<GanttStatus, string> = {
  done: 'bg-accent-green/85',
  running: 'bg-accent-blue/85',
  planned: 'bg-accent-purple/85',
  late: 'bg-danger/85',
  maintenance: 'bg-accent-orange/85',
};

const STATUS_DOT: Record<GanttStatus, string> = {
  done: 'bg-accent-green',
  running: 'bg-accent-blue',
  planned: 'bg-accent-purple',
  late: 'bg-danger',
  maintenance: 'bg-accent-orange',
};

const STATUS_ORDER: GanttStatus[] = ['done', 'running', 'planned', 'late', 'maintenance'];

const GRID = 'grid grid-cols-[68px_repeat(7,minmax(0,1fr))]';

export function GanttChart({ planning }: { planning: GanttPlanning }) {
  return (
    <Panel className="min-h-0 justify-between overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          title="Planning — Vue Gantt"
          action={<PeriodLabel label={planning.weekLabel} />}
        />

        <div className="flex min-h-0 flex-1 flex-col px-3.5">
          {/* En-tête de calendrier */}
          <div className={cn(GRID, 'items-end border-b border-edge-soft pb-1')}>
            <span className="pr-2 text-[0.5rem] leading-tight font-semibold tracking-[0.1em] text-ink-dim uppercase">
              Ateliers / Lignes
            </span>
            {planning.days.map((day) => (
              <span key={day.id} className="text-center leading-tight">
                <span className="tnum block text-[0.625rem] font-semibold text-ink-muted">
                  {day.dayNumber}
                </span>
                <span className="block text-[0.5rem] text-ink-dim uppercase">{day.weekday}</span>
              </span>
            ))}
          </div>

          {/* Une ligne de production = une ligne de grille */}
          <div className="mt-1 min-h-0 flex-1 space-y-[3px] overflow-y-auto pb-1">
            {planning.rows.map((row) => (
              <div key={row.id} className={cn(GRID, 'items-center')}>
                <span className="min-w-0 pr-2 leading-[1.15] text-ink-dim">
                  <span className="block truncate text-[0.5625rem] text-ink-muted">
                    {row.workshop}
                  </span>
                  <span className="block truncate text-[0.5rem]">{row.line}</span>
                </span>

                {planning.days.map((day, index) => (
                  <span
                    key={day.id}
                    aria-hidden
                    style={{ gridColumn: index + 2, gridRow: 1 }}
                    className="h-[19px] border-l border-edge-soft/70"
                  />
                ))}

                {planning.tasks
                  .filter((task) => task.rowId === row.id)
                  .map((task) => (
                    <span
                      key={task.id}
                      title={`${task.label} — ${STATUS_LABEL[task.status]}`}
                      style={{
                        gridColumn: `${task.startDay + 2} / span ${task.lengthDays}`,
                        gridRow: 1,
                      }}
                      className={cn(
                        'mx-[2px] flex h-[17px] items-center rounded-[4px] px-1.5',
                        STATUS_BAR[task.status],
                      )}
                    >
                      <span className="truncate text-[0.5625rem] font-semibold text-white">
                        {task.label}
                      </span>
                    </span>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3.5 pt-2 pb-2.5">
        {STATUS_ORDER.map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-[0.5625rem] text-ink-muted">
            <span aria-hidden className={cn('size-[6px] rounded-[2px]', STATUS_DOT[status])} />
            {STATUS_LABEL[status]}
          </span>
        ))}
      </div>
    </Panel>
  );
}
