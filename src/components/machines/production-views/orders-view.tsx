import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getMachineDetail } from '@/server/services/machines';
import { Panel } from '@/components/machines/overview-cards';
import { ProductionOrderControls } from '@/components/machines/production-order-controls';
import { Badge, DataOrigin, Progress, Table, Td, Th, Tr } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDecimal, formatDuration, formatNumber } from '@/lib/format';
import styles from '@/components/machines/machines.module.css';


const ORDER_STATUS_LABELS: Record<string, string> = {
  planned: 'Planifié',
  released: 'Lancé',
  running: 'En cours',
  paused: 'En pause',
  done: 'Terminé',
  cancelled: 'Annulé',
};

export async function OrdersView({ id }: { id: string }) {
  const user = await requirePermission('machines:read');
  const machine = await getMachineDetail(id);
  if (!machine) notFound();

  const canPilot = can(user.permissions, 'production:write');

  const tiles = [
    { label: 'Pièces bonnes du jour', value: formatNumber(machine.producedUnits), origin: 'measured' as const },
    { label: 'Pièces rebutées du jour', value: formatNumber(machine.rejectedUnits), origin: 'measured' as const },
    { label: 'TRS du jour', value: `${formatDecimal(machine.oee.oeePct)} %`, origin: 'computed' as const },
    {
      label: 'Cadence de l’ordre en cours',
      value: machine.currentOrder ? `${formatNumber(machine.currentOrder.plannedUnitsPerHour)} p/h` : '—',
      origin: 'computed' as const,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cn(styles.panel, 'rounded-2xl border border-line p-4')}>
            <p className="text-[0.8125rem] text-fg-muted">{tile.label}</p>
            <p className="tabular mt-2 text-[1.625rem] leading-none font-semibold text-fg">{tile.value}</p>
            <DataOrigin origin={tile.origin} className="mt-3" />
          </div>
        ))}
      </div>

      <Panel
        title="Ordres de fabrication"
        hint="Charge planifiée et réalisée sur cette presse"
        bodyClassName="px-0 pb-0"
      >
        {machine.productionOrders.length === 0 ? (
          <p className="px-5 pb-5 text-[0.8125rem] text-fg-muted">
            Aucun ordre de fabrication rattaché à cette presse.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ordre</Th>
                <Th>Pièce</Th>
                <Th>Commande</Th>
                <Th>État</Th>
                <Th>Créneau planifié</Th>
                <Th>Durée estimée</Th>
                <Th className="w-[12rem]">Avancement</Th>
                {canPilot ? <Th numeric>Actions</Th> : null}
              </tr>
            </thead>
            <tbody>
              {machine.productionOrders.map((order) => (
                <Tr key={order.id}>
                  <Td className="font-medium">{order.number}</Td>
                  <Td className="text-fg-muted">{order.productName}</Td>
                  <Td className="text-fg-muted">
                    {order.orderNumber && order.orderId ? (
                      <Link href={`/commandes/${order.orderId}`} prefetch={false} className="hover:text-brand">
                        #{order.orderNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-fg-muted">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Td>
                  <Td className="tabular text-fg-muted">
                    {formatDateTime(order.plannedStartAt)} → {formatDateTime(order.plannedEndAt)}
                  </Td>
                  <Td className="tabular text-fg-muted">
                    {order.plannedUnitsPerHour && order.plannedUnitsPerHour > 0
                      ? `~${formatDuration((order.quantityUnits / order.plannedUnitsPerHour) * 60)}`
                      : '—'}
                  </Td>
                  <Td>
                    <span className="tabular mb-1.5 block text-xs">
                      {formatNumber(order.producedUnits)} / {formatNumber(order.quantityUnits)}
                    </span>
                    <Progress
                      value={(order.producedUnits / Math.max(order.quantityUnits, 1)) * 100}
                      severity={order.status === 'paused' ? 'warning' : 'normal'}
                      label={`Avancement de l’ordre ${order.number}`}
                    />
                  </Td>
                  {canPilot ? (
                    <Td className="text-right">
                      <ProductionOrderControls productionOrderId={order.id} status={order.status} />
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel title="Pièces compatibles" hint="Références produisibles sur cette presse et cadence retenue">
        {machine.compatibleProducts.length === 0 ? (
          <p className="text-[0.8125rem] text-fg-muted">Aucune pièce déclarée compatible avec cette presse.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {machine.compatibleProducts.map((product) => (
              <li
                key={product.productReference}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken px-3.5 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.875rem] text-fg">{product.productName}</span>
                  <span className="block text-xs text-fg-subtle">{product.productReference}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {product.isPreferred ? <Badge tone="brand">Préférée</Badge> : null}
                  <span className="tabular text-[0.8125rem] text-fg-muted">
                    {formatNumber(product.unitsPerHour)} p/h
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
