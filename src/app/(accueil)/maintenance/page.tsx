import type { Metadata } from 'next';
import { Construction, FileLock2 } from 'lucide-react';
import { getMaintenanceOverview } from '@/server/db/fixtures/maintenance';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getDocumentLibrary } from '@/server/services/documents';
import { AssetsOverview } from '@/components/maintenance/assets-overview';
import { CauseAnalysis } from '@/components/maintenance/cause-analysis';
import { CriticalParts } from '@/components/maintenance/critical-parts';
import { DocumentCoverage } from '@/components/maintenance/document-coverage';
import { DocumentLibrary } from '@/components/maintenance/document-library';
import { MaintenanceHeader } from '@/components/maintenance/maintenance-header';
import { MaintenanceHistory } from '@/components/maintenance/maintenance-history';
import { MaintenanceInterventionsTable } from '@/components/maintenance/maintenance-interventions-table';
import { MaintenanceOverview } from '@/components/maintenance/maintenance-overview';
import { MaintenanceTabs } from '@/components/maintenance/maintenance-tabs';
import {
  MAINTENANCE_TABS,
  resolveMaintenanceTab,
  type MaintenanceTabId,
} from '@/components/maintenance/maintenance-tab-config';
import { MachineMaintenanceLegacy } from '@/components/maintenance/machine-maintenance-legacy';
import { PreventiveTable } from '@/components/maintenance/preventive-table';
import { ResolutionRate } from '@/components/maintenance/resolution-rate';
import { Panel } from '@/components/ui/panel';
import type { MaintenanceOverviewData } from '@/types/maintenance';

export const metadata: Metadata = { title: 'Maintenance générale' };
export const dynamic = 'force-dynamic';

/**
 * Maintenance générale — GMAO de site.
 *
 * La page ne fait que composer et distribuer. Le principe de répartition :
 * la **vue d'ensemble** ne porte que le travail du jour, chaque **onglet**
 * porte une seule question d'analyse. C'est ce qui évite l'écran fourre-tout.
 *
 * Les onglets Curatif, Préventif, Calendrier et Historique s'appuient en plus
 * sur la maintenance machines déjà reliée à la base — arrêts brutaux à traiter,
 * résolution d'incident, calendrier préventif, mémoire des pannes.
 */
export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; month?: string; incident?: string }>;
}) {
  const user = await requirePermission('maintenance:read');
  const { onglet, month, incident } = await searchParams;
  const tab = resolveMaintenanceTab(onglet);
  const data = await getMaintenanceOverview();
  /*
   * La documentation est rattachée aux machines : sans `machines:read`, la
   * route de téléchargement refuserait le fichier. Autant ne pas afficher une
   * liste de liens morts.
   */
  const canReadMachines = can(user.permissions, 'machines:read');

  return (
    <div className="flex flex-1 flex-col gap-3">
      <MaintenanceHeader />
      <MaintenanceTabs />
      <TabContent
        tab={tab}
        data={data}
        month={month}
        incident={incident}
        canReadMachines={canReadMachines}
      />
    </div>
  );
}

function TabContent({
  tab,
  data,
  month,
  incident,
  canReadMachines,
}: {
  tab: MaintenanceTabId;
  data: MaintenanceOverviewData;
  month?: string;
  incident?: string;
  canReadMachines: boolean;
}) {
  switch (tab) {
    case 'vue-ensemble':
      return <MaintenanceOverview data={data} />;

    case 'interventions':
      return (
        <div className="grid gap-3 wide:grid-cols-12">
          <div className="min-h-0 wide:col-span-8 wide:h-[640px]">
            <MaintenanceInterventionsTable
              interventions={data.interventions}
              openCount={data.requestTotal}
              showFooterLink={false}
            />
          </div>
          <div className="wide:col-span-4">
            <AssetsOverview />
          </div>
        </div>
      );

    case 'pieces':
      return (
        <div className="grid gap-3 lg:grid-cols-2">
          <CriticalParts parts={data.criticalParts} />
          <Panel className="justify-center px-6 py-10 text-center">
            <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
              Le stock de maintenance complet — pièces détachées, seuils, consommation et
              réapprovisionnement — se consulte pour l’instant dans{' '}
              <span className="font-medium text-ink">Stocks</span>.
            </p>
          </Panel>
        </div>
      );

    case 'preventif':
      return (
        <div className="flex flex-col gap-3">
          <PreventiveTable tasks={data.preventive} upcomingCount={data.preventiveCount} />
          <MachineMaintenanceLegacy monthParam={month} sections={['tasks']} />
        </div>
      );

    case 'historique':
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 wide:grid-cols-12">
            <div className="wide:col-span-5">
              <MaintenanceHistory entries={data.history} />
            </div>
            <div className="wide:col-span-4">
              <CauseAnalysis slices={data.causes} total={data.causeTotal} />
            </div>
            <div className="wide:col-span-3">
              <ResolutionRate
                resolved={data.resolution.resolved}
                trendLabel={data.resolution.trendLabel}
                series={data.resolution.series}
              />
            </div>
          </div>
          <MachineMaintenanceLegacy monthParam={month} sections={['pareto', 'memory']} />
        </div>
      );

    case 'curatif':
      return (
        <MachineMaintenanceLegacy
          monthParam={month}
          focusedIncident={incident}
          sections={['incidents']}
        />
      );

    case 'calendrier':
      return <MachineMaintenanceLegacy monthParam={month} sections={['calendar']} />;

    case 'documents':
      return <DocumentsTab canReadMachines={canReadMachines} />;

    default:
      return <TabPlaceholder tabId={tab} />;
  }
}

/**
 * Onglet Documents — documentation technique du site.
 *
 * Les documents sont aujourd'hui rattachés aux machines : c'est le seul
 * référentiel qui existe réellement en base. Le dire explicitement vaut mieux
 * que de laisser croire que les compresseurs ou les bâtiments y figurent déjà.
 */
async function DocumentsTab({ canReadMachines }: { canReadMachines: boolean }) {
  if (!canReadMachines) {
    return (
      <Panel className="items-center gap-2 px-6 py-12 text-center">
        <span className="grid size-9 place-items-center rounded-chip bg-warning/12 text-warning">
          <FileLock2 className="size-4" strokeWidth={2} />
        </span>
        <h2 className="text-[0.8125rem] font-semibold text-ink">Documentation non accessible</h2>
        <p className="max-w-md text-[0.75rem] leading-relaxed text-ink-muted">
          La documentation technique est rattachée aux machines. Votre rôle ne dispose pas de la
          permission « Consulter les machines ».
        </p>
      </Panel>
    );
  }

  const { entries, summary } = await getDocumentLibrary();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid min-w-0 gap-3 wide:grid-cols-12">
        <div className="min-h-0 wide:col-span-8 wide:h-[560px]">
          <DocumentLibrary entries={entries} canDownload />
        </div>
        <div className="min-h-0 wide:col-span-4 wide:h-[560px]">
          <DocumentCoverage summary={summary} />
        </div>
      </div>

      <Panel className="px-3.5 py-2.5">
        <p className="text-[0.6875rem] leading-relaxed text-ink-dim">
          Le dépôt et la suppression de documents se font depuis l’onglet Documents de chaque
          machine, où la permission d’écriture est vérifiée. Les actifs hors presses — compresseurs,
          groupes froids, bâtiments, utilités — n’ont pas encore de référentiel documentaire :
          seules les machines apparaissent ici.
        </p>
      </Panel>
    </div>
  );
}

/**
 * Onglet prévu dans l'architecture mais pas encore développé.
 * Annoncé explicitement plutôt que laissé vide : une page blanche laisse
 * croire à une panne.
 */
function TabPlaceholder({ tabId }: { tabId: string }) {
  const label = MAINTENANCE_TABS.find((tab) => tab.id === tabId)?.label ?? tabId;

  const detail: Record<string, string> = {
    utilites:
      'Suivi dédié aux utilités : électricité, air comprimé, eau, gaz, chauffage, ventilation et éclairage.',
    documents:
      'Plans, notices constructeur, rapports d’intervention et certificats de contrôle réglementaire.',
  };

  return (
    <Panel className="items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-9 place-items-center rounded-chip bg-primary/12 text-primary">
        <Construction className="size-4" strokeWidth={2} />
      </span>
      <h2 className="text-[0.8125rem] font-semibold text-ink">{label}</h2>
      <p className="max-w-md text-[0.75rem] leading-relaxed text-ink-muted">
        {detail[tabId] ?? 'Cet onglet est prévu dans l’architecture et sera développé prochainement.'}
      </p>
      <p className="text-[0.6875rem] text-ink-dim">Onglet prévu — développement à venir.</p>
    </Panel>
  );
}
