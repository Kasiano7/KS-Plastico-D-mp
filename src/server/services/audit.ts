import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { redactAuditValue } from '../domain/audit-redaction';

/**
 * Journal d'audit (§36).
 *
 * Toute mutation métier passe par ici. Le journal conserve l'ancienne et la
 * nouvelle valeur : une décision doit rester explicable des mois plus tard.
 */
export type AuditEntry = {
  userId?: string | null;
  userLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  justification?: string | null;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  const db = await getDb();
  await db.insert(t.auditLogs).values({
    userId: entry.userId ?? null,
    userLabel: entry.userLabel ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel ?? null,
    /*
     * Le masquage est appliqué ici, au point d'écriture unique du journal, et
     * non dans chaque appelant : une liste de champs sensibles qu'il faut
     * penser à appliquer dix-sept fois finit par être oubliée une fois.
     */
    previousValue: redactAuditValue(entry.previousValue) ?? null,
    newValue: redactAuditValue(entry.newValue) ?? null,
    justification: entry.justification ?? null,
  });
}

export async function listAuditLogs(limit = 100) {
  const db = await getDb();
  return db.select().from(t.auditLogs).orderBy(desc(t.auditLogs.occurredAt)).limit(limit);
}

export async function listAuditLogsForEntity(entityType: string, entityId: string) {
  const db = await getDb();
  return db
    .select()
    .from(t.auditLogs)
    .where(eq(t.auditLogs.entityId, entityId))
    .orderBy(desc(t.auditLogs.occurredAt))
    .limit(50)
    .then((rows) => rows.filter((row) => row.entityType === entityType));
}
