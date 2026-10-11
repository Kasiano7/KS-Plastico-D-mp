import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Factory, Gauge, PackageCheck, Wrench } from 'lucide-react';
import { FACTORY_AREAS, getFactoryArea } from '@/data/factory-areas';
import { requirePermission } from '@/server/auth/session';
import { MACHINE_STATUS_LABELS } from '@/server/domain/machines';
import { getFactoryContext } from '@/server/services/factory-context';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatDuration, formatNumber, formatPercent, formatSince } from '@/lib/format';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return FACTORY_AREAS.map((area) => ({ slug: area.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const area = getFactoryArea((await params).slug);
  return { title: area?.label ?? 'Atelier' };
}

export default async function FactoryAreaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission('machines:read');

  const area = getFactoryArea((await params).slug);
  if (!area) notFound();

  const context = await getFactoryContext();
  const workshop = area.sourceWorkshopCode
    ? context.workshops.find((candidate) => candidate.code === area.sourceWorkshopCode)
    : undefined;
  const machines = workshop
    ? context.machines.filter((machine) => machine.workshopId === workshop.id)
    : [];
  const machinesInProduction = machines.filter((machine) => machine.status === 'production').length;
  const machinesUnavailable = machines.filter((machine) => machine.severity === 'critical').length;
  const averageOee = machines.length
    ? machines.reduce((total, machine) => total + machine.oeePct, 0) / machines.length
    : 0;
  const downtimeMinutes = machines.reduce(
    (total, machine) => total + machine.downtimeMinutes,
    0,
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={area.label}
        description={area.description}
        action={
          <ButtonLink href="/" variant="secondary" size="sm">
            <ArrowLeft className="size-3.5" />
            Retour à l’accueil
          </ButtonLink>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Factory className="size-4" />}
          label="Type de zone"
          value={area.kind === 'production' ? 'Production' : 'Support'}
          detail={workshop ? `Périmètre ${workshop.name}` : 'Sans machine de production'}
        />
        <MetricCard
          icon={<PackageCheck className="size-4" />}
          label="Machines en production"
          value={machines.length ? `${machinesInProduction} / ${machines.length}` : 'Aucune'}
          detail={
            machinesUnavailable > 0
              ? `${machinesUnavailable} machine(s) indisponible(s)`
              : 'Aucun arrêt critique en cours'
          }
          tone={machinesUnavailable > 0 ? 'critical' : 'normal'}
        />
        <MetricCard
          icon={<Gauge className="size-4" />}
          label="TRS moyen du jour"
          value={machines.length ? formatPercent(averageOee, 1) : 'Non concerné'}
          detail={machines.length ? 'Moyenne des équipements de la zone' : 'Zone non productive'}
        />
        <MetricCard
          icon={<Wrench className="size-4" />}
          label="Arrêts cumulés"
          value={machines.length ? formatDuration(downtimeMinutes) : 'Non concerné'}
          detail={`Situation relevée à ${context.capturedAt.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris',
          })}`}
          tone={downtimeMinutes > 0 ? 'warning' : 'normal'}
        />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Rôle de la zone" subtitle="Principales activités réalisées dans cet espace" />
          <ul className="space-y-3 px-5 pb-5">
            {area.missions.map((mission, index) => (
              <li key={mission} className="flex gap-3 text-sm leading-6 text-fg-muted">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                  {index + 1}
                </span>
                <span>{mission}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="État opérationnel" subtitle="Synthèse calculée à partir des équipements suivis" />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg-muted">Situation de la zone</span>
              <StatusBadge severity={workshop?.severity ?? 'normal'}>
                {machinesUnavailable > 0
                  ? 'Intervention requise'
                  : area.kind === 'production'
                    ? 'Opérationnelle'
                    : 'Zone support disponible'}
              </StatusBadge>
            </div>
            {workshop ? (
              <>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-fg-muted">Objectif quotidien</span>
                    <span className={cn('tabular font-semibold', SEVERITY_TEXT[workshop.severity])}>
                      {workshop.achievementPct} %
                    </span>
                  </div>
                  <Progress
                    value={workshop.achievementPct}
                    severity={workshop.severity}
                    label={`Réalisation ${area.label}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                  <div>
                    <p className="text-fg-subtle">Produit aujourd’hui</p>
                    <p className="tabular mt-1 font-semibold text-fg">
                      {formatNumber(workshop.producedUnits)} pièces
                    </p>
                  </div>
                  <div>
                    <p className="text-fg-subtle">Objectif</p>
                    <p className="tabular mt-1 font-semibold text-fg">
                      {formatNumber(workshop.targetUnits)} pièces
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="rounded-md border border-line bg-surface-sunken p-4 text-sm leading-6 text-fg-muted">
                Cette zone assure une fonction de support. Elle ne porte donc ni objectif de
                production ni indicateur TRS.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Machines et équipements"
          subtitle={
            machines.length
              ? `${machines.length} équipement(s) suivi(s) en temps réel dans cette zone`
              : 'Aucune machine de production rattachée à cette zone'
          }
          action={machines.length ? <Badge tone="outline">Données temps réel</Badge> : undefined}
        />

        {machines.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Machine</Th>
                <Th>État</Th>
                <Th>Depuis</Th>
                <Th>Ordre en cours</Th>
                <Th numeric>Production</Th>
                <Th numeric>Arrêts</Th>
                <Th className="w-[150px]">TRS</Th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => (
                <Tr key={machine.id}>
                  <Td>
                    <Link href={`/machines/${machine.id}`} className="font-medium hover:text-brand">
                      {machine.name}
                    </Link>
                    <span className="block text-xs text-fg-subtle">{machine.code}</span>
                  </Td>
                  <Td>
                    <StatusBadge severity={machine.severity} size="sm">
                      {MACHINE_STATUS_LABELS[machine.status] ?? machine.status}
                    </StatusBadge>
                  </Td>
                  <Td className="text-fg-muted">
                    {formatSince(machine.statusSince, context.capturedAt)}
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
                    {machine.downtimeMinutes ? formatDuration(machine.downtimeMinutes) : '—'}
                  </Td>
                  <Td>
                    <span className="tabular mb-1 block text-xs font-medium">
                      {formatPercent(machine.oeePct, 1)}
                    </span>
                    <Progress
                      value={machine.oeePct}
                      severity={machine.severity}
                      label={`TRS ${machine.name}`}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            title="Aucune machine de production"
            description="Les équipements de confort et les postes administratifs ne sont pas suivis comme des moyens de production dans l’application."
          />
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'normal' | 'warning' | 'critical';
}) {
  const valueColor = {
    neutral: 'text-fg',
    normal: 'text-normal',
    warning: 'text-warning',
    critical: 'text-critical',
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-fg-muted">
        <span className="grid size-7 place-items-center rounded-md bg-surface-sunken">{icon}</span>
        <span className="text-[0.75rem] font-medium">{label}</span>
      </div>
      <p className={cn('tabular mt-3 text-[1.5rem] leading-none font-semibold', valueColor)}>
        {value}
      </p>
      <p className="mt-2 text-[0.6875rem] leading-5 text-fg-subtle">{detail}</p>
    </Card>
  );
}
