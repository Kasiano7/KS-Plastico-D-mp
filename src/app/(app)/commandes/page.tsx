import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { listOrders } from '@/server/services/orders';
import {
  ButtonLink,
  Card,
  PageHeader,
  Progress,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { formatCents, formatDate, formatDueDelta, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Commandes' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  confirmed: 'Confirmée',
  in_production: 'En production',
  ready: 'Prête',
  shipped: 'Expédiée',
  cancelled: 'Annulée',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  critical: 'Critique',
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const user = await requirePermission('orders:read');
  const { statut } = await searchParams;

  const canSeeFinancials = can(user.permissions, 'finance:read');
  const canWrite = can(user.permissions, 'orders:write');
  const orders = await listOrders();

  const active = orders.filter((order) => !['shipped', 'cancelled'].includes(order.status));
  const filtered =
    statut === 'toutes' ? orders : statut ? orders.filter((order) => order.status === statut) : active;

  const atRisk = active.filter((order) => order.riskPct >= 20).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Commandes"
        description="Toutes les commandes clients, leur avancement réel et leur risque de retard calculé."
        action={
          canWrite ? (
            <ButtonLink href="/commandes/nouvelle" size="md">
              <Plus className="size-4" />
              Nouvelle commande
            </ButtonLink>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[
          { value: '', label: 'Actives' },
          { value: 'in_production', label: 'En production' },
          { value: 'confirmed', label: 'Confirmées' },
          { value: 'ready', label: 'Prêtes' },
          { value: 'toutes', label: 'Toutes' },
        ].map((filter) => {
          const isActive = (statut ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/commandes?statut=${filter.value}` : '/commandes'}
              className={
                isActive
                  ? 'rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand'
                  : 'rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong'
              }
            >
              {filter.label}
            </Link>
          );
        })}
        {atRisk > 0 ? (
          <span className="ml-auto text-[0.8125rem] text-fg-muted">
            <span className="font-semibold text-warning">{atRisk}</span> commande
            {atRisk > 1 ? 's' : ''} à risque de retard
          </span>
        ) : null}
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Commande</Th>
              <Th>Client</Th>
              <Th>Pièce</Th>
              <Th numeric>Quantité</Th>
              <Th className="w-[180px]">Avancement</Th>
              <Th numeric>Palettes</Th>
              <Th>Échéance</Th>
              <Th>Statut</Th>
              <Th numeric>Risque</Th>
              {canSeeFinancials ? <Th numeric>Valeur</Th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <Tr key={order.id}>
                <Td className="font-medium">
                  <Link href={`/commandes/${order.id}`} className="hover:text-brand">
                    #{order.number}
                  </Link>
                  {order.priority !== 'normal' ? (
                    <span
                      className={cn(
                        'ml-2 rounded border px-1.5 py-0.5 text-[0.625rem]',
                        order.priority === 'critical' || order.priority === 'high'
                          ? 'border-warning/30 bg-warning-soft text-warning'
                          : 'border-line text-fg-subtle',
                      )}
                    >
                      {PRIORITY_LABELS[order.priority]}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-fg-muted">{order.customerName}</Td>
                <Td className="max-w-[200px] truncate text-fg-muted">
                  {order.productNames.join(', ')}
                </Td>
                <Td numeric>{formatNumber(order.quantityUnits)}</Td>
                <Td>
                  <span className="tabular mb-1 block text-xs text-fg-muted">
                    {order.progressPct} %
                  </span>
                  <Progress
                    value={order.progressPct}
                    severity={order.progressPct >= 100 ? 'normal' : order.severity}
                    label={`Avancement commande ${order.number}`}
                  />
                </Td>
                <Td numeric className="text-fg-muted">
                  {order.palletsReady} / {order.palletsRequired}
                </Td>
                <Td className="text-fg-muted">
                  <span className="block">{formatDate(order.dueAt)}</span>
                  <span className="block text-xs text-fg-subtle">{formatDueDelta(order.dueAt)}</span>
                </Td>
                <Td className="text-fg-muted">{STATUS_LABELS[order.status] ?? order.status}</Td>
                <Td className="text-right">
                  {['shipped', 'cancelled', 'ready'].includes(order.status) ? (
                    <span className="text-fg-subtle">—</span>
                  ) : (
                    <StatusBadge severity={order.severity} size="sm">
                      {order.riskPct} %
                    </StatusBadge>
                  )}
                </Td>
                {canSeeFinancials ? (
                  <Td numeric>{formatCents(order.valueCents)}</Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
