import { Panel, PanelLink } from '@/components/ui/panel';
import { ASSET_TYPE_LABELS, type HistoryEntry } from '@/types/maintenance';

/** Historique court des dernières interventions clôturées. */
export function MaintenanceHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Panel className="min-w-0">
      <header className="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-2">
        <h2 className="text-[0.8125rem] font-semibold text-ink">Historique des interventions</h2>
        <span className="ml-auto rounded-chip border border-edge px-1.5 py-[3px] text-[0.625rem] font-medium whitespace-nowrap text-ink-muted">
          30 dernières
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-x-auto px-1.5">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr>
              {['Date / heure', 'Type d’actif', 'Équipement', 'Intervention', 'Durée'].map((heading) => (
                <th
                  key={heading}
                  className="border-b border-edge px-1 pt-1 pb-1.5 text-left text-[0.5625rem] font-semibold tracking-[0.1em] text-ink-dim uppercase whitespace-nowrap"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="transition-colors hover:bg-card-hover">
                <td className="tnum border-b border-edge-soft px-1 py-1.5 text-[0.625rem] whitespace-nowrap text-ink-muted">
                  {entry.when}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 leading-tight text-[0.625rem] text-ink-muted">
                  {ASSET_TYPE_LABELS[entry.assetType]}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 leading-tight text-[0.625rem] text-ink">
                  {entry.equipment}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 text-[0.625rem] leading-tight text-ink-muted">
                  {entry.intervention}
                </td>
                <td className="tnum border-b border-edge-soft px-1 py-1.5 text-right text-[0.625rem] whitespace-nowrap text-ink-dim">
                  {entry.duration}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PanelLink href="/maintenance?onglet=historique" align="end">
        Voir tout l’historique
      </PanelLink>
    </Panel>
  );
}
