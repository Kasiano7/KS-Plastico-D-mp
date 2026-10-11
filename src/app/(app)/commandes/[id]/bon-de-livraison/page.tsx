import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { getOrderDetail } from '@/server/services/orders';
import { ReportActions } from '@/components/reports/report-actions';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const order = await getOrderDetail((await params).id);
  return { title: order ? `Bon de livraison — commande #${order.number}` : 'Bon de livraison' };
}

const PALLET_STATUS_LABELS: Record<string, string> = {
  in_progress: 'En cours',
  completed: 'Terminée',
  in_stock: 'En stock',
  allocated: 'Allouée',
  shipped: 'Expédiée',
  cancelled: 'Annulée',
};

/**
 * Bon de livraison imprimable (§ ROADMAP.md Phase 4). Ne reprend que ce qui
 * est réellement tracé : ni l'usine ni le client n'ont d'adresse postale
 * dans le modèle de données aujourd'hui (`customers.country` seul) — pas
 * question d'en inventer une (§ règle 4 de CLAUDE.md). La ligne « Adresse de
 * livraison » reste donc à compléter à la main, comme le nom et la
 * signature du destinataire : ce document constate ce qui est parti, il ne
 * remplace pas un CRM.
 */
export default async function DeliveryNotePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('orders:read');
  const order = await getOrderDetail((await params).id);
  if (!order) notFound();

  const shippablePallets = order.pallets.filter((p) => p.status !== 'cancelled');
  const generatedAt = new Date();

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/commandes/${order.id}`}
          className="inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
        >
          <ChevronLeft className="size-3.5" />
          Commande #{order.number}
        </Link>
        <ReportActions />
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-line pb-5">
          <div>
            <p className="text-[1.0625rem] leading-none font-black tracking-[0.02em] text-fg">Usine de démonstration</p>
            <p className="mt-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-fg-subtle uppercase">
              Industrie
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-semibold text-fg">Bon de livraison</h1>
            <p className="mt-1 text-[0.8125rem] text-fg-muted">
              Commande #{order.number} · généré le {formatDateTime(generatedAt)}
            </p>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-6 text-[0.8125rem]">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
              Destinataire
            </p>
            <p className="mt-1.5 font-medium text-fg">{order.customerName}</p>
            <p className="text-fg-muted">{order.customerCode}</p>
            <p className="mt-3 text-fg-subtle">
              Adresse de livraison : <span className="inline-block min-w-[220px] border-b border-line">&nbsp;</span>
            </p>
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
              Commande
            </p>
            <dl className="mt-1.5 space-y-0.5">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Commandée le</dt>
                <dd className="font-medium text-fg">{formatDate(order.orderedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Échéance</dt>
                <dd className="font-medium text-fg">{formatDate(order.dueAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Palettes expédiées</dt>
                <dd className="font-medium text-fg">{shippablePallets.length}</dd>
              </div>
            </dl>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-[0.8125rem]">
          <thead>
            <tr className="border-b border-line text-left text-[0.6875rem] font-semibold tracking-[0.05em] text-fg-subtle uppercase">
              <th className="py-2 pr-3">Référence</th>
              <th className="py-2 pr-3">Désignation</th>
              <th className="py-2 pr-3 text-right">Commandé</th>
              <th className="py-2 pr-3 text-right">Expédié</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const shippedForLine = shippablePallets
                .filter((p) => p.productId === line.productId)
                .reduce((total, p) => total + p.quantityUnits, 0);
              return (
                <tr key={line.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-mono text-xs text-fg-muted">{line.productReference}</td>
                  <td className="py-2 pr-3 font-medium text-fg">{line.productName}</td>
                  <td className="tabular py-2 pr-3 text-right text-fg-muted">
                    {formatNumber(line.quantityUnits)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right font-medium text-fg">
                    {formatNumber(shippedForLine)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-6">
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
            Palettes — traçabilité
          </p>
          {shippablePallets.length === 0 ? (
            <p className="mt-2 text-[0.8125rem] text-fg-muted">Aucune palette prête pour cette commande.</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-[0.8125rem]">
              <thead>
                <tr className="border-b border-line text-left text-[0.6875rem] font-semibold tracking-[0.05em] text-fg-subtle uppercase">
                  <th className="py-1.5 pr-3">Palette</th>
                  <th className="py-1.5 pr-3">Lot</th>
                  <th className="py-1.5 pr-3">Pièce</th>
                  <th className="py-1.5 pr-3 text-right">Quantité</th>
                  <th className="py-1.5 pr-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {shippablePallets.map((pallet) => (
                  <tr key={pallet.id} className="border-b border-line/40">
                    <td className="py-1.5 pr-3 font-mono text-xs text-fg-muted">{pallet.code}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-fg-muted">{pallet.lotNumber ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-fg">{pallet.productName}</td>
                    <td className="tabular py-1.5 pr-3 text-right font-medium text-fg">
                      {formatNumber(pallet.quantityUnits)}
                    </td>
                    <td className="py-1.5 pr-3 text-fg-muted">
                      {PALLET_STATUS_LABELS[pallet.status] ?? pallet.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8 text-[0.8125rem]">
          <div>
            <p className="text-fg-subtle">Remis par</p>
            <p className="mt-8 border-t border-line pt-1 text-fg-muted">Nom, date et signature</p>
          </div>
          <div>
            <p className="text-fg-subtle">Reçu par</p>
            <p className="mt-8 border-t border-line pt-1 text-fg-muted">Nom, date et signature</p>
          </div>
        </div>
      </div>
    </div>
  );
}
