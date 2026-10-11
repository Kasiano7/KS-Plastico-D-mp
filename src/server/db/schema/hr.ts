import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { absenceTypeEnum, qualificationKindEnum, shiftEnum } from './enums';
import { machines, workshops } from './factory';

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matricule: text('matricule').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    workshopId: uuid('workshop_id').references(() => workshops.id),
    jobTitle: text('job_title').notNull(),
    shift: shiftEnum('shift').notNull().default('morning'),
    hiredAt: timestamp('hired_at', { withTimezone: true }),
    /** Coût horaire chargé en centimes — alimente l'impact financier. */
    hourlyCostCents: integer('hourly_cost_cents').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    /** Presse affectée pour la période en cours — décision du planning (§19), distincte de l'historique des sessions réelles (`production_runs`). */
    assignedMachineId: uuid('assigned_machine_id').references(() => machines.id, { onDelete: 'set null' }),
  },
  (t) => [index('employees_workshop_idx').on(t.workshopId), index('employees_shift_idx').on(t.shift)],
);

/** Compétence métier (ex. « réglage presse 1000T »). */
export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category'),
});

export const employeeSkills = pgTable(
  'employee_skills',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    /** Niveau de 1 (débutant) à 4 (référent). */
    level: integer('level').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.skillId] })],
);

/**
 * Habilitation réglementaire à date de validité (SST, CACES…).
 * Une alerte est levée plusieurs mois avant expiration (§21).
 */
export const qualifications = pgTable(
  'qualifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    kind: qualificationKindEnum('kind').notNull(),
    label: text('label').notNull(),
    obtainedAt: timestamp('obtained_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Nombre de jours avant expiration déclenchant une alerte. */
    alertLeadDays: integer('alert_lead_days').notNull().default(90),
  },
  (t) => [index('qualifications_expiry_idx').on(t.expiresAt)],
);

export const trainings = pgTable('trainings', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  provider: text('provider'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  isMandatory: boolean('is_mandatory').notNull().default(false),
});

export const absences = pgTable(
  'absences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: absenceTypeEnum('type').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
  },
  (t) => [index('absences_employee_time_idx').on(t.employeeId, t.startsAt)],
);

export const employeesRelations = relations(employees, ({ one, many }) => ({
  workshop: one(workshops, { fields: [employees.workshopId], references: [workshops.id] }),
  assignedMachine: one(machines, { fields: [employees.assignedMachineId], references: [machines.id] }),
  employeeSkills: many(employeeSkills),
  qualifications: many(qualifications),
  absences: many(absences),
  trainings: many(trainings),
}));

export const employeeSkillsRelations = relations(employeeSkills, ({ one }) => ({
  employee: one(employees, { fields: [employeeSkills.employeeId], references: [employees.id] }),
  skill: one(skills, { fields: [employeeSkills.skillId], references: [skills.id] }),
}));

export const qualificationsRelations = relations(qualifications, ({ one }) => ({
  employee: one(employees, { fields: [qualifications.employeeId], references: [employees.id] }),
}));

export const absencesRelations = relations(absences, ({ one }) => ({
  employee: one(employees, { fields: [absences.employeeId], references: [employees.id] }),
}));
