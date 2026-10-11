import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { FileText } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { can } from '@/server/domain/permissions';
import { documentPreviewKind } from '@/server/domain/documents';
import { getMachineOverview } from '@/server/services/machine-overview';
import { Panel } from '@/components/machines/overview-cards';
import {
  DOCUMENT_CATEGORY_LABELS,
  DeleteDocumentButton,
  DocumentUploadForm,
} from '@/components/machines/document-upload-form';
import { formatDateTime, formatFileSize } from '@/lib/format';

export const metadata: Metadata = { title: 'Documents machine' };
export const dynamic = 'force-dynamic';

export default async function MachineDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('machines:read');
  const { id } = await params;
  const machine = await getMachineOverview(id);
  if (!machine) notFound();

  const canWrite = can(user.permissions, 'machines:write');

  const db = await getDb();
  const documents = await db
    .select()
    .from(t.machineDocuments)
    .where(eq(t.machineDocuments.machineId, id))
    .orderBy(desc(t.machineDocuments.uploadedAt));

  const identity = [
    { label: 'Constructeur', value: machine.manufacturer ?? '—' },
    { label: 'Modèle', value: machine.model ?? '—' },
    { label: 'Numéro de série', value: machine.nameplate.serialNumber ?? '—' },
    {
      label: 'Année de fabrication',
      value: machine.nameplate.manufacturingYear ? String(machine.nameplate.manufacturingYear) : '—',
    },
    {
      label: 'Logiciel de contrôle',
      value: [machine.nameplate.controlSoftware, machine.nameplate.controlSoftwareVersion]
        .filter(Boolean)
        .join(' ') || '—',
    },
    { label: 'Atelier', value: machine.workshopName },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <Panel
        title="Documentation de la presse"
        hint={`${documents.length} document${documents.length > 1 ? 's' : ''}`}
        action={canWrite ? <DocumentUploadForm machineId={id} /> : null}
      >
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <FileText className="size-6 text-fg-subtle" aria-hidden />
            <p className="text-[0.9375rem] font-medium text-fg">Aucun document déposé pour cette presse</p>
            <p className="max-w-md text-[0.8125rem] leading-6 text-fg-muted">
              Notices constructeur, plans électriques, fiches de réglage et rapports d’intervention
              peuvent être rattachés ici.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  {/*
                    Le nom ouvre le document dans un nouvel onglet quand le
                    format s'affiche ; sinon il ne peut que se télécharger.
                  */}
                  <a
                    href={
                      documentPreviewKind(document.mimeType)
                        ? `/machines/${id}/documents/${document.id}?vue=1`
                        : `/machines/${id}/documents/${document.id}`
                    }
                    target={documentPreviewKind(document.mimeType) ? '_blank' : undefined}
                    rel="noreferrer"
                    className="block truncate text-[0.875rem] font-medium text-brand hover:underline"
                  >
                    {document.fileName}
                  </a>
                  <p className="mt-0.5 text-[0.75rem] text-fg-muted">
                    {DOCUMENT_CATEGORY_LABELS[document.category] ?? document.category} ·{' '}
                    {formatFileSize(document.sizeBytes)} · déposé le {formatDateTime(document.uploadedAt)}
                    {document.uploadedByLabel ? ` par ${document.uploadedByLabel}` : ''}
                  </p>
                </div>
                {canWrite ? (
                  <DeleteDocumentButton documentId={document.id} fileName={document.fileName} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="space-y-4">
        <Panel title="Plaque signalétique" hint="Informations constructeur enregistrées">
          <dl className="space-y-3">
            {identity.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-[0.8125rem] text-fg-muted">{row.label}</dt>
                <dd className="tabular truncate text-right text-[0.8125rem] font-medium text-fg">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Documents rattachés ailleurs">
          <ul className="space-y-2 text-[0.8125rem]">
            <li>
              <Link
                href={`/machines/${id}/maintenance`}
                prefetch={false}
                className="text-brand hover:underline"
              >
                Plan de maintenance de la presse
              </Link>
            </li>
            <li>
              <Link href="/moules" prefetch={false} className="text-brand hover:underline">
                Fiches des moules compatibles
              </Link>
            </li>
            <li>
              <Link href="/catalogue" prefetch={false} className="text-brand hover:underline">
                Fiches des pièces produites
              </Link>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
