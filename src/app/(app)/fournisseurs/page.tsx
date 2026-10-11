import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import {
  Card,
  CardHeader,
  PageHeader,
  Progress,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { formatDateTime, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Fournisseurs' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  await requirePermission('suppliers:read');
  const db = await getDb();

  const [suppliers, items, requirements] = await Promise.all([
    db.select().from(t.suppliers).orderBy(t.suppliers.name),
    db
      .select({
        id: t.inventoryItems.id,
        name: t.inventoryItems.name,
        sku: t.inventoryItems.sku,
        supplierId: t.inventoryItems.supplierId,
        quantityOnHand: t.inventoryItems.quantityOnHand,
        reorderPoint: t.inventoryItems.reorderPoint,
        unit: t.inventoryItems.unit,
      })
      .from(t.inventoryItems),
    db
      .select({
        id: t.purchaseRequirements.id,
        supplierId: t.purchaseRequirements.supplierId,
        severity: t.purchaseRequirements.severity,
        recommendedQuantity: t.purchaseRequirements.recommendedQuantity,
        orderByAt: t.purchaseRequirements.orderByAt,
        itemName: t.inventoryItems.name,
        itemUnit: t.inventoryItems.unit,
      })
      .from(t.purchaseRequirements)
      .innerJoin(t.inventoryItems, eq(t.purchaseRequirements.itemId, t.inventoryItems.id)),
  ]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Fournisseurs"
        description="Délais, fiabilité et besoins d’approvisionnement en cours. Les délais alimentent directement le stock prédictif."
      />

      <div className="space-y-5">
        {suppliers.map((supplier) => {
          const supplierItems = items.filter((item) => item.supplierId === supplier.id);
          const supplierRequirements = requirements.filter(
            (requirement) => requirement.supplierId === supplier.id,
          );

          return (
            <Card key={supplier.id}>
              <CardHeader
                title={supplier.name}
                subtitle={`${supplier.category ?? 'Non catégorisé'} · délai ${supplier.leadTimeDays} jours · ${supplier.contactEmail ?? 'contact non renseigné'}`}
                action={
                  <div className="w-32">
                    <p className="mb-1 text-right text-[0.6875rem] text-fg-subtle">
                      Fiabilité {supplier.reliabilityPct} %
                    </p>
                    <Progress
                      value={supplier.reliabilityPct}
                      severity={
                        supplier.reliabilityPct >= 95
                          ? 'normal'
                          : supplier.reliabilityPct >= 90
                            ? 'info'
                            : 'warning'
                      }
                      label={`Fiabilité ${supplier.name}`}
                    />
                  </div>
                }
              />

              {supplierRequirements.length > 0 ? (
                <ul className="space-y-2 px-5 pb-3">
                  {supplierRequirements.map((requirement) => (
                    <li
                      key={requirement.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-3.5 py-2 text-[0.8125rem]"
                    >
                      <StatusBadge severity={requirement.severity} size="sm">
                        À commander
                      </StatusBadge>
                      <span className="text-fg">
                        {formatNumber(requirement.recommendedQuantity)} {requirement.itemUnit} —{' '}
                        {requirement.itemName}
                      </span>
                      <span className="ml-auto text-xs text-fg-muted">
                        avant le {formatDateTime(requirement.orderByAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {supplierItems.length > 0 ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Article</Th>
                      <Th>Référence</Th>
                      <Th numeric>Stock</Th>
                      <Th numeric>Point de commande</Th>
                      <Th>État</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierItems.map((item) => (
                      <Tr key={item.id}>
                        <Td className="font-medium">{item.name}</Td>
                        <Td className="font-mono text-xs text-fg-subtle">{item.sku}</Td>
                        <Td numeric>
                          {formatNumber(item.quantityOnHand)} {item.unit}
                        </Td>
                        <Td numeric className="text-fg-muted">
                          {formatNumber(item.reorderPoint)}
                        </Td>
                        <Td>
                          <StatusBadge
                            severity={item.quantityOnHand <= item.reorderPoint ? 'warning' : 'normal'}
                            size="sm"
                          >
                            {item.quantityOnHand <= item.reorderPoint ? 'Sous seuil' : 'Normal'}
                          </StatusBadge>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="px-5 pb-5 text-sm text-fg-muted">Aucun article rattaché.</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
