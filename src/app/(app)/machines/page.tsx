import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getGatewayReadings, getMachineFleet } from '@/server/services/machine-fleet';
import { FleetToolbar } from '@/components/machines/fleet-toolbar';
import { isFleetView, type FleetViewKey } from '@/components/machines/fleet-view-keys';
import { MachineCard } from '@/components/machines/machine-card';
import {
  AddMachineCard,
  FleetAnalysis,
  FleetConnections,
  FleetList,
  parseFleetSort,
  sortFleetMachines,
  type FleetSortColumn,
} from '@/components/machines/fleet-views';
import { ButtonLink, EmptyState } from '@/components/ui/primitives';
import styles from '@/components/machines/machines.module.css';

export const metadata: Metadata = { title: 'Parc machines' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{
  vue?: string;
  atelier?: string;
  etat?: string;
  recherche?: string;
  retirees?: string;
  tri?: string;
  sens?: string;
}>;

export default async function MachinesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission('machines:read');
  const query = await searchParams;

  const view: FleetViewKey = isFleetView(query.vue) ? query.vue : 'ensemble';
  const workshopId = query.atelier ?? 'all';
  const state = query.etat ?? 'all';
  const search = query.recherche?.trim() ?? '';
  const showRetired = query.retirees === '1';

  const fleet = await getMachineFleet();

  // Construits depuis les machines réellement visibles avec le filtre
  // « retirées » courant : un atelier qui ne compte que des machines retirées
  // doit rester sélectionnable dès qu'on les affiche, pas seulement quand une
  // de ses machines est active (`fleet.workshops` ignore les retirées).
  const visibleForWorkshops = fleet.machines.filter((machine) => showRetired || machine.isActive);
  const workshopOptions = Array.from(
    new Map(visibleForWorkshops.map((machine) => [machine.workshopId, machine.workshopName] as const)),
  ).map(([id, name]) => ({
    id,
    name,
    machineCount: visibleForWorkshops.filter((machine) => machine.workshopId === id).length,
  }));

  const needle = search.toLowerCase();
  // Une machine retirée du parc (§ actions machine) sort de la vue par défaut
  // — elle ne peut plus être planifiée — mais reste consultable via le lien
  // dédié, jamais perdue.
  const retiredCount = fleet.machines.filter((machine) => !machine.isActive).length;
  const machines = fleet.machines.filter((machine) => {
    if (!showRetired && !machine.isActive) return false;
    if (workshopId !== 'all' && machine.workshopId !== workshopId) return false;
    if (state !== 'all' && machine.status !== state) return false;
    if (!needle) return true;
    return [machine.name, machine.code, machine.manufacturer, machine.model, machine.currentOrderNumber]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle));
  });

  // Le tri ne s'applique qu'à la vue Liste : les autres vues gardent l'ordre
  // du parc (grille, classement TRS de l'Analyse, etc.).
  const sort = parseFleetSort(query.tri, query.sens);
  const sortedMachines = view === 'liste' ? sortFleetMachines(machines, sort) : machines;

  function buildSortHref(column: FleetSortColumn): string {
    const next = new URLSearchParams();
    if (query.vue) next.set('vue', query.vue);
    if (query.atelier) next.set('atelier', query.atelier);
    if (query.etat) next.set('etat', query.etat);
    if (query.recherche) next.set('recherche', query.recherche);
    if (query.retirees) next.set('retirees', query.retirees);
    next.set('tri', column);
    if (sort?.column === column && sort.direction === 'asc') next.set('sens', 'desc');
    return `/machines?${next}`;
  }

  const gatewayReadings =
    view === 'connexions' ? await getGatewayReadings(machines.map((machine) => machine.id)) : new Map();

  const retiredToggleParams = new URLSearchParams();
  if (query.vue) retiredToggleParams.set('vue', query.vue);
  if (query.atelier) retiredToggleParams.set('atelier', query.atelier);
  if (query.etat) retiredToggleParams.set('etat', query.etat);
  if (query.recherche) retiredToggleParams.set('recherche', query.recherche);
  if (!showRetired) retiredToggleParams.set('retirees', '1');
  const retiredToggleHref = `/machines${retiredToggleParams.size > 0 ? `?${retiredToggleParams}` : ''}`;
  const activeTotalCount = fleet.totalCount - retiredCount;

  return (
    <div className={styles.shell}>
      <div className="mx-auto max-w-[110rem]">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[1.75rem] leading-9 font-semibold tracking-tight text-fg">Parc machines</h1>
            <p className="mt-1 text-[0.9375rem] text-fg-muted">
              Vue en temps réel de l’état, de l’analyse et des performances des machines connectées.
            </p>
          </div>
          {can(user.permissions, 'admin:write') ? (
            <ButtonLink href="/machines/nouvelle" variant="secondary" size="sm">
              <Plus className="size-4" aria-hidden />
              Ajouter une machine
            </ButtonLink>
          ) : null}
        </header>

        <FleetToolbar
          view={view}
          workshops={workshopOptions}
          workshopId={workshopId}
          state={state}
          search={search}
          connectedCount={fleet.connectedCount}
          totalCount={fleet.totalCount}
          connectionTitle={`${fleet.gatewayCount} presse(s) raccordée(s) à la passerelle, ${fleet.simulatedCount} en télémétrie simulée.`}
        />

        {retiredCount > 0 ? (
          <p className="mb-4 text-[0.8125rem] text-fg-muted">
            {retiredCount} presse{retiredCount > 1 ? 's' : ''} retirée{retiredCount > 1 ? 's' : ''} du parc
            {showRetired ? ' — affichée' + (retiredCount > 1 ? 's' : '') + ' ci-dessous' : ''} ·{' '}
            <Link href={retiredToggleHref} className="font-medium text-brand hover:underline">
              {showRetired ? 'Masquer les machines retirées' : 'Afficher les machines retirées'}
            </Link>
          </p>
        ) : null}

        {machines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong">
            <EmptyState
              title="Aucune machine ne correspond à ces filtres"
              description="Élargissez la recherche ou réinitialisez les filtres pour retrouver l’ensemble du parc."
            />
          </div>
        ) : view === 'liste' ? (
          <FleetList machines={sortedMachines} sort={sort} buildSortHref={buildSortHref} />
        ) : view === 'analyse' ? (
          <FleetAnalysis fleet={fleet} machines={machines} />
        ) : view === 'connexions' ? (
          <FleetConnections fleet={fleet} machines={machines} gatewayReadings={gatewayReadings} />
        ) : (
          <div className={styles.fleetGrid}>
            {machines.map((machine) => (
              <MachineCard key={machine.id} machine={machine} />
            ))}
            <AddMachineCard canCreate={can(user.permissions, 'admin:write')} />
          </div>
        )}

        {view === 'ensemble' && machines.length > 0 ? (
          <p className="mt-6 text-[0.8125rem] text-fg-muted">
            Affichage de 1 à {machines.length} sur {showRetired ? fleet.totalCount : activeTotalCount} machines
            {showRetired ? '' : ' actives'} du parc · {fleet.connectedCount} connectées.
          </p>
        ) : null}
      </div>
    </div>
  );
}
