import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  aiMessageRoleEnum,
  alertStatusEnum,
  approvalDecisionEnum,
  dataOriginEnum,
  incidentStatusEnum,
  qualityDefectEnum,
  recommendationStatusEnum,
  severityEnum,
} from './enums';
import { machines, workshops } from './factory';
import { productionOrders } from './manufacturing';
import { customerOrders } from './sales';
import { users } from './identity';

/** Déclaration qualité rattachée à une production (§34). Alimente TRS et coûts. */
export const qualityEvents = pgTable(
  'quality_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productionOrderId: uuid('production_order_id').references(() => productionOrders.id),
    machineId: uuid('machine_id').references(() => machines.id),
    defect: qualityDefectEnum('defect').notNull(),
    rejectedUnits: integer('rejected_units').notNull(),
    lotNumber: text('lot_number'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    comment: text('comment'),
    declaredBy: uuid('declared_by'),
  },
  (t) => [
    index('quality_events_machine_time_idx').on(t.machineId, t.detectedAt),
    index('quality_events_defect_idx').on(t.defect),
  ],
);

/**
 * Incident : la mémoire de l'usine (§35). Conserve symptôme, cause et solution
 * afin que le savoir survive au départ des salariés.
 */
export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    title: text('title').notNull(),
    severity: severityEnum('severity').notNull().default('warning'),
    status: incidentStatusEnum('status').notNull().default('open'),
    machineId: uuid('machine_id').references(() => machines.id),
    workshopId: uuid('workshop_id').references(() => workshops.id),
    productionOrderId: uuid('production_order_id').references(() => productionOrders.id),
    symptom: text('symptom').notNull(),
    rootCause: text('root_cause'),
    resolution: text('resolution'),
    /** Mots-clés servant à retrouver un incident similaire. */
    tags: text('tags').array(),
    downtimeMinutes: integer('downtime_minutes').notNull().default(0),
    estimatedCostCents: integer('estimated_cost_cents').notNull().default(0),
    declaredBy: uuid('declared_by'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('incidents_machine_time_idx').on(t.machineId, t.occurredAt),
    index('incidents_status_idx').on(t.status),
  ],
);

/**
 * Alerte intelligente (§11) : problème + cause probable + conséquences +
 * impact financier + recommandation.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    severity: severityEnum('severity').notNull(),
    status: alertStatusEnum('status').notNull().default('open'),
    /** Domaine émetteur : machine, stock, commande, qualité, personnel, planning. */
    domain: text('domain').notNull(),
    title: text('title').notNull(),
    problem: text('problem').notNull(),
    probableCause: text('probable_cause'),
    consequences: text('consequences'),
    /** Impact financier estimé, en centimes. */
    impactCents: integer('impact_cents').notNull().default(0),
    impactOrigin: dataOriginEnum('impact_origin').notNull().default('estimated'),
    machineId: uuid('machine_id').references(() => machines.id),
    workshopId: uuid('workshop_id').references(() => workshops.id),
    customerOrderId: uuid('customer_order_id').references(() => customerOrders.id),
    incidentId: uuid('incident_id').references(() => incidents.id),
    /** Références métier additionnelles affichées dans le détail de l'alerte. */
    context: jsonb('context'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('alerts_status_severity_idx').on(t.status, t.severity),
    index('alerts_detected_idx').on(t.detectedAt),
  ],
);

/**
 * Recommandation IA. Cycle de vie : proposed → simulated → approved/rejected → executed.
 * L'IA recommande, l'humain décide (§12, §13).
 */
export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alertId: uuid('alert_id').references(() => alerts.id, { onDelete: 'cascade' }),
    status: recommendationStatusEnum('status').notNull().default('proposed'),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    /** Action machine-lisible que l'exécuteur saura rejouer après approbation. */
    action: jsonb('action').notNull(),
    expectedGainCents: integer('expected_gain_cents').notNull().default(0),
    /** Confiance du moteur, de 0 à 1. */
    confidence: real('confidence').notNull().default(0.5),
    origin: dataOriginEnum('origin').notNull().default('computed'),
    /** Une recommandation à impact réel exige une validation humaine explicite. */
    requiresApproval: boolean('requires_approval').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('recommendations_status_idx').on(t.status), index('recommendations_alert_idx').on(t.alertId)],
);

/** Résultat d'un « what-if » attaché à une recommandation (§12.5). */
export const simulations = pgTable('simulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  recommendationId: uuid('recommendation_id').references(() => recommendations.id, {
    onDelete: 'cascade',
  }),
  scenario: text('scenario').notNull(),
  /** Probabilité de tenir l'engagement, de 0 à 1. */
  successProbability: real('success_probability').notNull(),
  baseline: jsonb('baseline').notNull(),
  projected: jsonb('projected').notNull(),
  deltaCents: integer('delta_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Trace de la décision humaine. Aucune exécution sans ligne correspondante. */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => recommendations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    decision: approvalDecisionEnum('decision').notNull(),
    justification: text('justification'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('approvals_recommendation_idx').on(t.recommendationId)],
);

/** Journal d'audit (§36) : qui, quand, quoi, avant, après, pourquoi. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    userLabel: text('user_label'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    entityLabel: text('entity_label'),
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),
    justification: text('justification'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_time_idx').on(t.occurredAt),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    /** Diffusion par rôle lorsque `userId` est nul. */
    roleCode: text('role_code'),
    severity: severityEnum('severity').notNull().default('info'),
    title: text('title').notNull(),
    body: text('body'),
    href: text('href'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt)],
);

/** Historique du score de santé (§9), pour expliquer les variations. */
export const healthSnapshots = pgTable(
  'health_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    globalScore: integer('global_score').notNull(),
    productionScore: integer('production_score').notNull(),
    inventoryScore: integer('inventory_score').notNull(),
    machineScore: integer('machine_score').notNull(),
    planningScore: integer('planning_score').notNull(),
    qualityScore: integer('quality_score').notNull(),
    staffScore: integer('staff_score').notNull(),

    /*
     * Chiffres d'exploitation du jour capturé.
     *
     * Sans eux, la table ne conservait que des scores — et l'accueil ne pouvait
     * répondre à « est-ce que ça va mieux qu'hier ? », qui est pourtant la
     * troisième question d'un directeur d'usine. Un score de 87 ne dit pas si
     * l'usine a produit.
     *
     * Nullables : les instantanés déjà enregistrés n'ont pas ces valeurs, et on
     * n'invente pas un chiffre pour combler une colonne (règle n° 4).
     */
    producedUnits: integer('produced_units'),
    targetUnits: integer('target_units'),
    lateOrders: integer('late_orders'),
    downtimeMinutes: integer('downtime_minutes'),
    downtimeCostCents: integer('downtime_cost_cents'),
  },
  (t) => [index('health_snapshots_time_idx').on(t.capturedAt)],
);

/**
 * Télémétrie du copilote. Aucun prompt ni contenu métier n'est conservé :
 * seulement les métadonnées nécessaires aux coûts, aux SLO et au contrôle
 * du taux d'escalade vers Sol.
 */
export const aiUsageLogs = pgTable(
  'ai_usage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id'),
    companyId: text('company_id').notNull().default('demo'),
    provider: text('provider').notNull(),
    defaultModel: text('default_model').notNull(),
    modelUsed: text('model_used').notNull(),
    modelTier: text('model_tier').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** Coût estimé en millionièmes de dollar US. */
    estimatedCostMicrosUsd: integer('estimated_cost_micros_usd').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    toolCalls: integer('tool_calls').notNull().default(0),
    escalatedToSol: boolean('escalated_to_sol').notNull().default(false),
    escalationReason: text('escalation_reason'),
    success: boolean('success').notNull().default(true),
    errorCode: text('error_code'),
  },
  (t) => [
    index('ai_usage_logs_requested_idx').on(t.requestedAt),
    index('ai_usage_logs_company_idx').on(t.companyId, t.requestedAt),
    index('ai_usage_logs_user_idx').on(t.userId, t.requestedAt),
    index('ai_usage_logs_tier_idx').on(t.modelTier, t.requestedAt),
  ],
);

/**
 * Mémoire du copilote (architecture « DB Europe source de vérité »).
 *
 * Une conversation par fil de discussion (panneau latéral ou page dédiée).
 * OpenAI est appelé avec `store: false` : le contenu n'existe durablement
 * QUE dans ces deux tables, hébergées avec le reste de KS Plastico Demo. Le résumé
 * (`summary`) est celui du dernier tour — mémoire courte immédiate, sans
 * appel modèle dédié. Le coût/tokens par requête reste dans `ai_usage_logs`,
 * qui ne conserve volontairement aucun contenu : ne pas dupliquer ici.
 */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: text('company_id').notNull().default('demo'),
    /** Dérivé de la première question, tronqué — pas de résumé généré par appel modèle dédié. */
    title: text('title').notNull(),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_conversations_user_idx').on(t.userId, t.updatedAt)],
);

/**
 * Un message par tour. `answer` conserve la réponse structurée complète
 * (faits sourcés, ventilation, actions) pour les messages `assistant` — la
 * même donnée que celle affichée à l'écran, rien de plus.
 */
export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: aiMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    answer: jsonb('answer'),
    /** Modèle ayant produit la réponse (ex. gpt-5.6-terra) ; absent pour un message utilisateur. */
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  machine: one(machines, { fields: [alerts.machineId], references: [machines.id] }),
  workshop: one(workshops, { fields: [alerts.workshopId], references: [workshops.id] }),
  customerOrder: one(customerOrders, {
    fields: [alerts.customerOrderId],
    references: [customerOrders.id],
  }),
  incident: one(incidents, { fields: [alerts.incidentId], references: [incidents.id] }),
  recommendations: many(recommendations),
}));

export const recommendationsRelations = relations(recommendations, ({ one, many }) => ({
  alert: one(alerts, { fields: [recommendations.alertId], references: [alerts.id] }),
  simulations: many(simulations),
  approvals: many(approvals),
}));

export const simulationsRelations = relations(simulations, ({ one }) => ({
  recommendation: one(recommendations, {
    fields: [simulations.recommendationId],
    references: [recommendations.id],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  recommendation: one(recommendations, {
    fields: [approvals.recommendationId],
    references: [recommendations.id],
  }),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  machine: one(machines, { fields: [incidents.machineId], references: [machines.id] }),
  workshop: one(workshops, { fields: [incidents.workshopId], references: [workshops.id] }),
}));
