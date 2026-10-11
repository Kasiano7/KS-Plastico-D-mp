import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { getFactoryContext } from '@/server/services/factory-context';
import { computeProfitability } from '@/server/domain/costing';
import {
  Card,
  CardHeader,
  DataOrigin,
  PageHeader,
  Progress,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatCents, formatCentsPrecise, formatDate, formatNumber, formatPercent } from '@/lib/format';


export async function TrendsView() {
  const user = await requirePermission('analytics:read');
  const canSeeFinancials = can(user.permissions, 'finance:read');
  const db = await getDb();
  const context = await getFactoryContext();

  const [snapshots, productStats] = await Promise.all([
    db.select().from(t.healthSnapshots).orderBy(desc(t.healthSnapshots.capturedAt)).limit(8),
    db
      .select({
        id: t.products.id,
        name: t.products.name,
        reference: t.products.reference,
        unitCostCents: t.products.unitCostCents,
        unitPriceCents: t.products.unitPriceCents,
        produced: sql<number>`coalesce(sum(${t.productionOrders.producedUnits}), 0)::int`,
      })
      .from(t.products)
      .leftJoin(t.productionOrders, eq(t.productionOrders.productId, t.products.id))
      .groupBy(t.products.id)
      .orderBy(t.products.name),
  ]);

  const history = [...snapshots].reverse();
  const ranked = productStats
    .map((product) => ({
      ...product,
      profitability: computeProfitability(
        product.unitCostCents,
        product.unitPriceCents,
        product.produced,
      ),
    }))
    .sort((a, b) => b.profitability.returnOnCostPct - a.profitability.returnOnCostPct);

  const totalContribution = ranked.reduce(
    (total, product) => total + product.profitability.contributionCents,
    0,
  );

  const maxScore = 100;

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Analyse / KPI"
        description="Tendances du score de santé, performance des ateliers et rentabilité par référence."
      />

      <div className="mb-5 grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="Évolution du score de santé"
            subtitle="Relevés historisés — la valeur du jour est recalculée en direct"
          />
          <div className="px-5 pb-5">
            <div className="flex h-40 items-end gap-2">
              {[...history, { id: 'now', capturedAt: context.capturedAt, globalScore: context.health.global }].map(
                (snapshot) => (
                  <div key={snapshot.id} className="flex flex-1 flex-col items-center gap-2">
                    <span className="tabular text-[0.6875rem] font-medium text-fg-muted">
                      {snapshot.globalScore}
                    </span>
                    <div
                      className={cn(
                        'w-full rounded-t-md',
                        snapshot.id === 'now' ? 'bg-brand' : 'bg-brand/35',
                      )}
                      style={{ height: `${(snapshot.globalScore / maxScore) * 100}%` }}
                    />
                    <span className="text-[0.625rem] text-fg-subtle">
                      {snapshot.id === 'now' ? "Auj." : formatDate(snapshot.capturedAt).slice(0, 5)}
                    </span>
                  </div>
                ),
              )}
            </div>
            {context.healthVariation ? (
              <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] text-fg-muted">
                {context.healthVariation}
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title="Sous-scores du jour" action={<DataOrigin origin="computed" />} />
          <div className="space-y-3 px-5 pb-5">
            {context.health.dimensions.map((dimension) => (
              <div key={dimension.dimension}>
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-fg">{dimension.label}</span>
                  <span className="tabular font-medium text-fg">{dimension.score}</span>
                </div>
                <Progress
                  value={dimension.score}
                  severity={
                    dimension.score >= 85 ? 'normal' : dimension.score >= 70 ? 'info' : 'warning'
                  }
                  className="mt-1.5"
                  label={dimension.label}
                />
                <p className="mt-1 text-[0.6875rem] text-fg-subtle">{dimension.explanation}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader title="Performance des ateliers" subtitle="Réalisation du jour et machines en service" />
        <Table>
          <thead>
            <tr>
              <Th>Atelier</Th>
              <Th numeric>Objectif</Th>
              <Th numeric>Réalisé</Th>
              <Th numeric>Écart</Th>
              <Th className="w-[180px]">Réalisation</Th>
              <Th numeric>Machines en service</Th>
            </tr>
          </thead>
          <tbody>
            {context.workshops.map((workshop) => (
              <Tr key={workshop.id}>
                <Td className="font-medium">{workshop.name}</Td>
                <Td numeric className="text-fg-muted">
                  {formatNumber(workshop.targetUnits)}
                </Td>
                <Td numeric>{formatNumber(workshop.producedUnits)}</Td>
                <Td
                  className={cn(
                    'tabular text-right',
                    workshop.producedUnits >= workshop.targetUnits ? 'text-normal' : 'text-warning',
                  )}
                >
                  {workshop.producedUnits - workshop.targetUnits >= 0 ? '+' : ''}
                  {formatNumber(workshop.producedUnits - workshop.targetUnits)}
                </Td>
                <Td>
                  <span className={cn('tabular mb-1 block text-xs font-medium', SEVERITY_TEXT[workshop.severity])}>
                    {workshop.achievementPct} %
                  </span>
                  <Progress
                    value={workshop.achievementPct}
                    severity={workshop.severity}
                    label={`Réalisation ${workshop.name}`}
                  />
                </Td>
                <Td numeric className="text-fg-muted">
                  {workshop.machinesTotal - workshop.machinesDown} / {workshop.machinesTotal}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {canSeeFinancials ? (
        <Card>
          <CardHeader
            title="Rentabilité par référence"
            subtitle={`Contribution cumulée ${formatCents(totalContribution)} sur la production enregistrée`}
            action={<DataOrigin origin="computed" />}
          />
          <Table>
            <thead>
              <tr>
                <Th>Référence</Th>
                <Th numeric>Coût unitaire</Th>
                <Th numeric>Prix de vente</Th>
                <Th numeric>Marge unitaire</Th>
                <Th numeric>Rentabilité sur coût</Th>
                <Th numeric>Volume produit</Th>
                <Th numeric>Contribution</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((product) => (
                <Tr key={product.id}>
                  <Td>
                    <Link href={`/catalogue/${product.id}`} className="font-medium hover:text-brand">
                      {product.name}
                    </Link>
                    <span className="block text-xs text-fg-subtle">{product.reference}</span>
                  </Td>
                  <Td numeric className="text-fg-muted">
                    {formatCentsPrecise(product.unitCostCents)}
                  </Td>
                  <Td numeric className="text-fg-muted">
                    {formatCentsPrecise(product.unitPriceCents)}
                  </Td>
                  <Td numeric>
                    {formatCentsPrecise(product.profitability.unitMarginCents)}
                  </Td>
                  <Td
                    className={cn(
                      'tabular text-right font-semibold',
                      product.profitability.returnOnCostPct >= 60
                        ? 'text-normal'
                        : product.profitability.returnOnCostPct >= 30
                          ? 'text-info'
                          : 'text-warning',
                    )}
                  >
                    {formatPercent(product.profitability.returnOnCostPct, 1)}
                  </Td>
                  <Td numeric className="text-fg-muted">{formatNumber(product.produced)}</Td>
                  <Td numeric className="font-medium">
                    {formatCents(product.profitability.contributionCents)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <Card className="p-6">
          <p className="text-sm text-fg-muted">
            L’analyse de rentabilité est réservée aux profils disposant de l’accès financier.
          </p>
        </Card>
      )}
    </div>
  );
}
