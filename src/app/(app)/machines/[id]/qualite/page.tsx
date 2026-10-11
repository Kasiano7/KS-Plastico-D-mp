import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getMachineDetail } from '@/server/services/machines';
import { Panel } from '@/components/machines/overview-cards';
import { QualityDefectForm, DEFECT_LABELS } from '@/components/machines/quality-defect-form';
import { DataOrigin, Table, Td, Th, Tr } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDecimal, formatNumber } from '@/lib/format';
import styles from '@/components/machines/machines.module.css';

export const metadata: Metadata = { title: 'Qualité machine' };
export const dynamic = 'force-dynamic';

export default async function MachineQualityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('machines:read');
  const machine = await getMachineDetail((await params).id);
  if (!machine) notFound();

  const canDeclare = can(user.permissions, 'quality:write');

  const produced = machine.producedUnits + machine.rejectedUnits;
  const scrapRatePct = produced > 0 ? (machine.rejectedUnits / produced) * 100 : 0;

  const tiles = [
    {
      label: 'Pièces bonnes',
      value: formatNumber(machine.producedUnits),
      className: 'text-normal',
      origin: 'measured' as const,
    },
    {
      label: 'Pièces rebutées',
      value: formatNumber(machine.rejectedUnits),
      className: 'text-critical',
      origin: 'measured' as const,
    },
    {
      label: 'Taux de rebut',
      value: `${formatDecimal(scrapRatePct)} %`,
      className: 'text-fg',
      origin: 'computed' as const,
    },
    {
      label: 'Qualité (TRS)',
      value: `${formatDecimal(machine.oee.qualityPct)} %`,
      className: 'text-fg',
      origin: 'computed' as const,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cn(styles.panel, 'rounded-2xl border border-line p-4')}>
            <p className="text-[0.8125rem] text-fg-muted">{tile.label}</p>
            <p className={cn('tabular mt-2 text-[1.625rem] leading-none font-semibold', tile.className)}>
              {tile.value}
            </p>
            <DataOrigin origin={tile.origin} className="mt-3" />
          </div>
        ))}
      </div>

      <Panel
        title="Déclarations qualité du jour"
        hint="Rebuts et défauts rattachés à cette presse"
        bodyClassName="px-0 pb-0"
      >
        {canDeclare ? (
          <div className="px-5 pb-4">
            <QualityDefectForm machineId={machine.id} />
          </div>
        ) : null}

        {machine.qualityEvents.length === 0 ? (
          <p className="px-5 pb-5 text-[0.8125rem] text-fg-muted">
            Aucun rebut déclaré aujourd’hui sur cette presse.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Détecté le</Th>
                <Th>Défaut</Th>
                <Th>Lot</Th>
                <Th>Commentaire</Th>
                <Th numeric>Pièces rebutées</Th>
              </tr>
            </thead>
            <tbody>
              {machine.qualityEvents.map((event) => (
                <Tr key={event.id}>
                  <Td className="tabular text-fg-muted">{formatDateTime(event.detectedAt)}</Td>
                  <Td className="font-medium">{DEFECT_LABELS[event.defect] ?? event.defect}</Td>
                  <Td className="text-fg-muted">{event.lotNumber ?? '—'}</Td>
                  <Td className="text-fg-muted">{event.comment ?? '—'}</Td>
                  <Td className="tabular text-right font-semibold text-warning">
                    {formatNumber(event.rejectedUnits)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
