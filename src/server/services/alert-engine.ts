import 'server-only';

import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { getFactoryContext } from './factory-context';
import { dispatchOutOfAppNotifications } from './notification-dispatch';
import { detectAllIssues, type DetectedIssue } from '../domain/alert-detection';
import type { RoleCode } from '../domain/permissions';

/**
 * Moteur de recommandations continu (§ ROADMAP.md Phase 3) — la moitié
 * « orchestration ». Appelé périodiquement (§ app/api/cron/evaluate-alerts)
 * ou à la demande (§ administration). La détection elle-même est pure et
 * vit dans `server/domain/alert-detection.ts` (§ règle 1 de CLAUDE.md).
 *
 * Ne crée ni ne modifie jamais de recommandation exécutable : ça reste le
 * geste d'un humain ou d'un outil dédié, avec un exécuteur vérifié pour
 * chaque type d'action (§ recommendations.action). Ce moteur se limite au
 * cycle problème → cause → conséquences → impact, jusqu'à l'alerte.
 */

const NOTIFIED_ROLES: Record<DetectedIssue['domain'], readonly RoleCode[]> = {
  machine: ['responsable_production', 'responsable_maintenance'],
  commande: ['responsable_production', 'direction'],
  stock: ['responsable_stock'],
  personnel: ['responsable_rh'],
};

export type AlertEngineResult = {
  evaluated: number;
  created: number;
  resolved: number;
};

/**
 * Retrouve une alerte OUVERTE déjà déclarée pour le même problème, quelle que
 * soit son origine (ce moteur ou un déclencheur réactif comme l'arrêt
 * brutal) — sur les colonnes dédiées quand elles existent (machine, commande),
 * sur la signature en dernier recours (stock, personnel, sans colonne FK).
 */
function findExistingOpenAlert(
  openAlerts: (typeof t.alerts.$inferSelect)[],
  issue: DetectedIssue,
): (typeof t.alerts.$inferSelect) | undefined {
  if (issue.machineId) {
    return openAlerts.find((alert) => alert.domain === issue.domain && alert.machineId === issue.machineId);
  }
  if (issue.customerOrderId) {
    return openAlerts.find(
      (alert) => alert.domain === issue.domain && alert.customerOrderId === issue.customerOrderId,
    );
  }
  return openAlerts.find(
    (alert) => (alert.context as Record<string, unknown> | null)?.signature === issue.signature,
  );
}

export async function evaluateAlerts(): Promise<AlertEngineResult> {
  const db = await getDb();
  const context = await getFactoryContext();
  const issues = detectAllIssues(context);

  const openAlerts = await db.select().from(t.alerts).where(eq(t.alerts.status, 'open'));
  const stillDetected = new Set<string>();
  let created = 0;

  for (const issue of issues) {
    const existing = findExistingOpenAlert(openAlerts, issue);
    if (existing) {
      stillDetected.add(existing.id);
      continue;
    }

    const [alert] = await db
      .insert(t.alerts)
      .values({
        severity: issue.severity,
        status: 'open',
        domain: issue.domain,
        title: issue.title,
        problem: issue.problem,
        probableCause: issue.probableCause,
        consequences: issue.consequences,
        impactCents: issue.impactCents,
        impactOrigin: issue.impactOrigin,
        machineId: issue.machineId ?? null,
        workshopId: issue.workshopId ?? null,
        customerOrderId: issue.customerOrderId ?? null,
        context: { ...issue.context, signature: issue.signature, trigger: 'continuous_engine' },
      })
      .returning();

    created++;
    stillDetected.add(alert.id);

    await db.insert(t.notifications).values({
      roleCode: NOTIFIED_ROLES[issue.domain][0],
      severity: issue.severity,
      title: issue.title,
      body: issue.problem,
      href: '/alertes',
    });

    // Best-effort, ne doit jamais faire échouer l'évaluation elle-même.
    await dispatchOutOfAppNotifications(
      db,
      { roleCodes: NOTIFIED_ROLES[issue.domain] },
      { severity: issue.severity, title: issue.title, body: issue.problem, href: '/alertes' },
    ).catch((error) => console.error('[alert-engine] Échec de la diffusion hors-app.', error));
  }

  // Une alerte née de ce moteur et dont la condition a disparu se referme
  // d'elle-même — ce n'est pas une décision, juste un constat qui n'est plus
  // vrai. Une alerte d'une AUTRE origine (arrêt brutal, saisie manuelle…)
  // n'est jamais touchée ici : sa clôture suit son propre circuit.
  let resolved = 0;
  const now = new Date();
  for (const alert of openAlerts) {
    if (stillDetected.has(alert.id)) continue;
    if ((alert.context as Record<string, unknown> | null)?.trigger !== 'continuous_engine') continue;

    await db.update(t.alerts).set({ status: 'resolved', resolvedAt: now }).where(eq(t.alerts.id, alert.id));
    resolved++;
  }

  return { evaluated: issues.length, created, resolved };
}
