import 'server-only';

import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';

/**
 * Limitation de débit à fenêtre fixe, partagée par tous les points d'entrée
 * sensibles (§ SECURITY.md « Reste à durcir »). Chaque appelant choisit sa
 * propre clé, sa limite et sa fenêtre — la connexion et le copilote
 * n'ont ni le même risque ni le même usage légitime.
 *
 * Fenêtre fixe plutôt que glissante : plus simple, une seule ligne par
 * (clé, fenêtre), suffisant pour se protéger d'un abus grossier sans faire de
 * cette table un goulet d'étranglement.
 */
export type RateLimitResult = {
  allowed: boolean;
  /** Secondes avant que la fenêtre courante ne se termine. */
  retryAfterSeconds: number;
};

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const db = await getDb();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const [row] = await db
    .insert(t.rateLimitBuckets)
    .values({ bucketKey: key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [t.rateLimitBuckets.bucketKey, t.rateLimitBuckets.windowStart],
      set: { count: sql`${t.rateLimitBuckets.count} + 1` },
    })
    .returning({ count: t.rateLimitBuckets.count });

  const retryAfterSeconds = Math.max(0, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
  return { allowed: row.count <= limit, retryAfterSeconds };
}
