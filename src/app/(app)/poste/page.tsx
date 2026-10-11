import type { Metadata } from 'next';
import { and, desc, eq, inArray } from 'drizzle-orm';
import QRCode from 'qrcode';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { machineSeverity, MACHINE_STATUS_LABELS } from '@/server/domain/machines';
import { WorkstationActions } from './actions-panel';
import { PalletQrDialog } from '@/components/factory/pallet-qr-dialog';
import { PalletCancelDialog } from '@/components/factory/pallet-cancel-dialog';
import { canCancelPallet } from '@/server/domain/pallets';
import { Card, CardHeader, Progress, StatusBadge } from '@/components/ui/primitives';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Severity } from '@/components/ui/severity';

export const metadata: Metadata = { title: 'Mon poste' };
export const dynamic = 'force-dynamic';

/**
 * Poste opérateur (§8).
 *
 * Interface volontairement réduite à l'essentiel, pensée pour un écran tactile
 * en atelier : gros chiffres, deux actions, aucune navigation superflue.
 */
export default async function WorkstationPage() {
  const user = await requirePermission('workstation:use');
  const db = await getDb();

  const machineIds = user.workshopId
    ? (
        await db
          .select({ id: t.machines.id })
          .from(t.machines)
          .where(eq(t.machines.workshopId, user.workshopId))
      ).map((row) => row.id)
    : [];

  const [current] = machineIds.length
    ? await db
        .select({
          productionOrder: t.productionOrders,
          productName: t.products.name,
          productReference: t.products.reference,
          unitsPerPallet: t.products.unitsPerPallet,
          machineId: t.machines.id,
          machineName: t.machines.name,
          machineStatus: t.machines.status,
          orderNumber: t.customerOrders.number,
          customerName: t.customers.name,
        })
        .from(t.productionOrders)
        .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
        .innerJoin(t.machines, eq(t.productionOrders.machineId, t.machines.id))
        .leftJoin(t.customerOrders, eq(t.productionOrders.customerOrderId, t.customerOrders.id))
        .leftJoin(t.customers, eq(t.customerOrders.customerId, t.customers.id))
        .where(
          and(
            inArray(t.productionOrders.machineId, machineIds),
            inArray(t.productionOrders.status, ['running', 'paused', 'released']),
          ),
        )
        .orderBy(t.productionOrders.plannedStartAt)
        .limit(1)
    : [];

  const recentPallets = current
    ? await db
        .select()
        .from(t.pallets)
        .where(eq(t.pallets.productionOrderId, current.productionOrder.id))
        .orderBy(desc(t.pallets.completedAt))
        .limit(4)
    : [];

  const lastPallet = recentPallets.find(
    (pallet) => pallet.completedAt && pallet.status !== 'cancelled',
  );
  // Le QR est généré côté serveur : le navigateur ne reçoit qu'une image.
  // Généré pour chaque palette récente, pas seulement la dernière : une
  // étiquette perdue doit pouvoir être réimprimée pour n'importe laquelle.
  const qrByPalletId = new Map(
    await Promise.all(
      recentPallets
        .filter((pallet) => pallet.completedAt)
        .map(async (pallet) => [
          pallet.id,
          await QRCode.toDataURL(
            JSON.stringify({ p: pallet.code, l: pallet.lotNumber, q: pallet.quantityUnits }),
            { margin: 1, width: 220, color: { dark: '#0e2a47', light: '#ffffff' } },
          ),
        ] as const),
    ),
  );
  const qrDataUrl = lastPallet ? (qrByPalletId.get(lastPallet.id) ?? null) : null;

  if (!current) {
    return (
      <div className="mx-auto max-w-[720px]">
        <Card className="p-8 text-center">
          <p className="text-lg font-semibold text-fg">Aucun ordre en cours</p>
          <p className="mt-2 text-sm text-fg-muted">
            Aucun ordre de fabrication n’est actuellement lancé sur votre atelier. Rapprochez-vous de
            votre chef d’atelier.
          </p>
        </Card>
      </div>
    );
  }

  const progressPct =
    (current.productionOrder.producedUnits / Math.max(current.productionOrder.quantityUnits, 1)) * 100;
  const palletsDone = recentPallets.filter(
    (pallet) => pallet.completedAt && pallet.status !== 'cancelled',
  ).length;
  const palletsRequired = Math.ceil(current.productionOrder.quantityUnits / current.unitsPerPallet);

  return (
    <div className="mx-auto max-w-[820px]">
      <header className="mb-5">
        <p className="text-[0.8125rem] text-fg-muted">Bonjour {user.fullName.split(' ')[0]}</p>
        <h1 className="mt-0.5 text-[1.5rem] leading-8 font-semibold tracking-tight text-fg">
          Mon poste
        </h1>
      </header>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-fg-subtle uppercase">
              Ordre en cours
            </p>
            <p className="mt-1 text-[1.5rem] leading-tight font-semibold text-fg">
              {current.productName}
            </p>
            <p className="text-[0.9375rem] text-fg-muted">
              {current.productReference} · {current.productionOrder.number}
            </p>
          </div>
          <div className="text-right">
            <StatusBadge severity={machineSeverity(current.machineStatus) as Severity}>
              {MACHINE_STATUS_LABELS[current.machineStatus] ?? current.machineStatus}
            </StatusBadge>
            <p className="mt-1.5 text-[0.9375rem] font-medium text-fg">{current.machineName}</p>
            {current.orderNumber ? (
              <p className="text-[0.8125rem] text-fg-subtle">
                Commande #{current.orderNumber} · {current.customerName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-5 pt-5 pb-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="tabular text-[3rem] leading-none font-semibold text-fg">
                {formatNumber(current.productionOrder.producedUnits)}
              </p>
              <p className="mt-1 text-[0.875rem] text-fg-muted">
                sur {formatNumber(current.productionOrder.quantityUnits)} pièces
              </p>
            </div>
            <div className="text-right">
              <p className="tabular text-[2rem] leading-none font-semibold text-brand">
                {formatPercent(progressPct)}
              </p>
              <p className="mt-1 text-[0.875rem] text-fg-muted">
                {palletsDone} / {palletsRequired} palettes
              </p>
            </div>
          </div>

          <Progress
            value={progressPct}
            severity={progressPct >= 100 ? 'normal' : 'info'}
            className="mt-4 h-2.5"
            label="Avancement de l’ordre"
          />

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Objectif', formatNumber(current.productionOrder.quantityUnits)],
              ['Cadence prévue', `${current.productionOrder.plannedUnitsPerHour} p/h`],
              ['Pièces / palette', formatNumber(current.unitsPerPallet)],
              ['Rebuts', formatNumber(current.productionOrder.rejectedUnits)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[0.75rem] text-fg-subtle">{label}</dt>
                <dd className="tabular mt-0.5 text-[1.125rem] font-semibold text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <WorkstationActions
        productionOrderId={current.productionOrder.id}
        machineId={current.machineId}
        unitsPerPallet={current.unitsPerPallet}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Dernières palettes" subtitle="Traçabilité de votre poste" />
          {recentPallets.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-muted">Aucune palette déclarée.</p>
          ) : (
            <ul className="space-y-2 px-5 pb-5">
              {recentPallets.map((pallet) => (
                <li key={pallet.id} className="flex items-center justify-between gap-2 text-[0.8125rem]">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-fg">
                      {pallet.code}
                      {pallet.status === 'cancelled' ? (
                        <span className="ml-1.5 text-critical">· annulée</span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-fg-subtle">
                      {pallet.completedAt ? formatDateTime(pallet.completedAt) : 'En cours'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        'tabular font-medium',
                        pallet.status === 'cancelled' && 'text-fg-subtle line-through',
                      )}
                    >
                      {formatNumber(pallet.quantityUnits)}
                    </span>
                    {qrByPalletId.has(pallet.id) ? (
                      <PalletQrDialog
                        palletCode={pallet.code}
                        lotNumber={pallet.lotNumber}
                        qrDataUrl={qrByPalletId.get(pallet.id)!}
                      />
                    ) : null}
                    {canCancelPallet(pallet.status) ? (
                      <PalletCancelDialog palletId={pallet.id} palletCode={pallet.code} />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {qrDataUrl && lastPallet ? (
          <Card>
            <CardHeader title="QR de la dernière palette" subtitle="À coller sur la palette" />
            <div className="flex flex-col items-center gap-2 px-5 pb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`Code QR de la palette ${lastPallet.code}`}
                className="size-[180px] rounded-lg border border-line bg-white p-2"
              />
              <p className="font-mono text-xs text-fg">{lastPallet.code}</p>
              <p className="text-xs text-fg-subtle">Lot {lastPallet.lotNumber ?? '—'}</p>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
