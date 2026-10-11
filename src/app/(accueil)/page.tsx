import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertsPanel } from '@/components/dashboard/alerts-panel';
import { CostDistribution } from '@/components/dashboard/cost-distribution';
import { FactoryOverview } from '@/components/dashboard/factory-overview';
import { GanttChart } from '@/components/dashboard/gantt-chart';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { ProductionToday } from '@/components/dashboard/production-today';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { SinceYesterday } from '@/components/dashboard/since-yesterday';
import { RiskOrders } from '@/components/dashboard/risk-orders';
import { WorkshopDistribution } from '@/components/dashboard/workshop-distribution';
import { getDashboardData } from '@/server/services/dashboard';
import { getFactoryContext } from '@/server/services/factory-context';
import {
  getPreviousDayMetrics,
  operationalMetricsOf,
} from '@/server/services/daily-snapshot';
import { requirePermission, requireUser } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';

export const metadata: Metadata = { title: 'Accueil' };
export const dynamic = 'force-dynamic';

/**
 * Écran d'accueil — poste de pilotage.
 *
 * La page ne fait que composer : elle lit les données une fois et distribue.
 * Aucun calcul, aucune règle métier ici. Deux bandes, de haut en bas :
 *   1. état de l'usine à l'instant T + ce qui menace,
 *   2. la journée en cours, l'analyse (arrêts, planning, coûts) et, à droite,
 *      le plan d'usine.
 */
export default async function AccueilPage() {
  const current = await requireUser();
  if (!can(current.permissions, 'dashboard:read') && can(current.permissions, 'workstation:use')) {
    redirect('/poste');
  }
  await requirePermission('dashboard:read');

  const [data, context, yesterday] = await Promise.all([
    getDashboardData(),
    getFactoryContext(),
    getPreviousDayMetrics(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/*
        La toute première ligne répond à « est-ce que ça va mieux qu'hier ? ».
        Elle précède les indicateurs : un chiffre sans tendance ne déclenche
        aucune question.
      */}
      <SinceYesterday today={operationalMetricsOf(context)} yesterday={yesterday} />

      {/* ── Bande 1 — état instantané ─────────────────────────────────────── */}
      <section
        aria-label="Indicateurs principaux"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 wide:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.95fr)]"
      >
        {data.kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
        <AlertsPanel data={data.alerts} className="sm:col-span-2 wide:col-span-1" />
      </section>

      {/* ── Bande 2 — la journée en cours ─────────────────────────────────── */}
      <section
        aria-label="Journée en cours"
        className="grid grow grid-cols-1 gap-3 wide:grid-cols-[minmax(0,3.05fr)_minmax(0,2fr)] wide:items-start"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <ProductionToday data={data.production} />
            <WorkshopDistribution workshops={data.workshops} />
            <RiskOrders orders={data.riskOrders} />
          </div>
          <QuickActions actions={data.quickActions} />

          {/*
            L'analyse ne forme plus une bande a part : elle se lit dans la
            continuite de la journee en cours, a cote du plan d'usine.

            Le « Top 5 des arrêts machines » a été retiré : il répétait ce que
            le panneau d'alertes dit déjà — et mieux, puisque celui-ci nomme la
            conséquence (« Presse 64 arrêtée depuis 1 h 12 ») au lieu d'aligner
            des durées. Le détail complet reste sur la fiche machine.
          */}
          <div
            aria-label="Analyse"
            role="group"
            className="grid min-h-0 grow grid-cols-1 gap-3 md:grid-cols-2 wide:h-[380px]"
          >
            <GanttChart planning={data.planning} />
            <CostDistribution costs={data.costs} />
          </div>
        </div>

        {/* Le plan d'usine occupe seul la colonne de droite. */}
        <FactoryOverview />
      </section>
    </div>
  );
}
