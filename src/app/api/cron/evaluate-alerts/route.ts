import { NextResponse } from 'next/server';
import { captureDailySnapshot } from '@/server/services/daily-snapshot';
import { sendDailyReport } from '@/server/services/daily-report-mail';
import { evaluateAlerts } from '@/server/services/alert-engine';
import { safeSecretMatch } from '@/server/security/safe-compare';

/**
 * Point d'entrée du moteur de recommandations continu (§ ROADMAP.md Phase 3),
 * appelé par le cron Vercel (§ vercel.json) — jamais par le navigateur.
 * Protégé par un secret partagé, même schéma que Vercel documente pour ses
 * propres crons : un jeton dans l'en-tête `Authorization`, comparé en temps
 * constant pour ne pas laisser fuir sa longueur par le timing (§
 * server/domain/password-policy.ts pour le même réflexe côté mot de passe).
 *
 * Cron réglé sur une exécution quotidienne (§ vercel.json) — plafond du plan
 * Vercel Hobby actuel, pas un choix métier : l'usine mérite plusieurs
 * passages par jour. Repasser `vercel.json` sur un intervalle de six heures
 * (ou plus fréquent) dès le passage sur un plan supérieur. Le bouton
 * « Réévaluer maintenant » sur /alertes appelle le même moteur en attendant.
 */
export async function GET(request: Request) {
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
    const result = await evaluateAlerts();

    /*
     * L'instantané du jour est capturé au même passage : il alimente la
     * comparaison « depuis hier » de l'accueil. L'opération est idempotente,
     * donc sans danger si le cron passe plusieurs fois.
     */
    const snapshot = await captureDailySnapshot();

    /*
     * Le rapport quotidien part du même passage.
     *
     * Ce n'est pas un raccourci : le plan d'hébergement ne permet qu'une
     * planification par jour, et celle-ci tombe à 05:00 UTC — 7 h à Paris en
     * heure d'été, 6 h en heure d'hiver. Ajouter une seconde entrée cron
     * n'enverrait rien du tout. Le jour où le plan le permet, il suffira
     * d'extraire cet appel dans sa propre route.
     *
     * Un échec d'envoi ne doit pas faire échouer l'évaluation des alertes,
     * qui est la fonction critique de ce cron.
     */
    let report;
    try {
      report = await sendDailyReport();
    } catch (error) {
      console.error('[cron/evaluate-alerts] Rapport quotidien non envoyé.', error);
      report = { sent: 0, failed: 0, skipped: true, subject: '' };
    }

    return NextResponse.json({ ok: true, ...result, snapshot, report });
  } catch (error) {
    console.error('[cron/evaluate-alerts] Échec de l’évaluation.', error);
    return NextResponse.json({ ok: false, error: 'Échec de l’évaluation.' }, { status: 500 });
  }
}
