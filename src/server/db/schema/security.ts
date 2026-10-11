import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Compteurs de limitation de débit — fenêtre fixe (§ SECURITY.md « Reste à
 * durcir »). Une ligne par (clé, début de fenêtre) : la connexion et le
 * copilote incrémentent la même table avec des clés et des fenêtres
 * différentes, pas de mécanisme dédié par usage.
 *
 * Stockée en base plutôt qu'en mémoire process : sur Vercel, chaque requête
 * peut atterrir sur une instance serverless différente — un compteur en
 * mémoire ne protégerait rien.
 */
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucketKey: text('bucket_key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [uniqueIndex('rate_limit_buckets_key_window_idx').on(t.bucketKey, t.windowStart)],
);
