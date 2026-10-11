import type { Metadata } from 'next';
import {
  GranularityTabs,
  resolveProductionView,
} from '@/components/machines/production-views/granularity-tabs';
import { CyclesView } from '@/components/machines/production-views/cycles-view';
import { EnergyView } from '@/components/machines/production-views/energy-view';
import { OrdersView } from '@/components/machines/production-views/orders-view';

export const metadata: Metadata = { title: 'Production machine' };
export const dynamic = 'force-dynamic';

/**
 * Onglet Production de la fiche machine — trois échelles du même sujet.
 *
 * Ce que la presse a produit, à quelle cadence, et à quel coût énergétique.
 * C'étaient trois onglets de premier niveau ; ils n'en font plus qu'un, avec
 * un sélecteur de granularité. La permission est vérifiée dans chaque vue,
 * comme avant : la fusion ne change rien aux gardes.
 */
export default async function MachineProductionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const [{ id }, { vue }] = await Promise.all([params, searchParams]);
  const view = resolveProductionView(vue);

  return (
    <div>
      <GranularityTabs machineId={id} active={view} />

      {view === 'cycles' ? (
        <CyclesView id={id} />
      ) : view === 'energie' ? (
        <EnergyView id={id} />
      ) : (
        <OrdersView id={id} />
      )}
    </div>
  );
}
