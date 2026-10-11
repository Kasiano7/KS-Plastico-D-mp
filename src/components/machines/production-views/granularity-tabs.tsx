import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Sélecteur de granularité de l'onglet Production.
 *
 * « Production », « Cycles » et « Consommation » étaient trois onglets de
 * premier niveau alors qu'ils décrivent le même sujet à trois échelles : ce
 * que la presse a produit, à quelle cadence, et à quel coût énergétique. Neuf
 * onglets ne se lisent pas ; sept, oui.
 *
 * Chaque vue reste adressable — `?vue=cycles` se partage et se met en favori.
 */

export const PRODUCTION_VIEWS = [
  { id: 'ordres', label: 'Ordres', hint: 'Ce qui a été produit' },
  { id: 'cycles', label: 'Cycles', hint: 'À quelle cadence' },
  { id: 'energie', label: 'Consommation', hint: 'À quel coût' },
] as const;

export type ProductionView = (typeof PRODUCTION_VIEWS)[number]['id'];

/** Toute valeur inconnue retombe sur la vue par défaut, jamais sur une erreur. */
export function resolveProductionView(value: string | undefined): ProductionView {
  return PRODUCTION_VIEWS.some((view) => view.id === value)
    ? (value as ProductionView)
    : 'ordres';
}

export function GranularityTabs({
  machineId,
  active,
}: {
  machineId: string;
  active: ProductionView;
}) {
  return (
    <div
      role="group"
      aria-label="Granularité"
      className="mb-4 inline-flex rounded-[var(--radius-control)] border border-line bg-surface-sunken p-0.5"
    >
      {PRODUCTION_VIEWS.map((view) => {
        const isActive = view.id === active;
        return (
          <Link
            key={view.id}
            href={`/machines/${machineId}/production?vue=${view.id}`}
            prefetch={false}
            scroll={false}
            aria-current={isActive ? 'true' : undefined}
            title={view.hint}
            className={cn(
              'rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
              isActive
                ? 'bg-surface text-fg shadow-[var(--shadow-xs)]'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
