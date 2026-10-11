import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { computeProfitability, computeUnitCost } from '@/server/domain/costing';
import {
  Badge,
  Card,
  CardHeader,
  DataOrigin,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatCents, formatCentsPrecise, formatNumber, formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const db = await getDb();
  const [product] = await db
    .select({ name: t.products.name })
    .from(t.products)
    .where(eq(t.products.id, (await params).id))
    .limit(1);
  return { title: product?.name ?? 'Pièce' };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('catalog:read');
  const canSeeFinancials = can(user.permissions, 'finance:read');
  const { id } = await params;
  const db = await getDb();

  const [row] = await db
    .select({
      product: t.products,
      customerName: t.customers.name,
      materialName: t.materials.name,
      materialCostCentsPerKg: t.materials.costCentsPerKg,
      moldReference: t.molds.reference,
      moldCavities: t.molds.cavities,
      moldChangeoverMinutes: t.molds.changeoverMinutes,
      moldLocation: t.molds.location,
    })
    .from(t.products)
    .leftJoin(t.customers, eq(t.products.customerId, t.customers.id))
    .leftJoin(t.materials, eq(t.products.materialId, t.materials.id))
    .leftJoin(t.molds, eq(t.products.moldId, t.molds.id))
    .where(eq(t.products.id, id))
    .limit(1);

  if (!row) notFound();
  const product = row.product;

  const [machines, costModelRows, producedRows, orderRows] = await Promise.all([
    db
      .select({
        machineId: t.machines.id,
        machineName: t.machines.name,
        machineStatus: t.machines.status,
        unitsPerHour: t.productMachines.unitsPerHour,
        isPreferred: t.productMachines.isPreferred,
      })
      .from(t.productMachines)
      .innerJoin(t.machines, eq(t.productMachines.machineId, t.machines.id))
      .where(eq(t.productMachines.productId, id)),
    db.select().from(t.costModels).where(eq(t.costModels.isDefault, true)).limit(1),
    db
      .select({
        produced: sql<number>`coalesce(sum(${t.productionOrders.producedUnits}), 0)::int`,
        rejected: sql<number>`coalesce(sum(${t.productionOrders.rejectedUnits}), 0)::int`,
      })
      .from(t.productionOrders)
      .where(eq(t.productionOrders.productId, id)),
    db
      .select({
        id: t.customerOrders.id,
        number: t.customerOrders.number,
        status: t.customerOrders.status,
        dueAt: t.customerOrders.dueAt,
        quantityUnits: t.orderLines.quantityUnits,
        customerName: t.customers.name,
      })
      .from(t.orderLines)
      .innerJoin(t.customerOrders, eq(t.orderLines.orderId, t.customerOrders.id))
      .innerJoin(t.customers, eq(t.customerOrders.customerId, t.customers.id))
      .where(eq(t.orderLines.productId, id))
      .orderBy(desc(t.customerOrders.orderedAt))
      .limit(8),
  ]);

  const costModel = costModelRows[0];
  const preferredMachine = machines.find((machine) => machine.isPreferred) ?? machines[0];

  const [machineRow] = preferredMachine
    ? await db
        .select({ hourlyCostCents: t.machines.hourlyCostCents })
        .from(t.machines)
        .where(eq(t.machines.id, preferredMachine.machineId))
        .limit(1)
    : [undefined];

  const produced = producedRows[0]?.produced ?? 0;
  const rejected = producedRows[0]?.rejected ?? 0;
  const scrapRate = produced + rejected > 0 ? rejected / (produced + rejected) : 0;

  const breakdown =
    costModel && machineRow
      ? computeUnitCost({
          weightGrams: product.weightGrams,
          materialCostCentsPerKg: row.materialCostCentsPerKg ?? 0,
          cycleTimeSeconds: product.cycleTimeSeconds,
          cavities: row.moldCavities ?? 1,
          machineHourlyCostCents: machineRow.hourlyCostCents,
          laborHourlyCostCents: costModel.laborCentsPerHour,
          overheadHourlyCostCents: costModel.overheadCentsPerHour,
          consumablesHourlyCostCents: costModel.consumablesCentsPerHour,
          scrapRate,
        })
      : null;

  const profitability = computeProfitability(product.unitCostCents, product.unitPriceCents, produced);

  return (
    <div className="mx-auto max-w-[1300px]">
      <Link
        href="/catalogue"
        className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Retour au catalogue
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.375rem] leading-7 font-semibold tracking-tight text-fg">
            {product.name}
          </h1>
          <Badge tone="outline">{product.reference}</Badge>
          <Badge>{product.family}</Badge>
          {product.isActive ? <Badge tone="brand">Active</Badge> : null}
        </div>
        {product.description ? (
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">{product.description}</p>
        ) : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <Card>
            <CardHeader title="Caractéristiques" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 pb-5 sm:grid-cols-3">
              {[
                ['Client', row.customerName ?? '—'],
                ['Matière', row.materialName ?? '—'],
                ['Moule', row.moldReference ?? '—'],
                ['Poids', `${(product.weightGrams / 1000).toLocaleString('fr-FR')} kg`],
                ['Dimensions', product.dimensionsMm ?? '—'],
                ['Temps de cycle', `${product.cycleTimeSeconds} s`],
                ['Empreintes', String(row.moldCavities ?? 1)],
                ['Pièces / palette', formatNumber(product.unitsPerPallet)],
                [
                  'Changement de moule',
                  row.moldChangeoverMinutes
                    ? `${Math.round((row.moldChangeoverMinutes / 60) * 10) / 10} h`
                    : '—',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.75rem] text-fg-subtle">{label}</dt>
                  <dd className="mt-0.5 text-[0.875rem] font-medium text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Machines compatibles"
              subtitle="Détermine où cette pièce peut être planifiée (§19)"
            />
            <Table>
              <thead>
                <tr>
                  <Th>Machine</Th>
                  <Th>État</Th>
                  <Th numeric>Cadence</Th>
                  <Th numeric>8 h de production</Th>
                </tr>
              </thead>
              <tbody>
                {machines.map((machine) => (
                  <Tr key={machine.machineId}>
                    <Td>
                      <Link href={`/machines/${machine.machineId}`} className="font-medium hover:text-brand">
                        {machine.machineName}
                      </Link>
                      {machine.isPreferred ? (
                        <Badge tone="brand" className="ml-2">
                          Préférée
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-fg-muted">
                      {machine.machineStatus === 'stopped' || machine.machineStatus === 'fault' ? (
                        <span className="text-critical">Indisponible</span>
                      ) : (
                        'Disponible'
                      )}
                    </Td>
                    <Td numeric>{machine.unitsPerHour} p/h</Td>
                    <Td numeric className="text-fg-muted">
                      {formatNumber(Math.round(machine.unitsPerHour * 8))} pièces
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Commandes liées" />
            <Table>
              <thead>
                <tr>
                  <Th>Commande</Th>
                  <Th>Client</Th>
                  <Th numeric>Quantité</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((order) => (
                  <Tr key={`${order.id}-${order.number}`}>
                    <Td className="font-medium">
                      <Link href={`/commandes/${order.id}`} className="hover:text-brand">
                        #{order.number}
                      </Link>
                    </Td>
                    <Td className="text-fg-muted">{order.customerName}</Td>
                    <Td numeric>{formatNumber(order.quantityUnits)}</Td>
                    <Td className="text-fg-muted">{order.status}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-5">
          {canSeeFinancials && breakdown ? (
            <Card>
              <CardHeader
                title="Prix de revient"
                subtitle="Calculé par le domaine, pas saisi à la main"
                action={<DataOrigin origin="computed" />}
              />
              <ul className="space-y-2 px-5 pb-3">
                {[
                  ['Matière', breakdown.materialCents],
                  ['Machine', breakdown.machineCents],
                  ['Main-d’œuvre', breakdown.laborCents],
                  ['Frais généraux', breakdown.overheadCents],
                  ['Consommables', breakdown.consumablesCents],
                  ['Rebuts reportés', breakdown.scrapCents],
                ].map(([label, value]) => (
                  <li key={label as string} className="flex justify-between text-[0.8125rem]">
                    <span className="text-fg-muted">{label}</span>
                    <span className="tabular font-medium text-fg">
                      {formatCentsPrecise(value as number)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-line px-5 py-3">
                <span className="text-[0.875rem] font-medium text-fg">Coût unitaire</span>
                <span className="tabular text-[0.875rem] font-semibold text-fg">
                  {formatCentsPrecise(breakdown.totalCents)}
                </span>
              </div>
            </Card>
          ) : null}

          {canSeeFinancials ? (
            <Card>
              <CardHeader title="Rentabilité" subtitle="((prix − coût) / coût) × 100" />
              <div className="space-y-3 px-5 pb-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.8125rem] text-fg-muted">Prix de vente</span>
                  <span className="tabular font-medium text-fg">
                    {formatCentsPrecise(product.unitPriceCents)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.8125rem] text-fg-muted">Coût de revient</span>
                  <span className="tabular font-medium text-fg">
                    {formatCentsPrecise(product.unitCostCents)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-3">
                  <span className="text-[0.8125rem] text-fg-muted">Marge unitaire</span>
                  <span className="tabular font-semibold text-normal">
                    {formatCentsPrecise(profitability.unitMarginCents)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.8125rem] text-fg-muted">Rentabilité sur coût</span>
                  <span
                    className={cn(
                      'tabular text-[1.25rem] font-semibold',
                      profitability.returnOnCostPct >= 60
                        ? 'text-normal'
                        : profitability.returnOnCostPct >= 30
                          ? 'text-info'
                          : 'text-warning',
                    )}
                  >
                    {formatPercent(profitability.returnOnCostPct, 1)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.8125rem] text-fg-muted">
                    Contribution ({formatNumber(produced)} pièces produites)
                  </span>
                  <span className="tabular font-medium text-fg">
                    {formatCents(profitability.contributionCents)}
                  </span>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Statistiques de production" />
            <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
              <div>
                <dt className="text-[0.75rem] text-fg-subtle">Pièces produites</dt>
                <dd className="tabular mt-0.5 text-[1.25rem] font-semibold text-fg">
                  {formatNumber(produced)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.75rem] text-fg-subtle">Rebuts</dt>
                <dd className="tabular mt-0.5 text-[1.25rem] font-semibold text-warning">
                  {formatNumber(rejected)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.75rem] text-fg-subtle">Taux de rebut</dt>
                <dd className="tabular mt-0.5 text-[1.25rem] font-semibold text-fg">
                  {formatPercent(scrapRate * 100, 1)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.75rem] text-fg-subtle">Emplacement moule</dt>
                <dd className="mt-0.5 text-[0.875rem] font-medium text-fg">
                  {row.moldLocation ?? '—'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
