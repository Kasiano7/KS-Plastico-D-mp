import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { attachmentHeader, documentPreviewKind, inlineHeader } from '@/server/domain/documents';

/**
 * Consultation d'un document machine — affichage ou téléchargement.
 *
 * `?vue=1` demande un affichage dans le navigateur. La demande n'est honorée
 * que si le format figure dans la liste fermée des formats affichables : c'est
 * le serveur qui tranche, jamais le lien. Un `.html` déposé en base ne pourra
 * donc pas s'exécuter dans la session de celui qui le consulte, même si
 * quelqu'un forge l'URL.
 *
 * La permission est revérifiée ici comme pour tout export : une URL reste une
 * porte d'entrée, même si le lien qui y mène est masqué à l'écran.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  await requirePermission('machines:read');

  const { id, documentId } = await params;
  const db = await getDb();
  const [document] = await db
    .select()
    .from(t.machineDocuments)
    .where(eq(t.machineDocuments.id, documentId))
    .limit(1);

  if (!document || document.machineId !== id) {
    return new NextResponse('Document introuvable', { status: 404 });
  }

  const buffer = Buffer.from(document.contentBase64, 'base64');
  const wantsInline = new URL(request.url).searchParams.get('vue') === '1';
  const inline = wantsInline && documentPreviewKind(document.mimeType) !== null;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Disposition': inline
        ? inlineHeader(document.fileName)
        : attachmentHeader(document.fileName),
      'Content-Length': String(buffer.byteLength),
      // Sans cet en-tête, le navigateur pourrait deviner un type autre que
      // celui déclaré et rendre en HTML un fichier qui n'en est pas.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
