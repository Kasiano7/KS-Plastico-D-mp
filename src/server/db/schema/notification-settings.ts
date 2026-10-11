import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { severityEnum } from './enums';
import { users } from './identity';

/**
 * Préférences de notification hors-app — un utilisateur choisit lui-même ses
 * canaux depuis « Mon compte » (§ ROADMAP.md, notifications par rôle).
 * Tout est désactivé par défaut : recevoir un SMS n'est jamais une surprise,
 * c'est un choix explicite.
 */
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailEnabled: boolean('email_enabled').notNull().default(false),
  smsEnabled: boolean('sms_enabled').notNull().default(false),
  pushEnabled: boolean('push_enabled').notNull().default(false),
  /** Seuil minimal : une alerte moins sévère que ça ne déclenche aucun canal hors-app. */
  minSeverity: severityEnum('min_severity').notNull().default('critical'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Un utilisateur peut avoir plusieurs abonnements Web Push (un par
 * navigateur/appareil activé) — RFC 8030, aucune dépendance à un fournisseur
 * tiers : c'est le service push du navigateur (Chrome/Firefox/Safari) qui
 * relaie, gratuitement, vers l'endpoint qu'il fournit lui-même.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);
