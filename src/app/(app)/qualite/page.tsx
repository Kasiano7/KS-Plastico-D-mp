import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { getFactoryContext } from '@/server/services/factory-context';
import {
  Card,
  CardHeader,
  PageHeader,
  Progress,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';

export const metadata: Metadata = { title: 'Qualité' };
export const dynamic = 'force-dynamic';

const DEFECT_LABELS: Record<string, string> = {
  appearance: 'Aspect',
  dimension: 'Dimensionnel',
  material: 'Matière',
  shrinkage: 'Retassure',
  burn: 'Brûlure',
  flash: 'Bavure',
  contamination: 'Contamination',
  other: 'Autre',
};

export default async function QualityPage() {
  await requirePermission('quality:read');
  const db = await getDb();
  const context = await getFactoryContext();

  const events = await db
    .select({
      id: t.qualityEvents.id,
      defect: t.qualityEvents.defect,
      rejectedUnits: t.qualityEvents.rejectedUnits,
      lotNumber: t.qualityEvents.lotNumber,
      detectedAt: t.qualityEvents.detectedAt,
      comment: t.qualityEvents.comment,
      machineId: t.machines.id,
      machineName: t.machines.name,
      productionOrderNumber: t.productionOrders.number,
    })
    .from(t.qualityEvents)
    .leftJoin(t.machines, eq(t.qualityEvents.machineId, t.machines.id))
    .leftJoin(t.productionOrders, eq(t.qualityEvents.productionOrderId, t.productionOrders.id))
    .orderBy(desc(t.qualityEvents.detectedAt))
    .limit(40);

  const byDefect = Object.entries(
    events.reduce<Record<string, number>>((acc, event) => {
      acc[event.defect] = (acc[event.defect] ?? 0) + event.rejectedUnits;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const totalRejected = byDefect.reduce((total, [, count]) => total + count, 0);

  const byMachine = Object.entries(
    events.reduce<Record<string, number>>((acc, event) => {
      if (!event.machineName) return acc;
      acc[event.machineName] = (acc[event.machineName] ?? 0) + event.rejectedUnits;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Qualité"
        description="Pièces bonnes, pièces rejetées et motifs de rebut — ces déclarations alimentent le TRS, les coûts et les analyses."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Pièces conformes (jour)</p>
          <p className={cn('tabular mt-2 text-[1.75rem] leading-none font-semibold', SEVERITY_TEXT.normal)}>
            {formatNumber(context.production.producedUnits)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Pièces rebutées (jour)</p>
          <p className={cn('tabular mt-2 text-[1.75rem] leading-none font-semibold', SEVERITY_TEXT.warning)}>
            {formatNumber(context.production.rejectedUnits)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Taux de rebut</p>
          <p
            className={cn(
              'tabular mt-2 text-[1.75rem] leading-none font-semibold',
              context.production.scrapRatePct <= 1.5 ? SEVERITY_TEXT.normal : SEVERITY_TEXT.warning,
            )}
          >
            {formatPercent(context.production.scrapRatePct, 1)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Déclarations enregistrées</p>
          <p className="tabular mt-2 text-[1.75rem] leading-none font-semibold text-fg">
            {events.length}
          </p>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Répartition des motifs de rebut" subtitle="Sur les dernières déclarations" />
          <div className="space-y-3 px-5 pb-5">
            {byDefect.map(([defect, count]) => (
              <div key={defect}>
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-fg">{DEFECT_LABELS[defect] ?? defect}</span>
                  <span className="tabular text-fg-muted">
                    {formatNumber(count)} · {formatPercent((count / Math.max(totalRejected, 1)) * 100)}
                  </span>
                </div>
                <Progress
                  value={(count / Math.max(totalRejected, 1)) * 100}
                  severity="warning"
                  className="mt-1.5"
                  label={DEFECT_LABELS[defect] ?? defect}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Rebuts par machine" subtitle="Identifie les presses à surveiller" />
          <div className="space-y-3 px-5 pb-5">
            {byMachine.map(([machine, count]) => (
              <div key={machine}>
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-fg">{machine}</span>
                  <span className="tabular text-fg-muted">{formatNumber(count)} pièces</span>
                </div>
                <Progress
                  value={(count / Math.max(byMachine[0][1], 1)) * 100}
                  severity="info"
                  className="mt-1.5"
                  label={machine}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Déclarations qualité" subtitle="Traçabilité lot par lot" />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Machine</Th>
              <Th>Ordre</Th>
              <Th>Motif</Th>
              <Th>Lot</Th>
              <Th numeric>Rebuts</Th>
              <Th>Commentaire</Th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <Tr key={event.id}>
                <Td className="text-fg-muted">{formatDateTime(event.detectedAt)}</Td>
                <Td>
                  {event.machineId && event.machineName ? (
                    <Link href={`/machines/${event.machineId}`} className="font-medium hover:text-brand">
                      {event.machineName}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td className="text-fg-muted">{event.productionOrderNumber ?? '—'}</Td>
                <Td className="text-fg-muted">{DEFECT_LABELS[event.defect] ?? event.defect}</Td>
                <Td className="font-mono text-xs text-fg-subtle">{event.lotNumber ?? '—'}</Td>
                <Td className="tabular text-right font-medium text-warning">
                  {formatNumber(event.rejectedUnits)}
                </Td>
                <Td className="max-w-[280px] truncate text-fg-muted">{event.comment ?? '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
