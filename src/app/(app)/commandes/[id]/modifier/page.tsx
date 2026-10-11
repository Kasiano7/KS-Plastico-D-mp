import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { getOrderDetail } from '@/server/services/orders';
import { Card, CardHeader } from '@/components/ui/primitives';
import { EditOrderForm } from './edit-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const order = await getOrderDetail((await params).id);
  return { title: order ? `Modifier commande #${order.number}` : 'Modifier commande' };
}

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('orders:write');
  const order = await getOrderDetail((await params).id);
  if (!order) notFound();

  if (order.status === 'shipped' || order.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-[700px]">
        <p className="text-[0.8125rem] text-critical">Cette commande ne peut plus être modifiée.</p>
      </div>
    );
  }

  const defaultDueAt = order.dueAt.toISOString().slice(0, 10);
  const defaultQuantity = order.lines[0]?.quantityUnits ?? 0;
  const minQuantity = order.lines.reduce((sum, l) => sum + l.producedUnits, 0);

  return (
    <div className="mx-auto max-w-[700px]">
      <Link
        href={`/commandes/${order.id}`}
        className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Retour à la commande #{order.number}
      </Link>

      <Card>
        <CardHeader
          title={`Modifier commande #${order.number}`}
          subtitle="Le produit ne peut pas être modifié après création."
        />
        <EditOrderForm
          orderId={order.id}
          defaultQuantity={defaultQuantity}
          minQuantity={minQuantity}
          defaultDueAt={defaultDueAt}
          defaultPriority={order.priority}
          defaultNotes={order.notes ?? ''}
        />
      </Card>
    </div>
  );
}
