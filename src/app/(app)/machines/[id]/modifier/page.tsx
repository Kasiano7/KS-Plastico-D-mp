import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { listMachinePhotos } from '@/server/services/machine-photos';
import { MachineEditor } from '@/components/machines/machine-editor';
import { PageHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Modifier la machine' };
export const dynamic = 'force-dynamic';

export default async function EditMachinePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('machines:write');
  const { id } = await params;

  const db = await getDb();
  const [[machine], workshops, photos] = await Promise.all([
    db.select().from(t.machines).where(eq(t.machines.id, id)).limit(1),
    db.select({ id: t.workshops.id, name: t.workshops.name }).from(t.workshops).orderBy(asc(t.workshops.name)),
    listMachinePhotos(),
  ]);
  if (!machine) notFound();

  return (
    <div className="max-w-[900px]">
      <PageHeader
        title={`Modifier ${machine.name}`}
        description="Plaque signalétique, atelier et paramètres de coût. Le changement d'état de la presse se fait depuis l'onglet Arrêts."
      />
      <MachineEditor machine={machine} workshops={workshops} photos={photos} mode="edit" />
    </div>
  );
}
