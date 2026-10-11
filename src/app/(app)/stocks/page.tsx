import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { getFactoryContext } from '@/server/services/factory-context';
import { projectStock, suggestPurchase } from '@/server/domain/inventory';
import {
  Card,
  CardHeader,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { AttentionBar } from '@/components/factory/attention-bar';
import type { AttentionItem } from '@/server/domain/attention';
import { cn } from '@/lib/cn';
import { formatCents, formatDateTime, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Stocks' };
export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  finished_good: 'Produits finis',
  raw_material: 'Matières',
  pallet: 'Palettes',
  crate: 'Caisses',
  component: 'Composants',
  consumable: 'Consommables',
  tooling: 'Outillage',
  spare_part: 'Pièces détachées',
};

export default async function InventoryPage() {
  await requirePermission('inventory:read');
  const db = await getDb();
  const context = await getFactoryContext();

  const [movements, requirements, rawItems] = await Promise.all([
    db
      .select({
        id: t.inventoryMovements.id,
        type: t.inventoryMovements.type,
        quantity: t.inventoryMovements.quantity,
        quantityAfter: t.inventoryMovements.quantityAfter,
        reference: t.inventoryMovements.reference,
        note: t.inventoryMovements.note,
        occurredAt: t.inventoryMovements.occurredAt,
        itemName: t.inventoryItems.name,
        itemUnit: t.inventoryItems.unit,
      })
      .from(t.inventoryMovements)
      .innerJoin(t.inventoryItems, eq(t.inventoryMovements.itemId, t.inventoryItems.id))
      .orderBy(desc(t.inventoryMovements.occurredAt))
      .limit(15),
    db
      .select({
        id: t.purchaseRequirements.id,
        severity: t.purchaseRequirements.severity,
        requiredQuantity: t.purchaseRequirements.requiredQuantity,
        recommendedQuantity: t.purchaseRequirements.recommendedQuantity,
        orderByAt: t.purchaseRequirements.orderByAt,
        reason: t.purchaseRequirements.reason,
        itemName: t.inventoryItems.name,
        itemUnit: t.inventoryItems.unit,
        supplierName: t.suppliers.name,
        leadTimeDays: t.suppliers.leadTimeDays,
      })
      .from(t.purchaseRequirements)
      .innerJoin(t.inventoryItems, eq(t.purchaseRequirements.itemId, t.inventoryItems.id))
      .leftJoin(t.suppliers, eq(t.purchaseRequirements.supplierId, t.suppliers.id))
      .orderBy(t.purchaseRequirements.orderByAt),
    db.select().from(t.inventoryItems),
  ]);

  const byKind = Object.entries(
    context.inventory.reduce<Record<string, typeof context.inventory>>((acc, item) => {
      (acc[item.kind] ??= []).push(item);
      return acc;
    }, {}),
  );

  // Projection détaillée pour l'article le plus critique — l'exemple du §27.
  const focus = [...context.inventory]
    .filter((item) => item.shortageInDays !== null)
    .sort((a, b) => (a.shortageInDays ?? 99) - (b.shortageInDays ?? 99))[0];
  const focusRow = focus ? rawItems.find((row) => row.id === focus.id) : undefined;

  const projection = focusRow
    ? projectStock({
        level: focusRow,
        averageDailyConsumption: focusRow.averageDailyConsumption,
        horizonDays: 5,
      })
    : null;

  const suggestion =
    projection && focusRow
      ? suggestPurchase(projection, {
          averageDailyConsumption: focusRow.averageDailyConsumption,
          supplierLeadTimeDays: 2,
          packSize: 100,
          coverageTargetDays: 7,
        })
      : null;

  const totalValueCents = rawItems.reduce(
    (total, item) => total + item.quantityOnHand * item.unitCostCents,
    0,
  );

  /*
   * La bande d'attention ne calcule rien : elle relit la sévérité déjà portée
   * par chaque article et la formule en une phrase. Les articles sont triés
   * par couverture croissante — le plus près de la rupture d'abord.
   */
  const attention: AttentionItem[] = [...context.inventory]
    .sort((a, b) => a.coverageDays - b.coverageDays)
    .map((entry) => ({
      id: entry.id,
      severity: entry.severity,
      title: entry.name,
      detail:
        entry.shortageInDays !== null
          ? `Rupture estimée dans ${entry.shortageInDays} jour${entry.shortageInDays > 1 ? 's' : ''} — ${formatNumber(entry.available)} ${entry.unit} disponibles`
          : `${formatNumber(entry.available)} ${entry.unit} disponibles, sous le point de commande de ${formatNumber(entry.reorderPoint)}`,
    }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Stocks"
        description="Stock physique, quantités réservées et projection de rupture — produits finis, matières, palettes, caisses, consommables et pièces détachées."
      />

      <AttentionBar items={attention} className="mb-6" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Articles suivis</p>
          <p className="tabular mt-2 text-[1.75rem] leading-none font-semibold text-fg">
            {context.inventory.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Sous le point de commande</p>
          <p className={cn('tabular mt-2 text-[1.75rem] leading-none font-semibold', SEVERITY_TEXT.warning)}>
            {context.inventory.filter((item) => item.quantityOnHand <= item.reorderPoint).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Ruptures projetées (72 h)</p>
          <p className={cn('tabular mt-2 text-[1.75rem] leading-none font-semibold', SEVERITY_TEXT.critical)}>
            {context.inventory.filter((item) => item.shortageInDays !== null && item.shortageInDays <= 3).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Valeur du stock</p>
          <p className="tabular mt-2 text-[1.75rem] leading-none font-semibold text-fg">
            {formatCents(totalValueCents)}
          </p>
        </Card>
      </div>

      {projection && focus && focusRow ? (
        <Card className="mb-6">
          <CardHeader
            title={`Stock prédictif — ${focus.name}`}
            subtitle={`Stock actuel + entrées prévues − consommation prévue − réservations − stock de sécurité`}
          />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {projection.days.map((day) => (
                <div
                  key={day.dayOffset}
                  className={cn(
                    'rounded-[var(--radius-control)] border p-3 text-center',
                    day.isShortage ? 'border-critical/35 bg-critical-soft' : 'border-line bg-surface-sunken',
                  )}
                >
                  <p className="text-[0.6875rem] text-fg-subtle">
                    {day.dayOffset === 0
                      ? "Aujourd'hui"
                      : day.dayOffset === 1
                        ? 'Demain'
                        : `J+${day.dayOffset}`}
                  </p>
                  <p
                    className={cn(
                      'tabular mt-1 text-[1.125rem] font-semibold',
                      day.isShortage ? 'text-critical' : 'text-fg',
                    )}
                  >
                    {formatNumber(Math.max(day.projectedOnHand, 0))}
                  </p>
                  {day.isShortage ? (
                    <p className="mt-0.5 text-[0.625rem] font-medium text-critical">Rupture</p>
                  ) : null}
                </div>
              ))}
            </div>

            {suggestion ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-4 py-3 text-[0.8125rem]">
                <span className="text-fg">
                  Besoin supplémentaire{' '}
                  <span className="tabular font-semibold">
                    {formatNumber(suggestion.requiredQuantity)} {focus.unit}
                  </span>
                </span>
                <span className="text-fg">
                  Commande recommandée{' '}
                  <span className="tabular font-semibold">
                    {formatNumber(suggestion.recommendedQuantity)} {focus.unit}
                  </span>
                </span>
                <span className="text-fg">
                  Date limite{' '}
                  <span className="font-semibold">
                    {suggestion.orderByInDays === 0
                      ? "aujourd'hui"
                      : suggestion.orderByInDays === 1
                        ? 'demain 12 h'
                        : `dans ${suggestion.orderByInDays} jours`}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="space-y-5">
        {byKind.map(([kind, items]) => (
          <Card key={kind}>
            <CardHeader title={KIND_LABELS[kind] ?? kind} subtitle={`${items.length} article(s)`} />
            <Table>
              <thead>
                <tr>
                  <Th>Article</Th>
                  <Th>Référence</Th>
                  <Th numeric>Physique</Th>
                  <Th numeric>Réservé</Th>
                  <Th numeric>Disponible</Th>
                  <Th numeric>Conso./jour</Th>
                  <Th numeric>Couverture</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Tr key={item.id}>
                    <Td className="font-medium">{item.name}</Td>
                    <Td className="font-mono text-xs text-fg-subtle">{item.sku}</Td>
                    <Td numeric>{formatNumber(item.quantityOnHand)}</Td>
                    <Td numeric className="text-fg-muted">
                      {formatNumber(item.quantityReserved)}
                    </Td>
                    <Td numeric className="font-medium">{formatNumber(item.available)}</Td>
                    <Td numeric className="text-fg-muted">
                      {item.averageDailyConsumption > 0
                        ? formatNumber(item.averageDailyConsumption)
                        : '—'}
                    </Td>
                    <Td numeric className="text-fg-muted">
                      {item.coverageDays >= 999 ? '—' : `${item.coverageDays} j`}
                    </Td>
                    <Td>
                      <StatusBadge severity={item.severity} size="sm">
                        {item.shortageInDays !== null
                          ? `Rupture J+${item.shortageInDays}`
                          : item.quantityOnHand <= item.reorderPoint
                            ? 'Sous seuil'
                            : 'Normal'}
                      </StatusBadge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Besoins d’approvisionnement"
            subtitle="Propositions calculées — aucun achat n’est déclenché automatiquement"
          />
          {requirements.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-muted">Aucun besoin détecté.</p>
          ) : (
            <ul className="space-y-3 px-5 pb-5">
              {requirements.map((requirement) => (
                <li
                  key={requirement.id}
                  className="rounded-[var(--radius-control)] border border-line p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge severity={requirement.severity} size="sm">
                      {requirement.itemName}
                    </StatusBadge>
                    <span className="ml-auto text-xs text-fg-subtle">
                      Commander avant le {formatDateTime(requirement.orderByAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.8125rem] text-fg">
                    Besoin{' '}
                    <span className="tabular font-semibold">
                      {formatNumber(requirement.requiredQuantity)}
                    </span>{' '}
                    · recommandé{' '}
                    <span className="tabular font-semibold">
                      {formatNumber(requirement.recommendedQuantity)}
                    </span>{' '}
                    {requirement.itemUnit}
                  </p>
                  {requirement.reason ? (
                    <p className="mt-1 text-xs text-fg-muted">{requirement.reason}</p>
                  ) : null}
                  {requirement.supplierName ? (
                    <p className="mt-1 text-xs text-fg-subtle">
                      {requirement.supplierName} · délai {requirement.leadTimeDays} jours
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Derniers mouvements" subtitle="Toute entrée et sortie est historisée" />
          <Table>
            <thead>
              <tr>
                <Th>Article</Th>
                <Th>Type</Th>
                <Th numeric>Quantité</Th>
                <Th>Référence</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <Tr key={movement.id}>
                  <Td className="max-w-[180px] truncate">{movement.itemName}</Td>
                  <Td className="text-fg-muted">{MOVEMENT_LABELS[movement.type] ?? movement.type}</Td>
                  <Td
                    className={cn(
                      'tabular text-right font-medium',
                      movement.quantity > 0
                        ? 'text-normal'
                        : movement.quantity < 0
                          ? 'text-warning'
                          : 'text-fg-muted',
                    )}
                  >
                    {movement.quantity > 0 ? '+' : ''}
                    {formatNumber(movement.quantity)}
                  </Td>
                  <Td className="text-xs text-fg-subtle">{movement.reference ?? '—'}</Td>
                  <Td className="text-xs text-fg-subtle">{formatDateTime(movement.occurredAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

const MOVEMENT_LABELS: Record<string, string> = {
  inbound: 'Entrée',
  outbound: 'Sortie',
  transfer: 'Transfert',
  consumption: 'Consommation',
  adjustment: 'Ajustement',
  production_output: 'Production',
};
