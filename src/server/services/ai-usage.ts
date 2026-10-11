import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';

export type AiUsageRecord = typeof t.aiUsageLogs.$inferInsert;

/** L'observabilité ne doit jamais faire échouer une réponse utile. */
export async function recordAiUsage(record: AiUsageRecord): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(t.aiUsageLogs).values(record);
  } catch (error) {
    console.error('[ai-usage] Impossible de journaliser la requête IA.', error);
  }
}

export async function getRecentAiUsageWindow(limit = 100): Promise<{
  totalRequests: number;
  solRequests: number;
}> {
  try {
    const db = await getDb();
    const rows = await db
      .select({ modelTier: t.aiUsageLogs.modelTier })
      .from(t.aiUsageLogs)
      .where(eq(t.aiUsageLogs.success, true))
      .orderBy(desc(t.aiUsageLogs.requestedAt))
      .limit(limit);

    return {
      totalRequests: rows.length,
      solRequests: rows.filter((row) => row.modelTier === 'sol').length,
    };
  } catch {
    return { totalRequests: 0, solRequests: 0 };
  }
}

/** Agrégats destinés à une future vue d'administration. */
export async function getAiUsageStats(companyId?: string) {
  const db = await getDb();
  return db
    .select({
      companyId: t.aiUsageLogs.companyId,
      modelTier: t.aiUsageLogs.modelTier,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${t.aiUsageLogs.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${t.aiUsageLogs.outputTokens}), 0)::int`,
      estimatedCostMicrosUsd: sql<number>`coalesce(sum(${t.aiUsageLogs.estimatedCostMicrosUsd}), 0)::int`,
      averageDurationMs: sql<number>`coalesce(avg(${t.aiUsageLogs.durationMs}), 0)::int`,
    })
    .from(t.aiUsageLogs)
    .where(companyId ? eq(t.aiUsageLogs.companyId, companyId) : undefined)
    .groupBy(t.aiUsageLogs.companyId, t.aiUsageLogs.modelTier);
}

