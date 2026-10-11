import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { globalSearch } from '@/server/services/search';

/** Recherche globale — filtrée par les permissions de l'utilisateur connecté. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });

  const query = new URL(request.url).searchParams.get('q') ?? '';
  const results = await globalSearch(query, user.permissions);

  return NextResponse.json({ results });
}
