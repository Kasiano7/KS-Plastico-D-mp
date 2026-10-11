import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { asc } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { listMachinePhotos } from '@/server/services/machine-photos';
import { MachineEditor } from '@/components/machines/machine-editor';
import { PageHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Nouvelle machine' };
export const dynamic = 'force-dynamic';

export default async function NewMachinePage() {
  await requirePermission('admin:write');

  const db = await getDb();
  const [workshops, photos] = await Promise.all([
    db
      .select({ id: t.workshops.id, name: t.workshops.name })
      .from(t.workshops)
      .orderBy(asc(t.workshops.name)),
    listMachinePhotos(),
  ]);

  return (
    <div className="mx-auto max-w-[900px]">
      <Link
        href="/machines"
        className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Parc machines
      </Link>

      <PageHeader
        title="Nouvelle machine"
        description="Connectez une nouvelle presse au parc. Elle apparaîtra immédiatement dans la liste et pourra être planifiée."
      />

      <MachineEditor machine={null} workshops={workshops} photos={photos} mode="create" />
    </div>
  );
}
