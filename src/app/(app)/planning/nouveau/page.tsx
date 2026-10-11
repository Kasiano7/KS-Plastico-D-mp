import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { Card, CardHeader, PageHeader, buttonClass } from '@/components/ui/primitives';
import { PlanningForm } from './planning-form';

export const metadata: Metadata = { title: 'Créer le planning' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ ordre?: string }>;

export default async function NewPlanningPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission('planning:write');
  const { ordre: editingOrderId } = await searchParams;
  const db = await getDb();

  const [orders, machines, compatibilities] = await Promise.all([
    db
      .select({
        id: t.productionOrders.id,
        number: t.productionOrders.number,
        productId: t.productionOrders.productId,
        productName: t.products.name,
        machineId: t.productionOrders.machineId,
        quantityUnits: t.productionOrders.quantityUnits,
        producedUnits: t.productionOrders.producedUnits,
        plannedStartAt: t.productionOrders.plannedStartAt,
        plannedEndAt: t.productionOrders.plannedEndAt,
      })
      .from(t.productionOrders)
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .orderBy(t.productionOrders.plannedStartAt),
    db
      .select({
        id: t.machines.id,
        name: t.machines.name,
        code: t.machines.code,
        workshopId: t.machines.workshopId,
        workshopName: t.workshops.name,
      })
      .from(t.machines)
      .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
      .where(eq(t.machines.isActive, true))
      .orderBy(t.workshops.code, t.machines.code),
    db
      .select({ productId: t.productMachines.productId, machineId: t.productMachines.machineId })
      .from(t.productMachines),
  ]);

  const availableMachines = user.workshopId
    ? machines.filter((machine) => machine.workshopId === user.workshopId)
    : machines;

  // Les OF « SIM-... » appartiennent au simulateur de presses (§9) : il les
  // gère lui-même à chaque relevé de télémétrie, un planificateur ne doit pas
  // pouvoir les réaffecter manuellement.
  const nonSimulatedOrders = orders.filter((order) => !order.number.startsWith('SIM-'));
  const editingOrder = editingOrderId
    ? nonSimulatedOrders.find((order) => order.id === editingOrderId)
    : undefined;

  const plannableOrders = nonSimulatedOrders
    .map((order) => ({ ...order, remainingUnits: Math.max(order.quantityUnits - order.producedUnits, 0) }))
    // Un ordre déjà couvert ne se propose plus à la création, sauf s'il s'agit
    // précisément de celui qu'on est en train de modifier.
    .filter((order) => order.remainingUnits > 0 || order.id === editingOrderId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={editingOrder ? 'Modifier l’affectation' : 'Préparer le programme'}
        description={
          editingOrder
            ? `Réaffecter « ${editingOrder.productName} » (${editingOrder.number}) à une autre presse ou un autre créneau.`
            : 'Choisissez d’abord la presse : seuls les ordres dont la pièce est compatible sont ensuite proposés.'
        }
        action={<Link href="/planning" className={buttonClass('secondary', 'md')}>Retour au planning</Link>}
      />
      <Card>
        <CardHeader
          title={editingOrder ? 'Modifier l’affectation' : 'Nouvelle affectation'}
          subtitle={`${availableMachines.length} presse(s) disponible(s) dans votre périmètre`}
        />
        <PlanningForm
          orders={plannableOrders}
          machines={availableMachines}
          compatibilities={compatibilities}
          initialOrder={editingOrder ? { ...editingOrder, remainingUnits: Math.max(editingOrder.quantityUnits - editingOrder.producedUnits, 0) } : null}
        />
      </Card>
    </div>
  );
}
