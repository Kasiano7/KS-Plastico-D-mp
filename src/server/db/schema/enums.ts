import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Tous les enums du domaine sont centralisés ici afin qu'une seule source
 * fasse foi entre la base de données, le domaine métier et l'UI.
 */

/*
 * Note : le code de rôle n'est volontairement PAS un enum. Les rôles sont
 * administrables depuis l'application, un enum figerait la liste dans le
 * schéma. Voir `schema/identity.ts`.
 */

/** Sévérité universelle : pilote les couleurs de l'interface. */
export const severityEnum = pgEnum('severity', [
  'normal', // 🟢
  'info', // 🟡
  'warning', // 🟠
  'critical', // 🔴
]);

export const machineStatusEnum = pgEnum('machine_status', [
  'production', // 🟢
  'setup', // 🟠 réglage
  'mold_change', // 🟠 changement de moule
  'stopped', // 🔴 arrêt
  'fault', // 🔴 défaut
  'maintenance', // 🟠
  'idle', // 🟡 disponible, non planifiée
]);

export const machineEventTypeEnum = pgEnum('machine_event_type', [
  'production_start',
  'production_end',
  'stop',
  'setup',
  'mold_change',
  'fault',
  'maintenance',
  'restart',
]);

export const moldStatusEnum = pgEnum('mold_status', [
  'available',
  'mounted',
  'maintenance',
  'retired',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'confirmed',
  'in_production',
  'ready',
  'shipped',
  'cancelled',
]);

export const orderPriorityEnum = pgEnum('order_priority', ['low', 'normal', 'high', 'critical']);

export const productionOrderStatusEnum = pgEnum('production_order_status', [
  'planned',
  'released',
  'running',
  'paused',
  'done',
  'cancelled',
]);

export const palletStatusEnum = pgEnum('pallet_status', [
  'in_progress',
  'completed',
  'in_stock',
  'allocated',
  'shipped',
  'cancelled',
]);

/** Familles de stock — §25 du cahier des charges. */
export const inventoryKindEnum = pgEnum('inventory_kind', [
  'finished_good',
  'raw_material',
  'pallet',
  'crate',
  'component',
  'consumable',
  'tooling',
  'spare_part',
]);

export const movementTypeEnum = pgEnum('movement_type', [
  'inbound',
  'outbound',
  'transfer',
  'consumption',
  'adjustment',
  'production_output',
]);

export const reservationStatusEnum = pgEnum('reservation_status', [
  'active',
  'consumed',
  'released',
]);

export const qualityDefectEnum = pgEnum('quality_defect', [
  'appearance',
  'dimension',
  'material',
  'shrinkage',
  'burn',
  'flash',
  'contamination',
  'other',
]);

export const incidentStatusEnum = pgEnum('incident_status', [
  'open',
  'investigating',
  'resolved',
  'closed',
]);

export const alertStatusEnum = pgEnum('alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

/** §12 — Détecter → Expliquer → Calculer → Proposer → Simuler → Valider. */
export const recommendationStatusEnum = pgEnum('recommendation_status', [
  'proposed',
  'simulated',
  'approved',
  'rejected',
  'executed',
  'expired',
]);

export const approvalDecisionEnum = pgEnum('approval_decision', ['approved', 'rejected']);

/** §16 / §40 — la provenance d'un chiffre doit toujours être explicite. */
export const dataOriginEnum = pgEnum('data_origin', [
  'measured', // relevé réel
  'computed', // calculé à partir de données réelles
  'estimated', // estimation
  'forecast', // prévision
]);

export const absenceTypeEnum = pgEnum('absence_type', [
  'holiday',
  'sick_leave',
  'training',
  'unpaid',
  'other',
]);

export const qualificationKindEnum = pgEnum('qualification_kind', [
  'sst',
  'caces',
  'electrical',
  'forklift',
  'machine',
  'safety',
  'other',
]);

export const shiftEnum = pgEnum('shift', ['morning', 'afternoon', 'night']);

export const telemetrySourceEnum = pgEnum('telemetry_source', [
  'simulated',
  'gateway',
  'manual',
]);

export const machineDocumentCategoryEnum = pgEnum('machine_document_category', [
  'notice_constructeur',
  'plan_electrique',
  'fiche_reglage',
  'rapport_intervention',
  'certificat_conformite',
  'autre',
]);

/** Rôle d'un message dans une conversation copilote (§ mémoire IA). */
export const aiMessageRoleEnum = pgEnum('ai_message_role', ['user', 'assistant', 'system']);

/**
 * Motif d'un jeton de mot de passe. Les deux parcours partagent la même
 * mécanique et ne diffèrent que par le message envoyé et la durée de validité.
 */
export const passwordTokenPurposeEnum = pgEnum('password_token_purpose', [
  'invitation',
  'reset',
]);

/**
 * Nature d'un actif du site.
 *
 * Reprend exactement le vocabulaire déjà utilisé par l'écran de maintenance
 * (`types/maintenance.ts`) : la maquette avait raison sur la taxonomie, il lui
 * manquait seulement une table. Aligner les deux évite d'avoir à traduire.
 */
export const assetTypeEnum = pgEnum('asset_type', [
  'machine',
  'press_pu',
  'compressor',
  'chiller',
  'conveyor',
  'air_reel',
  'access',
  'door',
  'lighting',
  'hvac',
  'heating',
  'electrical',
  'robotics',
  'logistics',
  'building',
  'utility',
  'safety',
  'other',
]);

/**
 * Criticité d'un actif — ce qu'on perd s'il s'arrête.
 *
 * `vital` : l'arrêt stoppe la production du site (compresseur central).
 * `important` : l'arrêt dégrade sans stopper (un convoyeur sur deux).
 * `normal` : l'arrêt se contourne (un éclairage de zone).
 *
 * Sert à ordonner les interventions : à charge égale, on traite d'abord ce
 * dont l'arrêt coûte le plus.
 */
export const assetCriticalityEnum = pgEnum('asset_criticality', [
  'vital',
  'important',
  'normal',
]);
