import 'server-only';

import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../db/client';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { computeFailurePareto, shiftAt } from '../domain/maintenance';

export async function getAvailableMaintenanceStaff(db: Database, at: Date) {
  const [staffRows, absenceRows] = await Promise.all([
    db
      .select({
        employeeId: t.employees.id,
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
        jobTitle: t.employees.jobTitle,
        shift: t.employees.shift,
        skillId: t.skills.id,
        skillCode: t.skills.code,
        skillName: t.skills.name,
        skillLevel: t.employeeSkills.level,
      })
      .from(t.employeeSkills)
      .innerJoin(t.employees, eq(t.employeeSkills.employeeId, t.employees.id))
      .innerJoin(t.skills, eq(t.employeeSkills.skillId, t.skills.id))
      .where(and(eq(t.employees.isActive, true), eq(t.skills.category, 'Maintenance')))
      .orderBy(desc(t.employeeSkills.level), t.employees.lastName),
    db
      .select({ employeeId: t.absences.employeeId })
      .from(t.absences)
      .where(and(lte(t.absences.startsAt, at), gte(t.absences.endsAt, at))),
  ]);

  const absent = new Set(absenceRows.map((row) => row.employeeId));
  const activeShift = shiftAt(at);

  return staffRows.map((staff) => ({
    ...staff,
    fullName: `${staff.firstName} ${staff.lastName}`,
    available: staff.shift === activeShift && !absent.has(staff.employeeId),
    absence: absent.has(staff.employeeId),
  }));
}

function normalizeMonth(value: string | undefined, now: Date) {
  const current = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const key = value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : current;
  const [year, month] = key.split('-').map(Number);
  return { key, year, monthIndex: month - 1 };
}

export async function getMaintenanceDashboard(monthValue?: string) {
  const db = await getDb();
  const now = new Date();
  const month = normalizeMonth(monthValue, now);
  const since = new Date(now.getTime() - 365 * 86_400_000);

  const [incidentRows, taskRows, machineRows, skillRows, staff] = await Promise.all([
    db
      .select({
        incident: t.incidents,
        machineName: t.machines.name,
        machineCode: t.machines.code,
        workshopName: t.workshops.name,
        productionOrderNumber: t.productionOrders.number,
      })
      .from(t.incidents)
      .leftJoin(t.machines, eq(t.incidents.machineId, t.machines.id))
      .leftJoin(t.workshops, eq(t.incidents.workshopId, t.workshops.id))
      .leftJoin(t.productionOrders, eq(t.incidents.productionOrderId, t.productionOrders.id))
      .where(gte(t.incidents.occurredAt, since))
      .orderBy(desc(t.incidents.occurredAt)),
    db
      .select({
        task: t.maintenanceTasks,
        machineName: t.machines.name,
        machineCode: t.machines.code,
        workshopName: t.workshops.name,
        skillName: t.skills.name,
        assignedFirstName: t.employees.firstName,
        assignedLastName: t.employees.lastName,
      })
      .from(t.maintenanceTasks)
      .innerJoin(t.machines, eq(t.maintenanceTasks.machineId, t.machines.id))
      .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
      .leftJoin(t.skills, eq(t.maintenanceTasks.requiredSkillId, t.skills.id))
      .leftJoin(t.employees, eq(t.maintenanceTasks.assignedEmployeeId, t.employees.id))
      .orderBy(asc(t.maintenanceTasks.scheduledAt)),
    db
      .select({ id: t.machines.id, code: t.machines.code, name: t.machines.name })
      .from(t.machines)
      .where(eq(t.machines.isActive, true))
      .orderBy(t.machines.name),
    db
      .select({ id: t.skills.id, code: t.skills.code, name: t.skills.name })
      .from(t.skills)
      .where(eq(t.skills.category, 'Maintenance'))
      .orderBy(t.skills.name),
    getAvailableMaintenanceStaff(db, now),
  ]);

  const openIncidents = incidentRows.filter(
    ({ incident }) => incident.status === 'open' || incident.status === 'investigating',
  );
  const totalDowntime = incidentRows.reduce(
    (total, { incident }) => total + incident.downtimeMinutes,
    0,
  );
  const pareto = computeFailurePareto(incidentRows.map(({ incident }) => incident));
  const upcomingTasks = taskRows.filter(
    ({ task }) => task.status !== 'completed' && task.status !== 'cancelled',
  );

  return {
    now,
    month,
    incidents: incidentRows,
    openIncidents,
    pareto,
    totalDowntime,
    tasks: taskRows,
    upcomingTasks,
    machines: machineRows,
    skills: skillRows,
    staff,
  };
}

export type MaintenanceDashboard = Awaited<ReturnType<typeof getMaintenanceDashboard>>;
