import { NextResponse } from 'next/server';
import { isDemoMode } from '@/config/demo';
import { resetDemoDatabase } from '@/server/demo/reset';
import { safeSecretMatch } from '@/server/security/safe-compare';

/** Migrations et rechargement complet : plus long qu'une requête ordinaire. */
export const maxDuration = 60;

/**
 * Réinitialisation nocturne de la démonstration (§ vercel.json).
 *
 * N'existe qu'en mode démonstration : ailleurs, la route répond 404. Même
 * protection que les autres crons — `Authorization: Bearer <CRON_SECRET>`,
 * comparé en temps constant.
 */
export async function GET(request: Request) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET non configuré.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization');
  const receivedSecret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!safeSecretMatch(receivedSecret, secret)) {
    return NextResponse.json({ ok: false, error: 'Non autorisé.' }, { status: 401 });
  }

  try {
    const { durationMs } = await resetDemoDatabase();
    return NextResponse.json({ ok: true, durationMs });
  } catch (error) {
    console.error('[cron] Réinitialisation de la démonstration impossible.', error);
    return NextResponse.json({ ok: false, error: 'Réinitialisation impossible.' }, { status: 500 });
  }
}
