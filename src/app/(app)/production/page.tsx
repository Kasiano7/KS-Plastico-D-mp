import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/server/auth/session';
import { getFactoryContext } from '@/server/services/factory-context';
import { MACHINE_STATUS_LABELS } from '@/server/domain/machines';
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
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { AttentionBar } from '@/components/factory/attention-bar';
import type { AttentionItem } from '@/server/domain/attention';
import { cn } from '@/lib/cn';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';

export const metadata: Metadata = { title: 'Production' };
export const dynamic = 'force-dynamic';

/** Dashboard production à trois niveaux : usine → atelier → machine (§32). */
export default async function ProductionPage() {
  await requirePermission('production:read');
  const context = await getFactoryContext();

  const gap = context.production.producedUnits - context.production.targetUnits;

  /*
   * Ce qui bloque la production se lit à deux niveaux : un atelier sous son
   * objectif, et une machine arrêtée. Les deux sévérités sont déjà calculées,
   * la bande ne fait que les hisser en tête de page.
   */
  const attention: AttentionItem[] = [
    ...context.workshops.map((workshop) => ({
      id: `atelier-${workshop.id}`,
      severity: workshop.severity,
      title: `${workshop.name} — ${formatPercent(workshop.achievementPct)} de l’objectif`,
      detail: `${formatNumber(workshop.producedUnits)} pièces sur ${formatNumber(workshop.targetUnits)}${
        workshop.machinesDown > 0
          ? ` · ${workshop.machinesDown} machine${workshop.machinesDown > 1 ? 's' : ''} à l’arrêt`
          : ''
      }`,
    })),
    ...[...context.machines]
      .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes)
      .map((machine) => ({
        id: `machine-${machine.id}`,
        severity: machine.severity,
        title: `${machine.name} — ${MACHINE_STATUS_LABELS[machine.status] ?? machine.status}`,
        detail:
          machine.downtimeMinutes > 0
            ? `${formatDuration(machine.downtimeMinutes)} d’arrêt aujourd’hui`
            : undefined,
        href: `/machines/${machine.id}`,
      })),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Production"
        description="Réalisation du jour comparée à l’objectif, du niveau usine jusqu’à la machine."
      />

      <AttentionBar items={attention} className="mb-6" />

      <Card className="mb-6">
        <CardHeader title="Usine" subtitle="Cumul des trois ateliers sur la journée en cours" />
        <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Production réelle', formatNumber(context.production.producedUnits), 'pièces'],
            ['Objectif', formatNumber(context.production.targetUnits), 'pièces'],
            [
              'Écart',
              `${gap >= 0 ? '+' : ''}${formatNumber(gap)}`,
              'pièces',
              gap >= 0 ? SEVERITY_TEXT.normal : SEVERITY_TEXT.warning,
            ],
            [
              'Réalisation',
              formatPercent(context.production.achievementPct),
              '',
              context.production.achievementPct >= 95 ? SEVERITY_TEXT.normal : SEVERITY_TEXT.warning,
            ],
            [
              'Taux de rebut',
              formatPercent(context.production.scrapRatePct, 1),
              '',
              context.production.scrapRatePct <= 1.5 ? SEVERITY_TEXT.normal : SEVERITY_TEXT.warning,
            ],
          ].map(([label, value, unit, tone]) => (
            <div key={label as string}>
              <p className="text-[0.75rem] text-fg-muted">{label}</p>
              <p className={cn('tabular mt-1 text-[1.5rem] leading-none font-semibold', tone ?? 'text-fg')}>
                {value}
              </p>
              {unit ? <p className="mt-1 text-[0.75rem] text-fg-subtle">{unit}</p> : null}
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        {context.workshops.map((workshop) => {
          const machines = context.machines.filter((machine) => machine.workshopId === workshop.id);

          return (
            <Card key={workshop.id}>
              <CardHeader
                title={workshop.name}
                subtitle={`${formatNumber(workshop.producedUnits)} / ${formatNumber(workshop.targetUnits)} pièces`}
                action={
                  <span className={cn('tabular text-lg font-semibold', SEVERITY_TEXT[workshop.severity])}>
                    {workshop.achievementPct} %
                  </span>
                }
              />
              <div className="px-5 pb-4">
                <Progress
                  value={workshop.achievementPct}
                  severity={workshop.severity}
                  className="h-2"
                  label={`Réalisation ${workshop.name}`}
                />
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>Machine</Th>
                    <Th>État</Th>
                    <Th>Ordre en cours</Th>
                    <Th numeric>Produit</Th>
                    <Th numeric>Rebuts</Th>
                    <Th numeric>Arrêts</Th>
                    <Th numeric>TRS</Th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((machine) => (
                    <Tr key={machine.id}>
                      <Td className="font-medium">
                        <Link href={`/machines/${machine.id}`} className="hover:text-brand">
                          {machine.name}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge severity={machine.severity} size="sm">
                          {MACHINE_STATUS_LABELS[machine.status] ?? machine.status}
                        </StatusBadge>
                      </Td>
                      <Td>
                        {machine.currentOrderNumber ? (
                          <>
                            <span className="block">{machine.currentProductName}</span>
                            <span className="block text-xs text-fg-subtle">
                              {machine.currentOrderNumber}
                            </span>
                          </>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </Td>
                      <Td numeric>{formatNumber(machine.producedUnits)}</Td>
                      <Td numeric className="text-fg-muted">
                        {formatNumber(machine.rejectedUnits)}
                      </Td>
                      <Td
                        className={cn(
                          'tabular text-right',
                          machine.downtimeMinutes > 0 ? 'text-warning' : 'text-fg-subtle',
                        )}
                      >
                        {machine.downtimeMinutes > 0 ? formatDuration(machine.downtimeMinutes) : '—'}
                      </Td>
                      <Td numeric className="font-medium">
                        {formatPercent(machine.oeePct, 1)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
