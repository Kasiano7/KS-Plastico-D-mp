import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';

/**
 * Sert une photo de presse (§ server/db/schema/machine-photos.ts). La
 * permission reste revérifiée ici comme pour tout export : une URL reste
 * une porte d'entrée, même masquée à l'écran.
 *
 * `immutable` : contrairement à un document, une photo n'est jamais modifiée
 * en place — « changer la photo » d'une machine change quelle ligne elle
 * référence, jamais le contenu d'une ligne existante. Le cache navigateur
 * peut donc être agressif sans jamais servir un contenu périmé.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  await requirePermission('machines:read');

  const { photoId } = await params;
  const db = await getDb();
  const [photo] = await db.select().from(t.machinePhotos).where(eq(t.machinePhotos.id, photoId)).limit(1);

  if (!photo) return new NextResponse('Photo introuvable', { status: 404 });

  const buffer = Buffer.from(photo.contentBase64, 'base64');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': photo.mimeType,
      'Content-Disposition': 'inline',
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
