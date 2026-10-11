import 'server-only';

import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { buildDailyReport } from '../domain/daily-report';
import { getEmailProvider } from '../notifications/email-provider';
import { formatCents, formatDateLong, formatDuration, formatNumber } from '@/lib/format';
import { getFactoryContext } from './factory-context';
import { getPreviousDayMetrics, operationalMetricsOf } from './daily-snapshot';

/**
 * Envoi du rapport quotidien.
 *
 * Déclenché par le cron. Les destinataires sont les utilisateurs actifs qui
 * ont activé l'e-mail dans leurs préférences de notification — la même case
 * que pour les alertes, pas un réglage parallèle à découvrir.
 *
 * Sans fournisseur configuré, `NullEmailProvider` journalise : le cron ne
 * tombe pas, et l'exploitant voit dans les journaux ce qui aurait été envoyé.
 */

export type DailyReportSendResult = {
  sent: number;
  failed: number;
  /** Aucun fournisseur d'e-mail configuré : rien n'a été tenté. */
  skipped: boolean;
  subject: string;
};

export async function sendDailyReport(): Promise<DailyReportSendResult> {
  const db = await getDb();
  const [context, previous] = await Promise.all([getFactoryContext(), getPreviousDayMetrics()]);
  const metrics = operationalMetricsOf(context);

  const message = buildDailyReport(
    {
      date: context.capturedAt,
      healthScore: context.health.global,
      producedUnits: metrics.producedUnits,
      targetUnits: metrics.targetUnits,
      lateOrders: metrics.lateOrders,
      machinesDown: context.machines.filter((machine) => machine.severity === 'critical').length,
      machinesTotal: context.machines.length,
      downtimeMinutes: metrics.downtimeMinutes,
      criticalAlerts: context.alerts
        .filter((alert) => alert.severity === 'critical')
        .map((alert) => ({ title: alert.title, impactCents: alert.impactCents })),
      previous: previous
        ? { producedUnits: previous.producedUnits, lateOrders: previous.lateOrders }
        : null,
    },
    {
      dateLong: formatDateLong,
      number: formatNumber,
      cents: formatCents,
      duration: formatDuration,
    },
  );

  const provider = getEmailProvider();
  if (!provider.configured) {
    console.info(
      `[rapport-quotidien] Aucun fournisseur d’e-mail configuré. Message qui aurait été envoyé :\n${message.subject}\n${message.text}`,
    );
    return { sent: 0, failed: 0, skipped: true, subject: message.subject };
  }

  const recipients = await db
    .select({ email: t.users.email })
    .from(t.notificationPreferences)
    .innerJoin(t.users, eq(t.notificationPreferences.userId, t.users.id))
    .where(eq(t.notificationPreferences.emailEnabled, true));

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    // Un destinataire en échec ne doit pas priver les autres du rapport.
    const result = await provider.send({
      to: recipient.email,
      subject: message.subject,
      text: message.text,
    });
    if (result.ok) sent += 1;
    else {
      failed += 1;
      console.warn(`[rapport-quotidien] Échec pour ${recipient.email} : ${result.error}`);
    }
  }

  return { sent, failed, skipped: false, subject: message.subject };
}
