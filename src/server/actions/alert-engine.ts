'use server';

import { revalidatePath } from 'next/cache';
import { assertPermission } from '../auth/session';
import { evaluateAlerts } from '../services/alert-engine';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

export type AlertEngineActionState = { ok?: boolean; message?: string };

/**
 * Déclenchement manuel du moteur de recommandations continu — pour ne pas
 * dépendre uniquement du cron (§ vercel.json, dont la fréquence dépend du
 * plan Vercel) et pour vérifier son effet immédiatement.
 */
export async function runAlertEngineAction(): Promise<AlertEngineActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('alerts:write');
  const result = await evaluateAlerts();

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'alert_engine.run_manual',
    entityType: 'system',
    newValue: result,
  });

  revalidatePath('/alertes');
  revalidatePath('/');

  return {
    ok: true,
    message: `${result.evaluated} situation${result.evaluated > 1 ? 's' : ''} évaluée${result.evaluated > 1 ? 's' : ''} — ${result.created} nouvelle${result.created > 1 ? 's' : ''} alerte${result.created > 1 ? 's' : ''}, ${result.resolved} clôturée${result.resolved > 1 ? 's' : ''} automatiquement.`,
  };
}
