import { AlertTriangle, CalendarCheck2, CircleGauge, Timer, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MaintenanceCalendar } from './maintenance-calendar';
import { MaintenanceInterventionsTable } from './maintenance-interventions-table';
import { MaintenanceKpiCard } from './maintenance-kpi-card';
import { MaintenanceRequestDistribution } from './maintenance-request-distribution';
import { TechnicianAssignment } from './technician-assignment';
import type { MaintenanceOverviewData } from '@/types/maintenance';
import { DemoDataNotice } from './demo-data-notice';

/**
 * Vue d'ensemble de la maintenance.
 *
 * Volontairement réduite à ce qui sert **aujourd'hui** :
 *   1. les cinq indicateurs du mois,
 *   2. ce qu'il faut traiter — la file d'interventions, ouvrable ligne à ligne,
 *   3. ce qui est planifié — le calendrier de la semaine,
 *   4. qui peut le prendre — charge et compétences des techniciens.
 *
 * Le préventif, l'historique, les pièces, les causes et le parc d'actifs ont
 * rejoint leurs onglets respectifs : ce sont des vues d'analyse, on ne les
 * consulte pas en même temps que la file du jour. Un écran de pilotage se lit
 * en dix secondes ; treize panneaux ne se lisent pas.
 */

/** La donnée nomme un indicateur, l'écran choisit son icône. */
const KPI_ICONS: Record<string, LucideIcon> = {
  'open-requests': AlertTriangle,
  'upcoming-preventive': CalendarCheck2,
  availability: CircleGauge,
  mtti: Timer,
  cost: Wallet,
};

export function MaintenanceOverview({ data }: { data: MaintenanceOverviewData }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Ce qui vient d'une mesure et ce qui n'en vient pas doit se distinguer
          sans avoir à ouvrir le code (règle n° 4). */}
      <DemoDataNotice />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 wide:grid-cols-5">
        {data.kpis.map((kpi) => (
          <MaintenanceKpiCard key={kpi.id} kpi={kpi} icon={KPI_ICONS[kpi.id] ?? AlertTriangle} />
        ))}
      </div>

      <div className="grid min-w-0 gap-3 wide:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 wide:col-span-8">
          <div className="min-h-0 lg:h-[386px]">
            <MaintenanceInterventionsTable
              interventions={data.interventions}
              openCount={data.requestTotal}
            />
          </div>
          <MaintenanceCalendar week={data.week} />
        </div>

        <aside className="flex min-w-0 flex-col gap-3 wide:col-span-4">
          <TechnicianAssignment technicians={data.technicians} skillGap={data.skillGap} />
          <MaintenanceRequestDistribution
            slices={data.requestDistribution}
            total={data.requestTotal}
          />
        </aside>
      </div>
    </div>
  );
}
