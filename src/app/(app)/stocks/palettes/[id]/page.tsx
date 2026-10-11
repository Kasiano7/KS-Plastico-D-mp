import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { canCancelPallet } from '@/server/domain/pallets';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { PageHeader, Card, CardHeader, StatusBadge, Table, Td, Th, Tr } from '@/components/ui/primitives';
import { PalletQrDialog } from '@/components/factory/pallet-qr-dialog';
import { PalletCancelDialog } from '@/components/factory/pallet-cancel-dialog';
import { PalletLabelPrint } from '@/components/factory/pallet-label-print';
import { PrintButton } from '@/components/reports/report-actions';
import { formatDateTime, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Palette' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'En cours',
  completed: 'Terminée',
  in_stock: 'En stock',
  allocated: 'Allouée',
  shipped: 'Expédiée',
  cancelled: 'Annulée',
};

const STATUS_SEVERITY: Record<string, 'normal' | 'info' | 'warning' | 'critical'> = {
  in_progress: 'info',
  completed: 'normal',
  in_stock: 'normal',
  allocated: 'info',
  shipped: 'normal',
  cancelled: 'critical',
};

const MOVEMENT_LABELS: Record<string, string> = {
  inbound: 'Entrée',
  outbound: 'Sortie',
  transfer: 'Transfert',
  consumption: 'Consommation',
  adjustment: 'Ajustement',
  production_output: 'Production',
};

export default async function PalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('inventory:read');
  const canCancel = can(user.permissions, 'production:write') || can(user.permissions, 'workstation:use');
  const db = await getDb();

  const [pallet] = await db
    .select({
      id: t.pallets.id,
      code: t.pallets.code,
      status: t.pallets.status,
      quantityUnits: t.pallets.quantityUnits,
      lotNumber: t.pallets.lotNumber,
      location: t.pallets.location,
      completedAt: t.pallets.completedAt,
      createdAt: t.pallets.createdAt,
      productId: t.products.id,
      productReference: t.products.reference,
      productName: t.products.name,
      customerOrderId: t.customerOrders.id,
      customerOrderNumber: t.customerOrders.number,
      productionOrderId: t.productionOrders.id,
      productionOrderNumber: t.productionOrders.number,
      machineId: t.machines.id,
      machineName: t.machines.name,
    })
    .from(t.pallets)
    .innerJoin(t.products, eq(t.pallets.productId, t.products.id))
    .leftJoin(t.customerOrders, eq(t.pallets.customerOrderId, t.customerOrders.id))
    .leftJoin(t.productionOrders, eq(t.pallets.productionOrderId, t.productionOrders.id))
    .leftJoin(t.machines, eq(t.pallets.machineId, t.machines.id))
    .where(eq(t.pallets.id, id))
    .limit(1);

  if (!pallet) notFound();

  const movements = await db
    .select({
      id: t.inventoryMovements.id,
      type: t.inventoryMovements.type,
      quantity: t.inventoryMovements.quantity,
      quantityAfter: t.inventoryMovements.quantityAfter,
      note: t.inventoryMovements.note,
      occurredAt: t.inventoryMovements.occurredAt,
      itemName: t.inventoryItems.name,
    })
    .from(t.inventoryMovements)
    .innerJoin(t.inventoryItems, eq(t.inventoryMovements.itemId, t.inventoryItems.id))
    .where(eq(t.inventoryMovements.reference, pallet.code))
    .orderBy(desc(t.inventoryMovements.occurredAt));

  const qrDataUrl = await QRCode.toDataURL(
    JSON.stringify({ p: pallet.code, l: pallet.lotNumber, q: pallet.quantityUnits }),
    { margin: 1, width: 220, color: { dark: '#0e2a47', light: '#ffffff' } },
  );

  return (
    <>
      <div className="mx-auto max-w-[1000px] print:hidden">
        <PageHeader
          title={pallet.code}
          description={`${pallet.productName} — ${formatNumber(pallet.quantityUnits)} pièces`}
          action={
            <div className="flex items-center gap-2">
              <StatusBadge severity={STATUS_SEVERITY[pallet.status] ?? 'info'}>
                {STATUS_LABELS[pallet.status] ?? pallet.status}
              </StatusBadge>
              <PrintButton label="Étiquette" title={`Imprimer l'étiquette de la palette ${pallet.code}`} />
              <PalletQrDialog palletCode={pallet.code} lotNumber={pallet.lotNumber} qrDataUrl={qrDataUrl} />
              {canCancel && canCancelPallet(pallet.status) ? (
                <PalletCancelDialog palletId={pallet.id} palletCode={pallet.code} />
              ) : null}
            </div>
          }
        />

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader title="Identité" subtitle="Origine et localisation de la palette" />
            <dl className="grid grid-cols-2 gap-3 px-5 pb-5 text-[0.8125rem]">
              <div>
                <dt className="text-fg-subtle">Référence produit</dt>
                <dd className="font-medium text-fg">{pallet.productReference}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Produit</dt>
                <dd className="font-medium text-fg">{pallet.productName}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Lot</dt>
                <dd className="font-mono text-xs text-fg">{pallet.lotNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Emplacement</dt>
                <dd className="font-medium text-fg">{pallet.location ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Quantité</dt>
                <dd className="tabular font-medium text-fg">{formatNumber(pallet.quantityUnits)} unités</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Terminée le</dt>
                <dd className="font-medium text-fg">
                  {pallet.completedAt ? formatDateTime(pallet.completedAt) : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Traçabilité" subtitle="D'où vient cette palette" />
            <dl className="grid grid-cols-1 gap-3 px-5 pb-5 text-[0.8125rem]">
              <div>
                <dt className="text-fg-subtle">Commande client</dt>
                <dd className="font-medium text-fg">
                  {pallet.customerOrderId ? (
                    <Link href={`/commandes/${pallet.customerOrderId}`} className="text-brand hover:underline">
                      {pallet.customerOrderNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Ordre de fabrication</dt>
                <dd className="font-medium text-fg">{pallet.productionOrderNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Machine</dt>
                <dd className="font-medium text-fg">
                  {pallet.machineId ? (
                    <Link href={`/machines/${pallet.machineId}`} className="text-brand hover:underline">
                      {pallet.machineName}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Créée le</dt>
                <dd className="font-medium text-fg">{formatDateTime(pallet.createdAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader
            title="Mouvements de stock associés"
            subtitle="Chaque entrée et sortie liée au code de cette palette"
          />
          {movements.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-muted">Aucun mouvement enregistré.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Article</Th>
                  <Th>Type</Th>
                  <Th numeric>Quantité</Th>
                  <Th>Note</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <Tr key={movement.id}>
                    <Td className="max-w-[180px] truncate">{movement.itemName}</Td>
                    <Td className="text-fg-muted">{MOVEMENT_LABELS[movement.type] ?? movement.type}</Td>
                    <Td numeric className="font-medium">
                      {movement.quantity > 0 ? '+' : ''}
                      {formatNumber(movement.quantity)}
                    </Td>
                    <Td className="max-w-[240px] truncate text-xs text-fg-subtle">{movement.note ?? '—'}</Td>
                    <Td className="text-xs text-fg-subtle">{formatDateTime(movement.occurredAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <PalletLabelPrint
        palletCode={pallet.code}
        productReference={pallet.productReference}
        productName={pallet.productName}
        lotNumber={pallet.lotNumber}
        quantityUnits={pallet.quantityUnits}
        customerOrderNumber={pallet.customerOrderNumber}
        qrDataUrl={qrDataUrl}
      />
    </>
  );
}
