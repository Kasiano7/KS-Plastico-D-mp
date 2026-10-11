import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { passwordTokenPurposeEnum } from './enums';

/**
 * RBAC : rôles et permissions vivent en base afin d'être administrables
 * sans redéploiement. L'autorisation est TOUJOURS vérifiée côté serveur.
 *
 * `code` est du texte libre — et non un enum — précisément pour que la
 * direction puisse créer ses propres rôles depuis l'administration.
 */
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Identifiant technique en minuscules, ex. `responsable_qualite`. */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  /**
   * Rôle livré avec l'application. Ne peut être ni supprimé ni renommé
   * techniquement, mais ses permissions restent modifiables.
   */
  isSystem: boolean('is_system').notNull().default(false),
  /** Ordre d'affichage dans l'administration. */
  rank: integer('rank').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Format `domaine:action`, ex. `orders:write`. */
  code: text('code').notNull().unique(),
  domain: text('domain').notNull(),
  description: text('description').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    /** Restriction de périmètre : un chef d'atelier ne voit que son atelier. */
    workshopId: uuid('workshop_id'),
    employeeId: uuid('employee_id'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    /*
     * Verrouillage après échecs répétés (§ domain/account-lockout).
     *
     * La limitation de débit ralentit une attaque par force brute sur une
     * fenêtre glissante ; elle ne l'arrête pas. Ces deux colonnes comptent les
     * échecs **consécutifs**, qui ne se remettent à zéro que sur une connexion
     * réussie.
     */
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /**
     * Double authentification (TOTP, RFC 6238) — § SECURITY.md « Reste à
     * durcir ». `totpSecret` reste `null` tant que l'enrôlement n'est pas
     * confirmé ; `totpEnabled` ne passe à vrai qu'après vérification d'un
     * premier code valide (§ two-factor.ts).
     */
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    /** Requis pour le canal SMS (§ notification-settings.ts) — au format E.164, ex. `+33612345678`. */
    phoneNumber: text('phone_number'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email), index('users_role_idx').on(t.roleId)],
);

/**
 * Codes de secours à usage unique, générés à l'activation de la 2FA — pour
 * ne pas verrouiller un compte hors de portée de son téléphone. Hachés comme
 * un mot de passe : un vol de base ne doit pas suffire à les rejouer.
 */
/**
 * Jeton à usage unique pour définir un mot de passe.
 *
 * Sert deux parcours qui ne diffèrent que par le message envoyé : l'invitation
 * d'un nouvel utilisateur, et la réinitialisation demandée par quelqu'un qui a
 * oublié son mot de passe.
 *
 * Trois propriétés portent toute la sécurité de ce mécanisme :
 *
 *   1. **Seul le condensat est stocké.** Un vol de base ne donne aucun jeton
 *      utilisable — exactement le raisonnement qui s'applique aux mots de
 *      passe eux-mêmes.
 *   2. **Usage unique** (`usedAt`) : un lien retrouvé dans un historique de
 *      messagerie ne rouvre pas le compte.
 *   3. **Expiration courte**, plus courte encore pour une réinitialisation
 *      que pour une invitation.
 */
export const passwordTokens = pgTable(
  'password_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Condensat du jeton — jamais le jeton lui-même. */
    tokenHash: text('token_hash').notNull(),
    purpose: passwordTokenPurposeEnum('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('password_tokens_hash_idx').on(t.tokenHash), index('password_tokens_user_idx').on(t.userId)],
);

export const twoFactorRecoveryCodes = pgTable(
  'two_factor_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('two_factor_recovery_codes_user_idx').on(t.userId)],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  users: many(users),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));
