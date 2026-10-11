import { Panel, PanelHeader, PanelLink } from '@/components/ui/panel';
import { SEVERITY_GLYPH, SEVERITY_LABEL, SEVERITY_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import type { RiskOrder } from '@/types/dashboard';

/**
 * Commandes dont la tenue de délai n'est pas acquise.
 *
 * Le statut porte une couleur ET un symbole : un tableau de bord industriel se
 * lit aussi sur un écran d'atelier mal calibré, par quelqu'un de daltonien.
 */
export function RiskOrders({ orders }: { orders: RiskOrder[] }) {
  return (
    <Panel className="justify-between">
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="Commandes à risque" />

        <ul className="flex flex-1 flex-col divide-y divide-edge-soft">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-1 items-center justify-between gap-3 px-3.5 py-[6px]"
            >
              <span className="tnum text-[0.75rem] font-medium text-ink">{order.reference}</span>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1.5 text-[0.6875rem] font-medium',
                  SEVERITY_TEXT[order.severity],
                )}
              >
                <span aria-hidden className="text-[0.5rem] leading-none">
                  {SEVERITY_GLYPH[order.severity]}
                </span>
                <span className="sr-only">{SEVERITY_LABEL[order.severity]} — </span>
                {order.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <PanelLink href="/commandes">Voir toutes les commandes</PanelLink>
    </Panel>
  );
}
