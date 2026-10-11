import type { Metadata } from 'next';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { optimizeMoldSequence } from '@/server/domain/machines';
import { ButtonLink, Card, CardHeader, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { can } from '@/server/domain/permissions';
import { cn } from '@/lib/cn';
import { formatDate, formatDuration, formatNumber, formatTime } from '@/lib/format';
import { AssignMachineSelect } from './assign-machine-select';
import { CancelOrderButton } from './cancel-order-button';
import { GanttBoard } from './gantt-board';
import { RecommendationInlineApprove } from '@/components/factory/recommendation-inline-approve';

export const metadata: Metadata = { title: 'Planning' };
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

const HORIZON_OPTIONS = [
  { key: 'jour', label: 'Jour', days: 1 },
  { key: 'semaine', label: 'Semaine', days: 7 },
  { key: 'mois', label: 'Mois', days: 30 },
] as const;
type HorizonKey = (typeof HORIZON_OPTIONS)[number]['key'];
const DEFAULT_HORIZON: HorizonKey = 'semaine';

/** Construit un lien `/planning` qui conserve l'atelier et l'horizon choisis. */
function planningHref(atelier: string | undefined, horizon: HorizonKey): string {
  const params = new URLSearchParams();
  if (atelier) params.set('atelier', atelier);
  if (horizon !== DEFAULT_HORIZON) params.set('horizon', horizon);
  const query = params.toString();
  return query ? `/planning?${query}` : '/planning';
}

const STATUS_STYLES: Record<string, string> = {
  planned: 'bg-brand/15 border-brand/40 text-brand',
  released: 'bg-brand/20 border-brand/50 text-brand',
  running: 'bg-normal-soft border-normal/40 text-normal',
  paused: 'bg-warning-soft border-warning/45 text-warning',
  done: 'bg-surface-sunken border-line text-fg-muted',
  cancelled: 'bg-surface-sunken border-line text-fg-subtle line-through',
};

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planifié',
  released: 'Lancé',
  running: 'En cours',
  paused: 'Suspendu',
  done: 'Terminé',
  cancelled: 'Annulé',
};

const SHIFT_LABELS = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  night: 'Nuit',
} as const;

const SHIFT_STYLES = {
  morning: 'border-info/35 bg-info-soft text-info',
  afternoon: 'border-warning/35 bg-warning-soft text-warning',
  night: 'border-brand/35 bg-brand-soft text-brand',
} as const;

/**
 * Planning de production (§19).
 *
 * Représentation temporelle par machine, sur un horizon jour / semaine / mois
 * au choix. Le Gantt (`GanttBoard`) est glisser-déposer : chaque dépôt
 * rejoue `scheduleProductionOrderAction`, qui revérifie toutes les règles
 * côté serveur (compatibilité pièce/machine, chevauchement de créneau,
 * périmètre d'atelier) — aucune validation ne repose sur le client.
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ atelier?: string; horizon?: string }>;
}) {
  const user = await requirePermission('planning:read');
  const canWrite = can(user.permissions, 'planning:write');
  const canApprove = can(user.permissions, 'recommendations:approve');
  const db = await getDb();
  const { atelier, horizon } = await searchParams;

  const selectedHorizon =
    HORIZON_OPTIONS.find((option) => option.key === horizon)?.key ?? DEFAULT_HORIZON;
  const HORIZON_DAYS = HORIZON_OPTIONS.find((option) => option.key === selectedHorizon)!.days;

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + HORIZON_DAYS * DAY_MS);

  const [machines, orders, employees, activeCustomerOrders, planningRecommendations] = await Promise.all([
    db
      .select({
        id: t.machines.id,
        code: t.machines.code,
        name: t.machines.name,
        status: t.machines.status,
        workshopId: t.machines.workshopId,
        workshopName: t.workshops.name,
        workshopCode: t.workshops.code,
      })
      .from(t.machines)
      .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
      .orderBy(t.workshops.code, t.machines.code),
    db
      .select({
        id: t.productionOrders.id,
        number: t.productionOrders.number,
        status: t.productionOrders.status,
        machineId: t.productionOrders.machineId,
        quantityUnits: t.productionOrders.quantityUnits,
        producedUnits: t.productionOrders.producedUnits,
        plannedStartAt: t.productionOrders.plannedStartAt,
        plannedEndAt: t.productionOrders.plannedEndAt,
        plannedUnitsPerHour: t.productionOrders.plannedUnitsPerHour,
        productName: t.products.name,
        moldId: t.molds.id,
        moldReference: t.molds.reference,
        changeoverMinutes: t.molds.changeoverMinutes,
        orderNumber: t.customerOrders.number,
        orderId: t.customerOrders.id,
      })
      .from(t.productionOrders)
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .leftJoin(t.molds, eq(t.productionOrders.moldId, t.molds.id))
      .leftJoin(t.customerOrders, eq(t.productionOrders.customerOrderId, t.customerOrders.id))
      .where(
        and(
          gte(t.productionOrders.plannedEndAt, windowStart),
          lte(t.productionOrders.plannedStartAt, windowEnd),
        ),
      )
      .orderBy(t.productionOrders.plannedStartAt),
    db
      .select({
        id: t.employees.id,
        matricule: t.employees.matricule,
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
        jobTitle: t.employees.jobTitle,
        shift: t.employees.shift,
        workshopName: t.workshops.name,
        assignedMachineId: t.employees.assignedMachineId,
        assignedMachineName: t.machines.name,
        assignedMachineCode: t.machines.code,
      })
      .from(t.employees)
      .leftJoin(t.workshops, eq(t.employees.workshopId, t.workshops.id))
      .leftJoin(t.machines, eq(t.employees.assignedMachineId, t.machines.id))
      .where(eq(t.employees.isActive, true))
      .orderBy(t.employees.lastName, t.employees.firstName),
    db
      .select({
        id: t.customerOrders.id,
        number: t.customerOrders.number,
        customerName: t.customers.name,
        status: t.customerOrders.status,
        priority: t.customerOrders.priority,
        dueAt: t.customerOrders.dueAt,
        totalUnits: sql<number>`coalesce(sum(${t.orderLines.quantityUnits}), 0)`,
        producedUnits: sql<number>`coalesce(sum(${t.orderLines.producedUnits}), 0)`,
        reservedUnits: sql<number>`coalesce(sum(${t.orderLines.reservedUnits}), 0)`,
      })
      .from(t.customerOrders)
      .innerJoin(t.customers, eq(t.customerOrders.customerId, t.customers.id))
      .leftJoin(t.orderLines, eq(t.orderLines.orderId, t.customerOrders.id))
      .where(inArray(t.customerOrders.status, ['confirmed', 'in_production', 'ready']))
      .groupBy(
        t.customerOrders.id,
        t.customerOrders.number,
        t.customers.name,
        t.customerOrders.status,
        t.customerOrders.priority,
        t.customerOrders.dueAt,
      )
      .orderBy(t.customerOrders.dueAt),
    // Recommandations liées à une optimisation de planning déjà détectée et
    // formalisée (§13, §20) — sert à proposer une validation directe plutôt
    // que de renvoyer systématiquement vers le centre d'alertes.
    db
      .select({
        alertId: t.alerts.id,
        machineId: t.alerts.machineId,
        recommendationId: t.recommendations.id,
        recommendationStatus: t.recommendations.status,
      })
      .from(t.alerts)
      .innerJoin(t.recommendations, eq(t.recommendations.alertId, t.alerts.id))
      .where(and(eq(t.alerts.domain, 'planning'), eq(t.alerts.status, 'open'))),
  ]);

  const workshopOptions = Array.from(
    new Map(machines.map((machine) => [machine.workshopCode, machine.workshopName] as const)),
  ).map(([code, name]) => ({ code, name }));
  const selectedWorkshop = workshopOptions.some((workshop) => workshop.code === atelier) ? atelier : undefined;
  const visibleMachines = selectedWorkshop
    ? machines.filter((machine) => machine.workshopCode === selectedWorkshop)
    : machines;
  const visibleMachineIds = new Set(visibleMachines.map((machine) => machine.id));
  // Les OF « SIM-... » sont générés par le simulateur de presses pour animer la
  // télémétrie du parc machines (§9) : ils ne représentent aucune planification
  // réelle et ne doivent pas polluer le planning (déjà visibles sur les fiches
  // machine et le parc).
  const scheduledOrders = orders.filter((order) => !order.number.startsWith('SIM-'));
  const visibleOrders = scheduledOrders.filter(
    (order) => order.machineId && visibleMachineIds.has(order.machineId),
  );

  // Un chef d'atelier ne peut affecter un opérateur qu'aux presses de son
  // propre atelier — la même règle que `assignEmployeeToMachineAction`.
  const assignableMachines = user.workshopId
    ? machines.filter((machine) => machine.workshopId === user.workshopId)
    : machines;

  const byWorkshop = visibleMachines.reduce<Record<string, typeof machines>>((acc, machine) => {
    (acc[machine.workshopName] ??= []).push(machine);
    return acc;
  }, {});

  // Ordre actuellement en cours sur chaque presse — sert à l'affichage de
  // « Ordre de fabrication » pour l'opérateur qui y est affecté (§19). On
  // préfère un ordre « en cours » à un ordre simplement « lancé ».
  const currentOrderByMachine = new Map<string, (typeof scheduledOrders)[number]>();
  for (const order of scheduledOrders) {
    if (!order.machineId || (order.status !== 'running' && order.status !== 'released')) continue;
    const existing = currentOrderByMachine.get(order.machineId);
    if (!existing || (existing.status !== 'running' && order.status === 'running')) {
      currentOrderByMachine.set(order.machineId, order);
    }
  }
  const selectedWorkshopName = workshopOptions.find((workshop) => workshop.code === selectedWorkshop)?.name;
  const productionEmployees = employees.filter(
    (employee) =>
      /opérat|régleur presse/i.test(employee.jobTitle) &&
      (!selectedWorkshopName || employee.workshopName === selectedWorkshopName),
  );

  // Détection d'un regroupement de moules possible sur chaque machine (§20).
  const optimizations = visibleMachines
    .map((machine) => {
      const jobs = visibleOrders
        .filter((order) => order.machineId === machine.id && order.moldId)
        .map((order) => ({
          id: order.number,
          moldId: order.moldId!,
          moldLabel: order.moldReference ?? '',
          quantityUnits: order.quantityUnits,
          unitsPerHour: order.plannedUnitsPerHour,
          changeoverMinutes: order.changeoverMinutes ?? 180,
        }));

      return { machine, result: jobs.length >= 2 ? optimizeMoldSequence(jobs) : null };
    })
    .filter((entry) => entry.result?.improved);

  // Une optimisation détectée ici n'a une recommandation à valider que si le
  // moteur de recommandations (encore amorcé par le seed, §13) en a déjà
  // formalisé une pour cette machine — on ne fabrique jamais un bouton de
  // validation qui n'aurait rien de réel derrière lui.
  const recommendationByMachineId = new Map(
    planningRecommendations
      .filter((row) => row.machineId && !['executed', 'rejected'].includes(row.recommendationStatus))
      .map((row) => [row.machineId as string, row.recommendationId] as const),
  );

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Planning de production"
        description={`Affectation des opérateurs et charge des presses du ${formatDate(windowStart)} au ${formatDate(new Date(windowEnd.getTime() - DAY_MS))}.`}
        action={canWrite ? <ButtonLink href="/planning/nouveau">Créer le planning</ButtonLink> : undefined}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtrer le planning par atelier" className="flex flex-wrap gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-2 shadow-[var(--shadow-card)]">
          <Link
            href={planningHref(undefined, selectedHorizon)}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
              !selectedWorkshop ? 'border-brand/35 bg-brand-soft text-brand' : 'border-transparent text-fg-muted hover:border-line hover:bg-surface-sunken hover:text-fg',
            )}
          >
            Vue d’ensemble
          </Link>
          {workshopOptions.map((workshop) => (
            <Link
              key={workshop.code}
              href={planningHref(workshop.code, selectedHorizon)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                selectedWorkshop === workshop.code ? 'border-brand/35 bg-brand-soft text-brand' : 'border-transparent text-fg-muted hover:border-line hover:bg-surface-sunken hover:text-fg',
              )}
            >
              {workshop.name}
            </Link>
          ))}
        </nav>

        <nav aria-label="Choisir l’horizon du planning" className="flex gap-1 rounded-[var(--radius-card)] border border-line bg-surface p-1 shadow-[var(--shadow-card)]">
          {HORIZON_OPTIONS.map((option) => (
            <Link
              key={option.key}
              href={planningHref(selectedWorkshop, option.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
                selectedHorizon === option.key ? 'bg-brand-soft text-brand' : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      <Card className="mb-5 overflow-hidden">
        <CardHeader
          title="Affectation des opérateurs"
          subtitle="Une ligne par opérateur, avec son équipe et sa dernière presse affectée"
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-y border-line bg-surface-sunken text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                <th scope="col" className="px-5 py-3">Opérateur</th>
                <th scope="col" className="px-4 py-3">Fonction</th>
                <th scope="col" className="px-4 py-3">Poste</th>
                <th scope="col" className="px-4 py-3">Atelier</th>
                <th scope="col" className="px-4 py-3">Presse</th>
                <th scope="col" className="px-4 py-3">Ordre de fabrication</th>
                <th scope="col" className="px-5 py-3">Situation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {productionEmployees.map((employee) => {
                const currentOrder = employee.assignedMachineId
                  ? currentOrderByMachine.get(employee.assignedMachineId)
                  : undefined;

                return (
                  <tr key={employee.id} className="transition-colors hover:bg-surface-sunken/70">
                    <th scope="row" className="px-5 py-3.5 font-normal">
                      <p className="font-semibold text-fg">{employee.firstName} {employee.lastName}</p>
                      <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">{employee.matricule}</p>
                    </th>
                    <td className="px-4 py-3.5 text-[0.8125rem] text-fg-muted">{employee.jobTitle}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', SHIFT_STYLES[employee.shift])}>
                        {SHIFT_LABELS[employee.shift]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[0.8125rem] text-fg-muted">{employee.workshopName ?? 'Non rattaché'}</td>
                    <td className="px-4 py-3.5">
                      {canWrite ? (
                        <AssignMachineSelect
                          employeeId={employee.id}
                          currentMachineId={employee.assignedMachineId}
                          machines={assignableMachines}
                        />
                      ) : employee.assignedMachineName ? (
                        <>
                          <span className="block font-medium text-fg">
                            {employee.assignedMachineName}
                          </span>
                          <span className="mt-0.5 block text-[0.6875rem] text-fg-subtle">
                            {employee.assignedMachineCode}
                          </span>
                        </>
                      ) : (
                        <span className="text-[0.8125rem] text-fg-subtle">Non affectée</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {currentOrder ? (
                        <>
                          <span className="font-medium text-fg">{currentOrder.productName}</span>
                          <span className="mt-0.5 block text-[0.6875rem] text-fg-subtle">{currentOrder.number}</span>
                        </>
                      ) : (
                        <span className="text-[0.8125rem] text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {currentOrder ? (
                        <StatusBadge
                          severity={currentOrder.status === 'paused' ? 'warning' : currentOrder.status === 'running' ? 'normal' : 'info'}
                          size="sm"
                        >
                          {STATUS_LABELS[currentOrder.status] ?? currentOrder.status}
                        </StatusBadge>
                      ) : (
                        <StatusBadge severity="info" size="sm">Disponible</StatusBadge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line px-5 py-3 text-xs text-fg-muted">
          {Object.entries(SHIFT_LABELS).map(([shift, label]) => (
            <span key={shift} className="flex items-center gap-2">
              <span className={cn('size-2.5 rounded-full border', SHIFT_STYLES[shift as keyof typeof SHIFT_STYLES])} aria-hidden />
              {label} : {productionEmployees.filter((employee) => employee.shift === shift).length} opérateur(s)
            </span>
          ))}
        </div>
      </Card>

      {optimizations.length > 0 ? (
        <Card className="mb-5 border-brand/25">
          <CardHeader
            title="Optimisation des changements de moule"
            subtitle="Regrouper les ordres partageant le même moule libère du temps machine"
          />
          <ul className="space-y-2.5 px-5 pb-5">
            {optimizations.map(({ machine, result }) => {
              const recommendationId = recommendationByMachineId.get(machine.id);
              return (
                <li key={machine.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem]">
                  <span className="font-medium text-fg">{machine.name}</span>
                  <span className="text-fg-muted">
                    {result!.current.changeovers} changement(s) → {result!.optimized.changeovers}
                  </span>
                  <span className="text-normal">
                    Temps économisé{' '}
                    <span className="tabular font-semibold">{formatDuration(result!.savedMinutes)}</span>
                  </span>
                  <span className="text-fg-muted">
                    soit environ{' '}
                    <span className="tabular font-medium">{formatNumber(result!.extraUnits)}</span> pièces
                    supplémentaires
                  </span>
                  <span className="text-xs text-fg-subtle">
                    Séquence proposée : {result!.optimized.order.join(' → ')}
                  </span>
                  {recommendationId && canApprove ? (
                    <RecommendationInlineApprove recommendationId={recommendationId} />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-fg-subtle">
            Ces propositions apparaissent également dans le centre d’alertes. Quand une recommandation a
            déjà été formalisée, elle se valide directement ci-dessus. Aucune réorganisation n’est
            appliquée sans décision humaine.
          </p>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Charge des presses"
          subtitle={`Une ligne par presse, ${HORIZON_DAYS} jour${HORIZON_DAYS > 1 ? 's' : ''} glissant${HORIZON_DAYS > 1 ? 's' : ''}`}
        />

        <div className="overflow-x-auto px-5 pb-5">
          <GanttBoard
            workshops={Object.entries(byWorkshop).map(([name, workshopMachines]) => ({
              name,
              machines: workshopMachines.map((machine) => ({
                id: machine.id,
                code: machine.code,
                name: machine.name,
              })),
            }))}
            orders={visibleOrders.map((order) => ({
              id: order.id,
              number: order.number,
              status: order.status,
              machineId: order.machineId!,
              productName: order.productName,
              plannedStartAt: order.plannedStartAt.toISOString(),
              plannedEndAt: order.plannedEndAt.toISOString(),
            }))}
            windowStartIso={windowStart.toISOString()}
            horizonDays={HORIZON_DAYS}
            canWrite={canWrite}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          {Object.entries(STATUS_LABELS)
            .filter(([status]) => status !== 'cancelled')
            .map(([status, label]) => (
              <span key={status} className="flex items-center gap-1.5 text-[0.75rem] text-fg-muted">
                <span
                  aria-hidden
                  className={cn('size-2.5 rounded-sm border', STATUS_STYLES[status])}
                />
                {label}
              </span>
            ))}
        </div>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader
          title="Commandes en cours"
          subtitle="Les informations nécessaires pour préparer le programme sans quitter le planning"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead>
              <tr className="border-y border-line bg-surface-sunken text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                <th scope="col" className="px-5 py-3">Commande</th>
                <th scope="col" className="px-4 py-3">Client</th>
                <th scope="col" className="px-4 py-3">Échéance</th>
                <th scope="col" className="px-4 py-3">Priorité</th>
                <th scope="col" className="px-4 py-3">Avancement</th>
                <th scope="col" className="px-5 py-3">Reste à couvrir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {activeCustomerOrders.map((order) => {
                const totalUnits = Number(order.totalUnits);
                const coveredUnits = Number(order.producedUnits) + Number(order.reservedUnits);
                const remainingUnits = Math.max(totalUnits - coveredUnits, 0);
                const progress = totalUnits > 0 ? Math.min(Math.round((coveredUnits / totalUnits) * 100), 100) : 0;
                return (
                  <tr key={order.id} className="transition-colors hover:bg-surface-sunken/70">
                    <th scope="row" className="px-5 py-3.5 font-normal">
                      <Link href={`/commandes/${order.id}`} className="font-semibold text-brand hover:underline">#{order.number}</Link>
                      <span className="mt-0.5 block text-[0.6875rem] text-fg-subtle">{order.status === 'ready' ? 'Prête' : order.status === 'in_production' ? 'En production' : 'Confirmée'}</span>
                    </th>
                    <td className="px-4 py-3.5 text-[0.8125rem] font-medium text-fg">{order.customerName}</td>
                    <td className="tabular px-4 py-3.5 text-[0.8125rem] text-fg-muted">{formatDate(order.dueAt)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge severity={order.priority === 'critical' ? 'critical' : order.priority === 'high' ? 'warning' : 'info'} size="sm">
                        {order.priority === 'critical' ? 'Critique' : order.priority === 'high' ? 'Haute' : order.priority === 'low' ? 'Basse' : 'Normale'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex min-w-44 items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"><span className="block h-full rounded-full bg-normal" style={{ width: `${progress}%` }} /></div>
                        <span className="tabular w-10 text-right text-xs font-semibold text-fg">{progress}%</span>
                      </div>
                    </td>
                    <td className="tabular px-5 py-3.5 text-[0.8125rem] font-semibold text-fg">{formatNumber(remainingUnits)} pièces</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Ordres planifiés" subtitle="Détail de la fenêtre et de l’atelier affichés" />
        <ul className="divide-y divide-line">
          {visibleOrders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <span className="w-[170px] font-medium text-fg">{order.productName}</span>
              <StatusBadge
                severity={
                  order.status === 'paused' ? 'warning' : order.status === 'running' ? 'normal' : 'info'
                }
                size="sm"
              >
                {STATUS_LABELS[order.status] ?? order.status}
              </StatusBadge>
              <span className="text-[0.8125rem] text-fg-muted">{order.number}</span>
              {order.moldReference ? (
                <span className="text-[0.75rem] text-fg-subtle">Moule {order.moldReference}</span>
              ) : null}
              {order.orderNumber && order.orderId ? (
                <Link
                  href={`/commandes/${order.orderId}`}
                  className="text-[0.75rem] text-brand hover:underline"
                >
                  Commande #{order.orderNumber}
                </Link>
              ) : null}
              <span className="tabular ml-auto text-[0.75rem] text-fg-subtle">
                {formatDate(order.plannedStartAt)} {formatTime(order.plannedStartAt)} →{' '}
                {formatTime(order.plannedEndAt)} · {formatNumber(order.quantityUnits)} pièces
              </span>
              {canWrite ? (
                <Link
                  href={`/planning/nouveau?ordre=${order.id}`}
                  className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand hover:underline"
                >
                  <Pencil className="size-3" aria-hidden />
                  Modifier
                </Link>
              ) : null}
              {canWrite && (order.status === 'planned' || order.status === 'released') ? (
                <CancelOrderButton orderId={order.id} orderNumber={order.number} />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
