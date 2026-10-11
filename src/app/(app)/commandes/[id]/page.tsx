import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getOrderDetail } from '@/server/services/orders';
import { listAuditLogsForEntity } from '@/server/services/audit';
import {
  Badge,
  Card,
  CardHeader,
  DataOrigin,
  Progress,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
  buttonClass,
} from '@/components/ui/primitives';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatDueDelta,
  formatNumber,
  formatPercent,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const order = await getOrderDetail((await params).id);
  return { title: order ? `Commande #${order.number}` : 'Commande' };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  confirmed: 'Confirmée',
  in_production: 'En production',
  ready: 'Prête',
  shipped: 'Expédiée',
  cancelled: 'Annulée',
};

const CHECK_ICONS = { ok: '✅', warning: '⚠️', blocked: '❌' } as const;

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('orders:read');
  const canWrite = can(user.permissions, 'orders:write');
  const order = await getOrderDetail((await params).id);
  if (!order) notFound();

  const canSeeFinancials = can(user.permissions, 'finance:read');
  const auditLogs = can(user.permissions, 'history:read')
    ? await listAuditLogsForEntity('customer_order', order.id)
    : [];

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/commandes"
        className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Toutes les commandes
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[1.375rem] leading-7 font-semibold tracking-tight text-fg">
              Commande #{order.number}
            </h1>
            <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
            {order.status !== 'shipped' && order.status !== 'ready' ? (
              <StatusBadge severity={order.severity}>
                Risque de retard {order.risk.riskPct} %
              </StatusBadge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {order.customerName} · commandée le {formatDate(order.orderedAt)} · échéance{' '}
            {formatDate(order.dueAt)} ({formatDueDelta(order.dueAt)})
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Link href={`/commandes/${order.id}/bon-de-livraison`} className={buttonClass('secondary', 'md')}>
            Bon de livraison
          </Link>

          {canWrite && order.status !== 'shipped' && order.status !== 'cancelled' ? (
            <Link href={`/commandes/${order.id}/modifier`} className={buttonClass('secondary', 'md')}>
              Modifier
            </Link>
          ) : null}

          {canSeeFinancials ? (
            <div className="text-right">
              <p className="text-[0.75rem] text-fg-subtle">Valeur de la commande</p>
              <p className="tabular text-[1.375rem] font-semibold text-fg">
                {formatCents(order.valueCents)}
              </p>
              <p className="text-[0.75rem] text-fg-muted">
                marge estimée {formatCents(order.marginCents)}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <Card>
            <CardHeader
              title="Avancement"
              subtitle="Stock réservé et production déclarée, palette par palette"
            />
            <div className="px-5 pb-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="tabular text-[2.25rem] leading-none font-semibold text-fg">
                    {order.progress.palletsReady}{' '}
                    <span className="text-[1.25rem] text-fg-subtle">
                      / {order.progress.palletsRequired}
                    </span>
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-fg-muted">palettes prêtes</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-[1.5rem] leading-none font-semibold text-fg">
                    {formatPercent(order.progress.progressPct)}
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-fg-muted">
                    {formatNumber(order.progress.coveredUnits)} /{' '}
                    {formatNumber(order.progress.quantityUnits)} pièces
                  </p>
                </div>
              </div>

              <Progress
                value={order.progress.progressPct}
                severity={order.progress.isComplete ? 'normal' : order.severity}
                className="mt-4 h-2"
                label="Avancement de la commande"
              />

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Quantité commandée', formatNumber(order.progress.quantityUnits)],
                  ['Couvert par le stock', formatNumber(order.lines.reduce((sum, line) => sum + line.reservedUnits, 0))],
                  ['Produit', formatNumber(order.lines.reduce((sum, line) => sum + line.producedUnits, 0))],
                  ['Reste à produire', formatNumber(order.progress.remainingUnits)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[0.75rem] text-fg-subtle">{label}</dt>
                    <dd className="tabular mt-0.5 text-[1rem] font-semibold text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Lignes de commande" />
            <Table>
              <thead>
                <tr>
                  <Th>Pièce</Th>
                  <Th numeric>Quantité</Th>
                  <Th numeric>Réservé</Th>
                  <Th numeric>Produit</Th>
                  <Th numeric>Palettes</Th>
                  {canSeeFinancials ? <Th numeric>Prix unitaire</Th> : null}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <Tr key={line.id}>
                    <Td>
                      <Link href={`/catalogue/${line.productId}`} className="font-medium hover:text-brand">
                        {line.productName}
                      </Link>
                      <span className="block text-xs text-fg-subtle">{line.productReference}</span>
                    </Td>
                    <Td numeric>{formatNumber(line.quantityUnits)}</Td>
                    <Td className="tabular text-right text-normal">{formatNumber(line.reservedUnits)}</Td>
                    <Td numeric>{formatNumber(line.producedUnits)}</Td>
                    <Td numeric className="text-fg-muted">
                      {Math.ceil(line.quantityUnits / line.unitsPerPallet)} × {line.unitsPerPallet}
                    </Td>
                    {canSeeFinancials ? (
                      <Td numeric>{formatCents(line.unitPriceCents)}</Td>
                    ) : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader
              title="Ordres de fabrication"
              subtitle="Ce qui est planifié en atelier pour cette commande"
            />
            {order.productionOrders.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-fg-muted">Aucun ordre de fabrication planifié.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Ordre</Th>
                    <Th>Machine</Th>
                    <Th>Créneau</Th>
                    <Th numeric>Quantité</Th>
                    <Th className="w-[140px]">Avancement</Th>
                  </tr>
                </thead>
                <tbody>
                  {order.productionOrders.map((productionOrder) => (
                    <Tr key={productionOrder.id}>
                      <Td className="font-medium">{productionOrder.number}</Td>
                      <Td className="text-fg-muted">
                        {productionOrder.machineId && productionOrder.machineName ? (
                          <Link
                            href={`/machines/${productionOrder.machineId}`}
                            className="hover:text-brand"
                          >
                            {productionOrder.machineName}
                          </Link>
                        ) : (
                          'Non affecté'
                        )}
                        {productionOrder.machineStatus === 'stopped' ||
                        productionOrder.machineStatus === 'fault' ? (
                          <span className="ml-2 text-xs text-critical">machine à l’arrêt</span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-fg-muted">
                        {formatDateTime(productionOrder.plannedStartAt)} →{' '}
                        {formatDateTime(productionOrder.plannedEndAt)}
                      </Td>
                      <Td numeric>
                        {formatNumber(productionOrder.quantityUnits)}
                      </Td>
                      <Td>
                        <span className="tabular mb-1 block text-xs">
                          {formatNumber(productionOrder.producedUnits)}
                        </span>
                        <Progress
                          value={
                            (productionOrder.producedUnits /
                              Math.max(productionOrder.quantityUnits, 1)) *
                            100
                          }
                          severity={productionOrder.status === 'paused' ? 'warning' : 'normal'}
                          label={`Avancement ${productionOrder.number}`}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Palettes tracées"
              subtitle="Chaque palette porte son lot, sa machine et son heure de clôture"
            />
            {order.pallets.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-fg-muted">Aucune palette déclarée.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Palette</Th>
                    <Th>Lot</Th>
                    <Th>Machine</Th>
                    <Th numeric>Quantité</Th>
                    <Th>Clôturée</Th>
                    <Th>Statut</Th>
                  </tr>
                </thead>
                <tbody>
                  {order.pallets.map((pallet) => (
                    <Tr key={pallet.id}>
                      <Td className="font-mono text-xs">{pallet.code}</Td>
                      <Td className="text-fg-muted">{pallet.lotNumber ?? '—'}</Td>
                      <Td className="text-fg-muted">{pallet.machineName ?? '—'}</Td>
                      <Td numeric>{formatNumber(pallet.quantityUnits)}</Td>
                      <Td className="text-fg-muted">
                        {pallet.completedAt ? formatDateTime(pallet.completedAt) : '—'}
                      </Td>
                      <Td>
                        <Badge tone={pallet.status === 'in_progress' ? 'outline' : 'neutral'}>
                          {pallet.status === 'in_progress' ? 'En cours' : 'En stock'}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-4">
          <Card>
            <CardHeader title="Analyse de faisabilité" subtitle="Recalculée à chaque consultation" />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex items-center justify-between">
                <span className="text-[0.8125rem] text-fg-muted">Risque de retard</span>
                <span className={cn('tabular text-[1.25rem] font-semibold', SEVERITY_TEXT[order.severity])}>
                  {order.risk.riskPct} %
                </span>
              </div>

              <ul className="space-y-1.5">
                {order.feasibility.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-[0.8125rem]">
                    <span aria-hidden>{CHECK_ICONS[check.status]}</span>
                    <span>
                      <span className="font-medium text-fg">{check.label}</span>
                      <span className="block text-xs text-fg-muted">{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-line pt-3">
                <p className="mb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                  Pourquoi ce risque
                </p>
                <ul className="space-y-1 text-[0.8125rem] text-fg-muted">
                  {order.risk.reasons.map((reason, index) => (
                    <li key={index}>• {reason}</li>
                  ))}
                </ul>
                <DataOrigin origin="estimated" className="mt-2" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Réservations de stock" />
            {order.reservations.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-fg-muted">Aucune réservation active.</p>
            ) : (
              <ul className="space-y-2 px-5 pb-5">
                {order.reservations.map((reservation, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                    <span className="min-w-0">
                      <span className="block truncate text-fg">{reservation.itemName}</span>
                      <span className="block text-xs text-fg-subtle">{reservation.itemSku}</span>
                    </span>
                    <span className="tabular shrink-0 font-medium text-normal">
                      {formatNumber(reservation.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {order.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="px-5 pb-5 text-[0.8125rem] leading-relaxed text-fg-muted">{order.notes}</p>
            </Card>
          ) : null}

          {auditLogs.length > 0 ? (
            <Card>
              <CardHeader title="Historique" subtitle="Modifications tracées sur cette commande" />
              <ul className="space-y-2.5 px-5 pb-5">
                {auditLogs.map((log) => (
                  <li key={log.id} className="text-[0.8125rem]">
                    <span className="text-fg">{log.action}</span>
                    <span className="block text-xs text-fg-subtle">
                      {log.userLabel ?? 'Système'} · {formatDateTime(log.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
