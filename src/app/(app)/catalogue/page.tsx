import type { Metadata } from 'next';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { computeProfitability } from '@/server/domain/costing';
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
  buttonClass,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatCentsPrecise, formatNumber, formatPercent } from '@/lib/format';

export const metadata: Metadata = { title: 'Catalogue' };
/*
 * Référentiel : pièces, moules et matières changent une fois par semaine, pas
 * toutes les secondes. Cinq minutes de cache, et l'import de catalogue
 * invalide déjà cette page explicitement (`revalidatePath('/catalogue')`) —
 * une création reste donc visible immédiatement.
 */
export const revalidate = 300;

const MOLD_STATUS_LABELS: Record<string, string> = {
  available: 'Disponible',
  mounted: 'Monté',
  maintenance: 'Maintenance',
  retired: 'Retiré',
};

export default async function CatalogPage() {
  const user = await requirePermission('catalog:read');
  const canSeeFinancials = can(user.permissions, 'finance:read');
  const db = await getDb();

  const [products, molds, materials] = await Promise.all([
    db
      .select({
        id: t.products.id,
        reference: t.products.reference,
        name: t.products.name,
        family: t.products.family,
        weightGrams: t.products.weightGrams,
        cycleTimeSeconds: t.products.cycleTimeSeconds,
        unitsPerPallet: t.products.unitsPerPallet,
        unitCostCents: t.products.unitCostCents,
        unitPriceCents: t.products.unitPriceCents,
        customerName: t.customers.name,
        materialName: t.materials.name,
        moldReference: t.molds.reference,
      })
      .from(t.products)
      .leftJoin(t.customers, eq(t.products.customerId, t.customers.id))
      .leftJoin(t.materials, eq(t.products.materialId, t.materials.id))
      .leftJoin(t.molds, eq(t.products.moldId, t.molds.id))
      .orderBy(t.products.family, t.products.name),
    db.select().from(t.molds).orderBy(t.molds.reference),
    db.select().from(t.materials).orderBy(t.materials.name),
  ]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Catalogue industriel"
        description="Référentiel central des pièces, moules et matières — la source unique utilisée par le planning, les coûts et la production."
        action={
          can(user.permissions, 'catalog:write') ? (
            <Link href="/catalogue/import" className={buttonClass('primary')}>
              <Upload className="size-4" />
              Importer par IA
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-5">
        <CardHeader title="Pièces" subtitle={`${products.length} références actives`} />
        <Table>
          <thead>
            <tr>
              <Th>Pièce</Th>
              <Th>Famille</Th>
              <Th>Client</Th>
              <Th>Matière</Th>
              <Th>Moule</Th>
              <Th numeric>Poids</Th>
              <Th numeric>Cycle</Th>
              <Th numeric>Pièces/palette</Th>
              {canSeeFinancials ? <Th numeric>Coût</Th> : null}
              {canSeeFinancials ? <Th numeric>Vente</Th> : null}
              {canSeeFinancials ? <Th numeric>Rentabilité</Th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const profitability = computeProfitability(product.unitCostCents, product.unitPriceCents);
              return (
                <Tr key={product.id}>
                  <Td>
                    <Link href={`/catalogue/${product.id}`} className="font-medium hover:text-brand">
                      {product.name}
                    </Link>
                    <span className="block text-xs text-fg-subtle">{product.reference}</span>
                  </Td>
                  <Td className="text-fg-muted">{product.family}</Td>
                  <Td className="text-fg-muted">{product.customerName ?? '—'}</Td>
                  <Td className="text-fg-muted">{product.materialName ?? '—'}</Td>
                  <Td className="text-fg-muted">{product.moldReference ?? '—'}</Td>
                  <Td numeric className="text-fg-muted">
                    {(product.weightGrams / 1000).toLocaleString('fr-FR')} kg
                  </Td>
                  <Td numeric className="text-fg-muted">{product.cycleTimeSeconds} s</Td>
                  <Td numeric className="text-fg-muted">
                    {formatNumber(product.unitsPerPallet)}
                  </Td>
                  {canSeeFinancials ? (
                    <Td numeric>{formatCentsPrecise(product.unitCostCents)}</Td>
                  ) : null}
                  {canSeeFinancials ? (
                    <Td numeric>{formatCentsPrecise(product.unitPriceCents)}</Td>
                  ) : null}
                  {canSeeFinancials ? (
                    <Td
                      className={cn(
                        'tabular text-right font-medium',
                        profitability.returnOnCostPct >= 60
                          ? 'text-normal'
                          : profitability.returnOnCostPct >= 30
                            ? 'text-info'
                            : 'text-warning',
                      )}
                    >
                      {formatPercent(profitability.returnOnCostPct, 1)}
                    </Td>
                  ) : null}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Moules" subtitle="Chaque moule est une ressource à part entière" />
          <Table>
            <thead>
              <tr>
                <Th>Référence</Th>
                <Th>Pièce produite</Th>
                <Th>État</Th>
                <Th>Emplacement</Th>
                <Th numeric>Empreintes</Th>
                <Th numeric>Changement</Th>
              </tr>
            </thead>
            <tbody>
              {molds.map((mold) => (
                <Tr key={mold.id}>
                  <Td className="font-medium">{mold.reference}</Td>
                  <Td className="text-fg-muted">{mold.name}</Td>
                  <Td>
                    <Badge tone={mold.status === 'mounted' ? 'brand' : 'neutral'}>
                      {MOLD_STATUS_LABELS[mold.status] ?? mold.status}
                    </Badge>
                  </Td>
                  <Td className="text-fg-muted">{mold.location ?? '—'}</Td>
                  <Td numeric className="text-fg-muted">{mold.cavities}</Td>
                  <Td numeric className="text-fg-muted">
                    {Math.round((mold.changeoverMinutes / 60) * 10) / 10} h
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Matières" subtitle="Coût matière utilisé dans le prix de revient" />
          <Table>
            <thead>
              <tr>
                <Th>Matière</Th>
                <Th>Famille</Th>
                <Th>Couleur</Th>
                {canSeeFinancials ? <Th numeric>Coût / kg</Th> : null}
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <Tr key={material.id}>
                  <Td className="font-medium">{material.name}</Td>
                  <Td className="text-fg-muted">{material.family}</Td>
                  <Td className="text-fg-muted">{material.color ?? '—'}</Td>
                  {canSeeFinancials ? (
                    <Td numeric>
                      {formatCentsPrecise(material.costCentsPerKg)}
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
