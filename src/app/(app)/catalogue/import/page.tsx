import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/session';
import { PageHeader } from '@/components/ui/primitives';
import { CatalogImporter } from './catalog-importer';

export const metadata: Metadata = { title: 'Import assisté du catalogue' };
export const dynamic = 'force-dynamic';

export default async function CatalogImportPage() {
  await requirePermission('catalog:write');

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Importer des références"
        description="Déposez un fichier Excel, un CSV ou une photo. KS Plastico Demo prépare les fiches et attend votre validation avant toute création."
      />
      <CatalogImporter />
    </div>
  );
}
