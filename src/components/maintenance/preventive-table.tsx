import { Panel, PanelLink } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { ASSET_TYPE_LABELS, type PreventiveTask } from '@/types/maintenance';

/** Interventions préventives à venir sur les sept prochains jours. */
export function PreventiveTable({
  tasks,
  upcomingCount,
}: {
  tasks: PreventiveTask[];
  upcomingCount: number;
}) {
  return (
    <Panel className="min-w-0">
      <header className="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-2">
        <h2 className="text-[0.8125rem] font-semibold text-ink">Interventions préventives</h2>
        <span className="tnum rounded-chip bg-accent-orange/12 px-1.5 py-px text-[0.625rem] font-semibold text-accent-orange">
          {upcomingCount} à venir
        </span>
        <span className="ml-auto rounded-chip border border-edge px-1.5 py-[3px] text-[0.625rem] font-medium whitespace-nowrap text-ink-muted">
          7 prochains jours
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-x-auto px-1.5">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr>
              {['Date / heure', 'Type d’actif', 'Équipement', 'Intervention', 'Technicien', 'Statut'].map(
                (heading) => (
                  <th
                    key={heading}
                    className="border-b border-edge px-1 pt-1 pb-1.5 text-left text-[0.5625rem] font-semibold tracking-[0.1em] text-ink-dim uppercase whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="transition-colors hover:bg-card-hover">
                <td className="tnum border-b border-edge-soft px-1 py-1.5 text-[0.625rem] whitespace-nowrap text-ink-muted">
                  {task.when}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 leading-tight text-[0.625rem] text-ink-muted">
                  {ASSET_TYPE_LABELS[task.assetType]}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 leading-tight text-[0.625rem] text-ink">
                  {task.equipment}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 text-[0.625rem] leading-tight text-ink-muted">
                  {task.intervention}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 leading-tight text-[0.625rem] text-primary">
                  {task.technician}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 whitespace-nowrap">
                  <span
                    className={cn(
                      'inline-flex rounded-chip border px-1.5 py-px text-[0.625rem] font-medium',
                      task.status === 'confirmed'
                        ? 'border-accent-green/30 bg-accent-green/10 text-accent-green'
                        : 'border-accent-purple/30 bg-accent-purple/10 text-accent-purple',
                    )}
                  >
                    {task.status === 'confirmed' ? 'Confirmée' : 'Planifiée'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PanelLink href="/maintenance?onglet=preventif" align="end">
        Voir toutes les préventives
      </PanelLink>
    </Panel>
  );
}
