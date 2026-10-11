import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { previewFeasibility } from '@/server/services/orders';
import { CreateOrderConfirm } from './confirm-form';
import {
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  buttonClass,
} from '@/components/ui/primitives';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Nouvelle commande' };
export const dynamic = 'force-dynamic';

const VERDICT_LABELS = {
  feasible: { label: 'Commande réalisable', severity: 'normal' as const },
  feasible_with_risk: { label: 'Réalisable avec risque', severity: 'warning' as const },
  not_feasible: { label: 'Non réalisable en l’état', severity: 'critical' as const },
};

const CHECK_ICONS = { ok: '✅', warning: '⚠️', blocked: '❌' } as const;

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ produit?: string; quantite?: string; date?: string; priorite?: string }>;
}) {
  await requirePermission('orders:write');
  const query = await searchParams;

  const db = await getDb();
  const [customers, products] = await Promise.all([
    db.select().from(t.customers).orderBy(t.customers.name),
    db.select().from(t.products).orderBy(t.products.name),
  ]);

  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 14);
  const defaultDateValue = defaultDate.toISOString().slice(0, 10);

  const productId = query.produit ?? products[0]?.id;
  const quantity = Number(query.quantite ?? 0);
  const dateValue = query.date ?? defaultDateValue;

  // L'analyse de faisabilité (§18) est calculée côté serveur dès qu'une
  // quantité est saisie : aucune promesse client n'est faite à l'aveugle.
  const feasibility =
    productId && quantity > 0
      ? await previewFeasibility(productId, quantity, new Date(`${dateValue}T17:00:00`))
      : null;

  const selectedProduct = products.find((product) => product.id === productId);
  const customerId = selectedProduct?.customerId ?? customers[0]?.id;

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link
        href="/commandes"
        className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Retour aux commandes
      </Link>

      <PageHeader
        title="Nouvelle commande"
        description="Le stock disponible est réservé dès la création. Le reste devient la quantité à produire."
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Besoin client"
            subtitle="Renseignez le besoin, l’analyse de faisabilité se met à jour"
          />
          {/* Formulaire d'analyse : simple navigation GET, entièrement serveur. */}
          <form method="get" className="space-y-4 px-5 pb-5">
            <Field label="Pièce" htmlFor="produit">
              <Select id="produit" name="produit" defaultValue={productId}>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} — {product.reference}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantité (pièces)" htmlFor="quantite">
                <Input
                  id="quantite"
                  name="quantite"
                  type="number"
                  min={1}
                  defaultValue={quantity > 0 ? quantity : ''}
                  placeholder="10000"
                />
              </Field>
              <Field label="Date souhaitée" htmlFor="date">
                <Input id="date" name="date" type="date" defaultValue={dateValue} />
              </Field>
            </div>

            <button type="submit" className={buttonClass('secondary', 'md')}>
              Analyser la faisabilité
            </button>
          </form>
        </Card>

        <div className="lg:col-span-5">
          {feasibility ? (
            <Card>
              <CardHeader title="Analyse de faisabilité" subtitle={feasibility.productName} />
              <div className="space-y-4 px-5 pb-5">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge severity={VERDICT_LABELS[feasibility.verdict].severity}>
                    {VERDICT_LABELS[feasibility.verdict].label}
                  </StatusBadge>
                  <span className="text-[0.8125rem] text-fg-muted">
                    Risque de retard{' '}
                    <span className="tabular font-semibold">{formatPercent(feasibility.riskPct)}</span>
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-[0.8125rem]">
                  <div>
                    <dt className="text-fg-subtle">Réservable en stock</dt>
                    <dd className="tabular font-medium text-normal">
                      {formatNumber(feasibility.reservable)} pièces
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">À produire</dt>
                    <dd className="tabular font-medium text-fg">
                      {formatNumber(feasibility.toProduce)} pièces
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Temps nécessaire</dt>
                    <dd className="tabular font-medium text-fg">
                      {feasibility.requiredHours.toLocaleString('fr-FR')} h
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Temps disponible</dt>
                    <dd className="tabular font-medium text-fg">
                      {feasibility.availableHours.toLocaleString('fr-FR')} h
                    </dd>
                  </div>
                </dl>

                <ul className="space-y-1.5 border-t border-line pt-3">
                  {feasibility.checks.map((check) => (
                    <li key={check.key} className="flex items-start gap-2 text-[0.8125rem]">
                      <span aria-hidden>{CHECK_ICONS[check.status]}</span>
                      <span>
                        <span className="font-medium text-fg">{check.label}</span>
                        <span className="block text-xs text-fg-muted">{check.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {feasibility.machineOptions.length > 0 ? (
                  <div className="border-t border-line pt-3">
                    <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                      Machines candidates
                    </p>
                    <ul className="space-y-1 text-[0.8125rem]">
                      {feasibility.machineOptions.map((machine) => (
                        <li key={machine.machineCode} className="flex justify-between gap-3">
                          <span className={cn(!machine.isOperational && 'text-fg-subtle line-through')}>
                            {machine.machineCode}
                          </span>
                          <span className="tabular text-fg-muted">
                            {machine.totalHoursNeeded.toLocaleString('fr-FR')} h
                            {machine.fits ? '' : ' · ne rentre pas'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-fg-muted">
                Saisissez une pièce, une quantité et une date, puis lancez l’analyse : KS Plastico Demo
                vérifiera le stock, les palettes, les machines compatibles et la capacité restante
                avant l’échéance.
              </p>
            </Card>
          )}
        </div>
      </div>

      {feasibility && customerId ? (
        <Card className="mt-5">
          <CardHeader
            title="Confirmer la commande"
            subtitle="La réservation de stock est effectuée immédiatement et tracée"
          />
          <CreateOrderConfirm
            customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
            defaultCustomerId={customerId}
            productId={productId!}
            quantityUnits={quantity}
            dueAt={dateValue}
            reservable={feasibility.reservable}
            toProduce={feasibility.toProduce}
          />
        </Card>
      ) : null}

    </div>
  );
}
