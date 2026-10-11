import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/session';
import { eventsToCsv } from '@/server/domain/machine-events';
import { getMachineIdentity } from '@/server/services/machine-fleet';
import { getMachineHistory } from '@/server/services/machine-history';

/**
 * Export CSV de l'historique d'une machine.
 *
 * La permission est revérifiée ici : une URL d'export reste une porte
 * d'entrée, même si le bouton qui y mène est masqué à l'écran. Les filtres
 * appliqués sont ceux de la page, transmis en paramètres — l'utilisateur
 * exporte exactement ce qu'il voit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission('machines:read');

  const { id } = await params;
  const url = new URL(request.url);

  const [machine, history] = await Promise.all([
    getMachineIdentity(id),
    getMachineHistory(id, {
      search: url.searchParams.get('recherche') ?? undefined,
      type: url.searchParams.get('type') ?? undefined,
      severity: url.searchParams.get('severite') ?? undefined,
      from: url.searchParams.get('du') ?? undefined,
      to: url.searchParams.get('au') ?? undefined,
    }),
  ]);

  if (!machine || !history) {
    return new NextResponse('Machine introuvable', { status: 404 });
  }

  const stamp = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Paris',
  });

  const csv = eventsToCsv(history.filtered, (date) => stamp.format(date).replace(',', ''));
  const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(history.to);
  const fileName = `historique-${machine.code.toLowerCase()}-${isoDay}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
