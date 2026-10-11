import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { after } from 'next/server';
import type { Database } from '../db/client';
import * as t from '../db/schema';
import type { SessionUser } from '../auth/session';
import { getAvailableMaintenanceStaff } from './maintenance';
import { nextIncidentReference } from './incidents';
import { dispatchOutOfAppNotifications } from './notification-dispatch';

const NOTIFIED_ROLES = ['responsable_production', 'responsable_maintenance'] as const;

function formatDeadline(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/**
 * Transforme un passage brutal à l'arrêt en incident, alerte et notifications
 * contextualisées. L'appelant garde la responsabilité du changement d'état.
 */
export async function createAbruptStopRecords({
  db,
  machine,
  user,
  reason,
  occurredAt,
}: {
  db: Database;
  machine: typeof t.machines.$inferSelect;
  user: SessionUser;
  reason: string | undefined;
  occurredAt: Date;
}) {
  const [currentOrders, previousIncidents, staff] = await Promise.all([
    db
      .select({
        id: t.productionOrders.id,
        number: t.productionOrders.number,
        quantityUnits: t.productionOrders.quantityUnits,
        producedUnits: t.productionOrders.producedUnits,
        plannedEndAt: t.productionOrders.plannedEndAt,
        customerOrderId: t.productionOrders.customerOrderId,
        customerOrderNumber: t.customerOrders.number,
        productName: t.products.name,
      })
      .from(t.productionOrders)
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .leftJoin(t.customerOrders, eq(t.productionOrders.customerOrderId, t.customerOrders.id))
      .where(
        and(eq(t.productionOrders.machineId, machine.id), eq(t.productionOrders.status, 'running')),
      )
      .limit(1),
    db
      .select({ reference: t.incidents.reference, rootCause: t.incidents.rootCause })
      .from(t.incidents)
      .where(and(eq(t.incidents.machineId, machine.id), eq(t.incidents.status, 'resolved')))
      .orderBy(desc(t.incidents.occurredAt))
      .limit(1),
    getAvailableMaintenanceStaff(db, occurredAt),
  ]);

  const currentOrder = currentOrders[0];
  const previousIncident = previousIncidents[0];

  const [workshop] = await db
    .select({ id: t.workshops.id, name: t.workshops.name })
    .from(t.workshops)
    .where(eq(t.workshops.id, machine.workshopId))
    .limit(1);
  const reference = await nextIncidentReference(db, occurredAt);
  const availableStaff = staff.filter((person) => person.available);
  const staffLabel = availableStaff.length > 0
    ? availableStaff.map((person) => `${person.fullName} (N${person.skillLevel})`).join(', ')
    : 'Aucun technicien maintenance compétent disponible sur l’équipe actuelle';
  const orderImpact = currentOrder
    ? `${currentOrder.number} · ${Math.max(currentOrder.quantityUnits - currentOrder.producedUnits, 0).toLocaleString('fr-FR')} pièces restantes · fin prévue ${formatDeadline(currentOrder.plannedEndAt)}`
    : 'Aucun ordre de fabrication actif sur cette machine';
  const symptom = reason?.trim() || 'Arrêt ou défaut machine signalé sans motif détaillé.';

  const [incident] = await db
    .insert(t.incidents)
    .values({
      reference,
      title: `Arrêt brutal — ${machine.name}`,
      severity: 'critical',
      status: 'open',
      machineId: machine.id,
      workshopId: workshop?.id ?? machine.workshopId,
      productionOrderId: currentOrder?.id ?? null,
      symptom,
      tags: ['arrêt brutal', 'notification automatique'],
      downtimeMinutes: 0,
      estimatedCostCents: 0,
      declaredBy: user.employeeId,
      occurredAt,
    })
    .returning();

  await db.insert(t.alerts).values({
    severity: 'critical',
    status: 'open',
    domain: 'machine',
    title: `${machine.name} — arrêt brutal`,
    problem: symptom,
    probableCause: previousIncident?.rootCause
      ? `À confirmer. Dernière panne documentée sur cette machine : ${previousIncident.reference} — ${previousIncident.rootCause}`
      : 'Diagnostic maintenance requis.',
    consequences: `Planning : ${orderImpact}. Compétence : ${staffLabel}.`,
    impactCents: 0,
    impactOrigin: 'estimated',
    machineId: machine.id,
    workshopId: workshop?.id ?? machine.workshopId,
    customerOrderId: currentOrder?.customerOrderId ?? null,
    incidentId: incident.id,
    context: {
      trigger: 'abrupt_machine_stop',
      workshop: workshop?.name ?? null,
      productionOrder: currentOrder?.number ?? null,
      customerOrder: currentOrder?.customerOrderNumber ?? null,
      product: currentOrder?.productName ?? null,
      plannedEndAt: currentOrder?.plannedEndAt.toISOString() ?? null,
      remainingUnits: currentOrder
        ? Math.max(currentOrder.quantityUnits - currentOrder.producedUnits, 0)
        : null,
      qualifiedStaff: availableStaff.map((person) => ({
        employeeId: person.employeeId,
        name: person.fullName,
        skill: person.skillName,
        level: person.skillLevel,
      })),
      notifiedRoles: NOTIFIED_ROLES,
    },
    detectedAt: occurredAt,
  });

  const body = `Planning : ${orderImpact}. Intervention : ${staffLabel}.`;
  const title = `${machine.name} en arrêt brutal`;
  const href = `/maintenance?incident=${incident.id}`;

  await db.insert(t.notifications).values(
    NOTIFIED_ROLES.map((roleCode) => ({
      roleCode,
      severity: 'critical' as const,
      title,
      body,
      href,
      createdAt: occurredAt,
    })),
  );

  // Best-effort, après l'envoi de la réponse (§ next/server `after`) : ne doit
  // ni ralentir ni faire échouer la déclaration d'arrêt elle-même. `after`
  // garantit l'exécution jusqu'au bout même en serverless (Vercel `waitUntil`),
  // contrairement à une promesse simplement laissée en arrière-plan.
  after(() =>
    dispatchOutOfAppNotifications(db, { roleCodes: NOTIFIED_ROLES }, { severity: 'critical', title, body, href }).catch(
      (error) => console.error('[notifications] Échec de la diffusion hors-app.', error),
    ),
  );

  return { incident, orderImpact, availableStaff };
}
