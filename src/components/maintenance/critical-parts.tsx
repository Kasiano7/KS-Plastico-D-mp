import { Panel, PanelHeader, PanelLink } from '@/components/ui/panel';
import type { CriticalPart } from '@/types/maintenance';

/**
 * Pièces critiques en stock faible.
 *
 * Le seuil est affiché à côté du stock : « 3 » ne veut rien dire seul,
 * « 3 pour un seuil de 10 » déclenche une commande.
 */
export function CriticalParts({ parts }: { parts: CriticalPart[] }) {
  return (
    <Panel className="min-w-0">
      <PanelHeader title="Pièces critiques en stock faible" />

      <div className="min-h-0 flex-1 overflow-x-auto px-1.5">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr>
              {['Pièce', 'Équipement', 'Stock', 'Seuil', 'Statut'].map((heading) => (
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
            {parts.map((part) => (
              <tr key={part.id} className="transition-colors hover:bg-card-hover">
                <td className="border-b border-edge-soft px-1 py-1.5 text-[0.625rem] leading-tight text-ink">
                  {part.part}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 text-[0.625rem] leading-tight text-ink-muted">
                  {part.equipment}
                </td>
                <td className="tnum border-b border-edge-soft px-1 py-1.5 text-[0.625rem] font-semibold text-danger">
                  {part.stock}
                </td>
                <td className="tnum border-b border-edge-soft px-1 py-1.5 text-[0.625rem] leading-tight text-ink-dim">
                  {part.threshold}
                </td>
                <td className="border-b border-edge-soft px-1 py-1.5 whitespace-nowrap">
                  <span className="inline-flex rounded-chip border border-danger/30 bg-danger/10 px-1.5 py-px text-[0.625rem] font-medium text-danger">
                    Faible
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PanelLink href="/stocks" align="end">
        Voir tout le stock maintenance
      </PanelLink>
    </Panel>
  );
}
