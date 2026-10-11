import type { Metadata } from 'next';
import { Box, CalendarDays, FileCheck2, Wrench } from 'lucide-react';
import { COMPANY_MOLDS, MOLD_PRESS_NUMBERS, MOLD_SOURCE } from '@/data/company-molds';
import { Card, PageHeader } from '@/components/ui/primitives';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { MoldsCatalog } from './molds-catalog';

export const metadata: Metadata = { title: 'Moules' };
/*
 * Cette page ne lit du parc que l'identifiant, le code et le nom des presses —
 * jamais leur état, qui lui change en continu. Ces trois champs ne bougent
 * qu'à la création, la modification ou le retrait d'une machine, trois actions
 * qui invalident désormais cette page.
 */
export const revalidate = 300;

export default async function MoldsPage() {
  await requirePermission('catalog:read');
  const db = await getDb();
  const machineRows = await db.select({ id: t.machines.id, code: t.machines.code, name: t.machines.name }).from(t.machines);
  const machines = machineRows
    .map((machine) => ({ id: machine.id, press: machine.code.match(/PR-(\d+)/)?.[1] ?? '', name: machine.name }))
    .filter((machine) => Number(machine.press) >= 59 && Number(machine.press) <= 67)
    .sort((a, b) => Number(a.press) - Number(b.press));
  const partCount = COMPANY_MOLDS.reduce((total, mold) => total + mold.parts.length, 0);

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Moules" description="Référentiel des moules de l’entreprise, des pièces associées et des presses sur lesquelles l’injection est autorisée." />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ['Moules référencés', COMPANY_MOLDS.length, Box],
          ['Fiches pièces', partCount, FileCheck2],
          ['Presses couvertes', MOLD_PRESS_NUMBERS.length, Wrench],
          ['Date du relevé', MOLD_SOURCE.date, CalendarDays],
        ] as const).map(([label, value, Icon]) => (
          <Card key={String(label)} className="p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-fg-muted">{String(label)}</p><p className="tabular mt-2 text-2xl font-semibold text-fg">{String(value)}</p></div><span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="size-4" aria-hidden /></span></div>
          </Card>
        ))}
      </div>

      <Card className="mb-5 border-info/30 bg-info-soft p-4">
        <p className="text-sm font-medium text-fg">Source : {MOLD_SOURCE.reference} · page {MOLD_SOURCE.page} · {MOLD_SOURCE.date}</p>
        <p className="mt-1 text-xs leading-5 text-fg-muted">Les cases rouges du tableau source (« injection interdite ») sont exclues. Les poids, références ou emplacements illisibles restent volontairement indiqués comme non renseignés.</p>
      </Card>

      <MoldsCatalog molds={COMPANY_MOLDS} machines={machines} />
    </div>
  );
}
