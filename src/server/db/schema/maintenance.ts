import { relations } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { machines } from './factory';
import { employees, skills } from './hr';

/**
 * Intervention planifiée sur une machine.
 *
 * Le statut reste du texte afin de permettre une évolution du processus sans
 * migration d'enum PostgreSQL. Les actions serveur valident la liste admise.
 */
export const maintenanceTasks = pgTable(
  'maintenance_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('planned'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    estimatedMinutes: integer('estimated_minutes').notNull().default(60),
    requiredSkillId: uuid('required_skill_id').references(() => skills.id, {
      onDelete: 'set null',
    }),
    assignedEmployeeId: uuid('assigned_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    recurrence: text('recurrence').notNull().default('none'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('maintenance_tasks_machine_date_idx').on(t.machineId, t.scheduledAt),
    index('maintenance_tasks_status_date_idx').on(t.status, t.scheduledAt),
  ],
);

export const maintenanceTasksRelations = relations(maintenanceTasks, ({ one }) => ({
  machine: one(machines, { fields: [maintenanceTasks.machineId], references: [machines.id] }),
  requiredSkill: one(skills, {
    fields: [maintenanceTasks.requiredSkillId],
    references: [skills.id],
  }),
  assignedEmployee: one(employees, {
    fields: [maintenanceTasks.assignedEmployeeId],
    references: [employees.id],
  }),
}));
