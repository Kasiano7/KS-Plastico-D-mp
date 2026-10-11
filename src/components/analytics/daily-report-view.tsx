import Link from 'next/link';
import { Activity, AlertTriangle, Factory, PackageCheck } from 'lucide-react';
import { ReportActions } from '@/components/reports/report-actions';
import {
  Card,
  CardHeader,
  DataOrigin,
  PageHeader,
  Progress,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { getFactoryAreaByWorkshopCode } from '@/data/factory-areas';
import { cn } from '@/lib/cn';
import {
  formatDateLong,
  formatDueDelta,
  formatDuration,
  formatNumber,
  formatPercent,
  formatTime,
} from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { getFactoryContext } from '@/server/services/factory-context';


export async function DailyReportView() {
  await requirePermission('dashboard:read');
  const context = await getFactoryContext();

  const machinesInProduction = context.machines.filter(
    (machine) => machine.status === 'production',
  ).length;
  const machinesUnavailable = context.machines.filter(
    (machine) => machine.severity === 'critical',
  ).length;
  const downtimeMinutes = context.machines.reduce(
    (total, machine) => total + machine.downtimeMinutes,
    0,
  );
  const atRiskOrders = context.orders
    .filter((order) => order.riskPct >= 20 || order.isLate)
    .sort((a, b) => b.riskPct - a.riskPct);
  const inventoryToWatch = context.inventory
    .filter((item) => item.severity === 'critical' || item.severity === 'warning')
    .sort((a, b) => a.coverageDays - b.coverageDays);

  const summary = [
    `La production atteint ${formatPercent(context.production.achievementPct)} de l’objectif quotidien, avec ${formatNumber(context.production.producedUnits)} pièces réalisées.`,
    machinesUnavailable > 0
      ? `${machinesUnavailable} machine(s) sont actuellement indisponibles et les arrêts cumulés représentent ${formatDuration(downtimeMinutes)}.`
      : `Aucune machine n’est en défaut critique ; ${machinesInProduction} équipement(s) produisent actuellement.`,
    atRiskOrders.length > 0
      ? `${atRiskOrders.length} commande(s) demandent une surveillance renforcée sur les délais.`
      : 'Aucune commande active ne présente de risque de retard significatif.',
    inventoryToWatch.length > 0
      ? `${inventoryToWatch.length} référence(s) de stock sont sous surveillance ou proches du seuil de réapprovisionnement.`
      : 'Les niveaux de stock suivis ne présentent pas de risque immédiat.',
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Rapport quotidien"
        description={`Synthèse opérationnelle du ${formatDateLong(context.capturedAt)} — situation arrêtée à ${formatTime(context.capturedAt)}.`}
        action={<ReportActions />}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetric
          icon={<Activity className="size-4" />}
          label="Santé de l’usine"
          value={`${context.health.global} / 100`}
          detail={context.healthVariation ?? 'Score calculé sur les données opérationnelles du jour'}
          severity={context.healthSeverity}
        />
        <ReportMetric
          icon={<Factory className="size-4" />}
          label="Production"
          value={formatPercent(context.production.achievementPct)}
          detail={`${formatNumber(context.production.producedUnits)} / ${formatNumber(context.production.targetUnits)} pièces`}
          severity={context.production.achievementPct >= 90 ? 'normal' : 'warning'}
        />
        <ReportMetric
          icon={<PackageCheck className="size-4" />}
          label="Machines en production"
          value={`${machinesInProduction} / ${context.machines.length}`}
          detail={`${machinesUnavailable} indisponible(s) · ${formatDuration(downtimeMinutes)} d’arrêts`}
          severity={machinesUnavailable > 0 ? 'critical' : 'normal'}
        />
        <ReportMetric
          icon={<AlertTriangle className="size-4" />}
          label="Commandes à risque"
          value={String(atRiskOrders.length)}
          detail={`${context.orders.length} commande(s) active(s) analysée(s)`}
          severity={atRiskOrders.length > 0 ? 'warning' : 'normal'}
        />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Synthèse de la journée"
            subtitle="Lecture automatique des principaux points opérationnels"
            action={<DataOrigin origin="computed" />}
          />
          <ul className="space-y-3 px-5 pb-5">
            {summary.map((line, index) => (
              <li key={line} className="flex gap-3 text-sm leading-6 text-fg-muted">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                  {index + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Équilibre de l’usine"
            subtitle="Sous-scores composant la santé globale"
            action={<StatusBadge severity={context.healthSeverity}>{context.health.global} / 100</StatusBadge>}
          />
          <div className="space-y-3 px-5 pb-5">
            {context.health.dimensions.map((dimension) => (
              <div key={dimension.dimension}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-fg-muted">{dimension.label}</span>
                  <span className="tabular font-semibold text-fg">{dimension.score}</span>
                </div>
                <Progress
                  className="mt-1.5"
                  value={dimension.score}
                  severity={
                    dimension.score >= 85
                      ? 'normal'
                      : dimension.score >= 70
                        ? 'info'
                        : dimension.score >= 50
                          ? 'warning'
                          : 'critical'
                  }
                  label={dimension.label}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader
          title="Performance par atelier"
          subtitle="Réalisation de l’objectif et disponibilité des moyens de production"
        />
        <Table>
          <thead>
            <tr>
              <Th>Atelier</Th>
              <Th numeric>Objectif</Th>
              <Th numeric>Réalisé</Th>
              <Th numeric>Écart</Th>
              <Th className="w-[190px]">Réalisation</Th>
              <Th numeric>Machines disponibles</Th>
            </tr>
          </thead>
          <tbody>
            {context.workshops.map((workshop) => {
              const area = getFactoryAreaByWorkshopCode(workshop.code);
              const gap = workshop.producedUnits - workshop.targetUnits;

              return (
                <Tr key={workshop.id}>
                  <Td>
                    {area ? (
                      <Link href={`/ateliers/${area.slug}`} className="font-medium hover:text-brand">
                        {area.shortLabel}
                      </Link>
                    ) : (
                      <span className="font-medium">{workshop.name}</span>
                    )}
                    <span className="block text-xs text-fg-subtle">{workshop.name}</span>
                  </Td>
                  <Td numeric className="text-fg-muted">
                    {formatNumber(workshop.targetUnits)}
                  </Td>
                  <Td numeric>{formatNumber(workshop.producedUnits)}</Td>
                  <Td
                    className={cn(
                      'tabular text-right font-medium',
                      gap >= 0 ? 'text-normal' : 'text-warning',
                    )}
                  >
                    {gap > 0 ? '+' : ''}
                    {formatNumber(gap)}
                  </Td>
                  <Td>
                    <span className={cn('tabular mb-1 block text-xs font-medium', SEVERITY_TEXT[workshop.severity])}>
                      {workshop.achievementPct} %
                    </span>
                    <Progress
                      value={workshop.achievementPct}
                      severity={workshop.severity}
                      label={`Réalisation ${area?.shortLabel ?? workshop.name}`}
                    />
                  </Td>
                  <Td numeric className="text-fg-muted">
                    {workshop.machinesTotal - workshop.machinesDown} / {workshop.machinesTotal}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Commandes à surveiller"
            subtitle="Classement par niveau de risque de retard"
          />
          {atRiskOrders.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Commande</Th>
                  <Th>Client</Th>
                  <Th>Échéance</Th>
                  <Th numeric>Avancement</Th>
                  <Th numeric>Risque</Th>
                </tr>
              </thead>
              <tbody>
                {atRiskOrders.slice(0, 6).map((order) => (
                  <Tr key={order.id}>
                    <Td>
                      <Link href={`/commandes/${order.id}`} className="font-medium hover:text-brand">
                        #{order.number}
                      </Link>
                      <span className="block max-w-[180px] truncate text-xs text-fg-subtle">
                        {order.productNames.join(', ')}
                      </span>
                    </Td>
                    <Td className="text-fg-muted">{order.customerName}</Td>
                    <Td className="text-fg-muted">
                      {formatDueDelta(order.dueAt, context.capturedAt)}
                    </Td>
                    <Td numeric>{formatPercent(order.progressPct)}</Td>
                    <Td className="text-right">
                      <StatusBadge severity={order.severity} size="sm">
                        {formatPercent(order.riskPct)}
                      </StatusBadge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-5 text-sm text-fg-muted">Aucune commande à risque aujourd’hui.</p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Stocks sous surveillance"
            subtitle="Articles nécessitant un contrôle ou un réapprovisionnement"
          />
          {inventoryToWatch.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Article</Th>
                  <Th numeric>Disponible</Th>
                  <Th numeric>Seuil</Th>
                  <Th numeric>Couverture</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {inventoryToWatch.slice(0, 6).map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <span className="font-medium">{item.name}</span>
                      <span className="block text-xs text-fg-subtle">{item.sku}</span>
                    </Td>
                    <Td numeric>{formatNumber(item.available)}</Td>
                    <Td numeric className="text-fg-muted">
                      {formatNumber(item.reorderPoint)}
                    </Td>
                    <Td numeric className="text-fg-muted">
                      {item.coverageDays > 90 ? '> 90 j' : `${item.coverageDays} j`}
                    </Td>
                    <Td>
                      <StatusBadge severity={item.severity} size="sm">
                        {item.severity === 'critical' ? 'Critique' : 'À surveiller'}
                      </StatusBadge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-5 text-sm text-fg-muted">Aucun stock sous surveillance.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Alertes ouvertes" subtitle="Événements nécessitant une attention opérationnelle" />
          <div className="space-y-2 px-5 pb-5">
            {context.alerts.slice(0, 6).map((alert) => (
              <Link
                key={alert.id}
                href="/alertes"
                className="flex items-center justify-between gap-3 rounded-md border border-line p-3 transition-colors hover:bg-surface-sunken"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{alert.domain}</p>
                </div>
                <StatusBadge severity={alert.severity} size="sm">
                  {alert.severity === 'critical' ? 'Critique' : 'Attention'}
                </StatusBadge>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Personnel" subtitle="Présence et qualifications de l’équipe" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
            <div className="rounded-md border border-line bg-surface-sunken p-4">
              <p className="text-xs text-fg-subtle">Présents</p>
              <p className="tabular mt-2 text-2xl font-semibold text-fg">
                {context.staff.present} / {context.staff.required}
              </p>
            </div>
            <div className="rounded-md border border-line bg-surface-sunken p-4">
              <p className="text-xs text-fg-subtle">Absents aujourd’hui</p>
              <p className="tabular mt-2 text-2xl font-semibold text-fg">
                {context.staff.absentToday.length}
              </p>
            </div>
            <div className="rounded-md border border-line bg-surface-sunken p-4">
              <p className="text-xs text-fg-subtle">Qualifications à renouveler</p>
              <p className="tabular mt-2 text-2xl font-semibold text-fg">
                {context.staff.expiringQualifications.length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <p className="mt-5 text-center text-xs text-fg-subtle">
        Rapport généré automatiquement à {formatTime(context.capturedAt)} à partir des données de
        production, machines, commandes, stocks et personnel.
      </p>
    </div>
  );
}

function ReportMetric({
  icon,
  label,
  value,
  detail,
  severity,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  severity: 'normal' | 'info' | 'warning' | 'critical';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-fg-muted">
          <span className="grid size-7 place-items-center rounded-md bg-surface-sunken">{icon}</span>
          <span className="text-[0.75rem] font-medium">{label}</span>
        </div>
        <StatusBadge severity={severity} size="sm">
          {severity === 'normal'
            ? 'Normal'
            : severity === 'critical'
              ? 'Critique'
              : severity === 'warning'
                ? 'Attention'
                : 'Information'}
        </StatusBadge>
      </div>
      <p className={cn('tabular mt-3 text-[1.625rem] leading-none font-semibold', SEVERITY_TEXT[severity])}>
        {value}
      </p>
      <p className="mt-2 text-[0.6875rem] leading-5 text-fg-subtle">{detail}</p>
    </Card>
  );
}
