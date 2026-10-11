'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

export type EmployeeActionState = { ok?: boolean; message?: string; errors?: string[] };

const SHIFTS = t.shiftEnum.enumValues;
const ABSENCE_TYPES = t.absenceTypeEnum.enumValues;
const QUALIFICATION_KINDS = t.qualificationKindEnum.enumValues;

function toDate(value: FormDataEntryValue | null): Date | null {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ───────────────────────────────────────────────────────── Fiche employé ── */

const employeeFormSchema = z.object({
  matricule: z.string().min(1, 'Matricule requis.').max(30),
  firstName: z.string().min(1, 'Prénom requis.').max(80),
  lastName: z.string().min(1, 'Nom requis.').max(80),
  workshopId: z.uuid().optional(),
  jobTitle: z.string().min(1, 'Poste requis.').max(120),
  shift: z.enum(SHIFTS),
  hourlyCostEuros: z.coerce.number().min(0).max(1_000),
});

function readEmployeeForm(formData: FormData) {
  return {
    matricule: String(formData.get('matricule') ?? '').trim(),
    firstName: String(formData.get('firstName') ?? '').trim(),
    lastName: String(formData.get('lastName') ?? '').trim(),
    workshopId: String(formData.get('workshopId') ?? '').trim() || undefined,
    jobTitle: String(formData.get('jobTitle') ?? '').trim(),
    shift: String(formData.get('shift') ?? 'morning'),
    hourlyCostEuros: formData.get('hourlyCostEuros') || 0,
  };
}

export async function createEmployeeAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('hr:write');
  const parsed = employeeFormSchema.safeParse(readEmployeeForm(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const db = await getDb();
  const [existing] = await db
    .select({ id: t.employees.id })
    .from(t.employees)
    .where(eq(t.employees.matricule, parsed.data.matricule))
    .limit(1);
  if (existing) return { ok: false, message: `Le matricule « ${parsed.data.matricule} » est déjà utilisé.` };

  const hiredAt = toDate(formData.get('hiredAt'));

  const [employee] = await db
    .insert(t.employees)
    .values({
      matricule: parsed.data.matricule,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      workshopId: parsed.data.workshopId ?? null,
      jobTitle: parsed.data.jobTitle,
      shift: parsed.data.shift,
      hourlyCostCents: Math.round(parsed.data.hourlyCostEuros * 100),
      hiredAt,
    })
    .returning();

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'employee.create',
    entityType: 'employee',
    entityId: employee.id,
    entityLabel: `${employee.firstName} ${employee.lastName}`,
    newValue: { matricule: employee.matricule, jobTitle: employee.jobTitle, shift: employee.shift },
  });

  revalidatePath('/personnel');
  return { ok: true, message: `Fiche de ${employee.firstName} ${employee.lastName} créée.` };
}

export async function updateEmployeeAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('hr:write');
  const employeeId = String(formData.get('employeeId') ?? '');
  const idCheck = z.uuid().safeParse(employeeId);
  if (!idCheck.success) return { ok: false, message: 'Salarié invalide.' };

  const parsed = employeeFormSchema.safeParse(readEmployeeForm(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const db = await getDb();
  const [existing] = await db.select().from(t.employees).where(eq(t.employees.id, employeeId)).limit(1);
  if (!existing) return { ok: false, message: 'Salarié introuvable.' };

  const [duplicate] = await db
    .select({ id: t.employees.id })
    .from(t.employees)
    .where(eq(t.employees.matricule, parsed.data.matricule))
    .limit(1);
  if (duplicate && duplicate.id !== employeeId) {
    return { ok: false, message: `Le matricule « ${parsed.data.matricule} » est déjà utilisé.` };
  }

  const hiredAt = toDate(formData.get('hiredAt'));

  const next = {
    matricule: parsed.data.matricule,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    workshopId: parsed.data.workshopId ?? null,
    jobTitle: parsed.data.jobTitle,
    shift: parsed.data.shift,
    hourlyCostCents: Math.round(parsed.data.hourlyCostEuros * 100),
    hiredAt,
  };

  await db.update(t.employees).set(next).where(eq(t.employees.id, employeeId));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'employee.update',
    entityType: 'employee',
    entityId: employeeId,
    entityLabel: `${next.firstName} ${next.lastName}`,
    previousValue: {
      matricule: existing.matricule,
      jobTitle: existing.jobTitle,
      shift: existing.shift,
      workshopId: existing.workshopId,
    },
    newValue: { matricule: next.matricule, jobTitle: next.jobTitle, shift: next.shift, workshopId: next.workshopId },
  });

  revalidatePath('/personnel');
  return { ok: true, message: 'Fiche mise à jour.' };
}

export async function toggleEmployeeActiveAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('hr:write');
  const employeeId = String(formData.get('employeeId') ?? '');
  const idCheck = z.uuid().safeParse(employeeId);
  if (!idCheck.success) return { ok: false, message: 'Salarié invalide.' };

  const db = await getDb();
  const [employee] = await db.select().from(t.employees).where(eq(t.employees.id, employeeId)).limit(1);
  if (!employee) return { ok: false, message: 'Salarié introuvable.' };

  const nextActive = !employee.isActive;
  await db.update(t.employees).set({ isActive: nextActive }).where(eq(t.employees.id, employeeId));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: nextActive ? 'employee.activate' : 'employee.deactivate',
    entityType: 'employee',
    entityId: employeeId,
    entityLabel: `${employee.firstName} ${employee.lastName}`,
    previousValue: { isActive: employee.isActive },
    newValue: { isActive: nextActive },
  });

  revalidatePath('/personnel');
  return { ok: true, message: nextActive ? 'Salarié réactivé.' : 'Salarié désactivé.' };
}

/* ───────────────────────────────────────────────────────────── Absences ── */

const absenceFormSchema = z.object({
  employeeId: z.uuid(),
  type: z.enum(ABSENCE_TYPES),
  reason: z.string().max(300).optional(),
});

export async function declareAbsenceAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('hr:write');
  const parsed = absenceFormSchema.safeParse({
    employeeId: formData.get('employeeId'),
    type: formData.get('type'),
    reason: String(formData.get('reason') ?? '').trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const startsAt = toDate(formData.get('startsAt'));
  const endsAt = toDate(formData.get('endsAt'));
  if (!startsAt || !endsAt) return { ok: false, message: 'Dates de début et de fin requises.' };
  if (endsAt < startsAt) return { ok: false, message: 'La date de fin doit suivre la date de début.' };

  const db = await getDb();
  const [employee] = await db
    .select({ id: t.employees.id, firstName: t.employees.firstName, lastName: t.employees.lastName })
    .from(t.employees)
    .where(eq(t.employees.id, parsed.data.employeeId))
    .limit(1);
  if (!employee) return { ok: false, message: 'Salarié introuvable.' };

  const [absence] = await db
    .insert(t.absences)
    .values({
      employeeId: employee.id,
      type: parsed.data.type,
      startsAt,
      endsAt,
      reason: parsed.data.reason ?? null,
    })
    .returning();

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'absence.declare',
    entityType: 'absence',
    entityId: absence.id,
    entityLabel: `${employee.firstName} ${employee.lastName}`,
    newValue: { type: absence.type, startsAt: absence.startsAt, endsAt: absence.endsAt },
  });

  revalidatePath('/personnel');
  return { ok: true, message: 'Absence déclarée.' };
}

/* ────────────────────────────────────────────────────────── Habilitations ── */

const qualificationFormSchema = z.object({
  employeeId: z.uuid(),
  kind: z.enum(QUALIFICATION_KINDS),
  label: z.string().min(1, 'Libellé requis.').max(160),
  alertLeadDays: z.coerce.number().int().min(0).max(730).default(90),
});

export async function addQualificationAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('hr:write');
  const parsed = qualificationFormSchema.safeParse({
    employeeId: formData.get('employeeId'),
    kind: formData.get('kind'),
    label: String(formData.get('label') ?? '').trim(),
    alertLeadDays: formData.get('alertLeadDays') || 90,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const obtainedAt = toDate(formData.get('obtainedAt'));
  if (!obtainedAt) return { ok: false, message: "Date d'obtention requise." };
  const expiresAt = toDate(formData.get('expiresAt'));

  const db = await getDb();
  const [employee] = await db
    .select({ id: t.employees.id, firstName: t.employees.firstName, lastName: t.employees.lastName })
    .from(t.employees)
    .where(eq(t.employees.id, parsed.data.employeeId))
    .limit(1);
  if (!employee) return { ok: false, message: 'Salarié introuvable.' };

  const [qualification] = await db
    .insert(t.qualifications)
    .values({
      employeeId: employee.id,
      kind: parsed.data.kind,
      label: parsed.data.label,
      obtainedAt,
      expiresAt,
      alertLeadDays: parsed.data.alertLeadDays,
    })
    .returning();

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'qualification.create',
    entityType: 'qualification',
    entityId: qualification.id,
    entityLabel: `${employee.firstName} ${employee.lastName} — ${qualification.label}`,
    newValue: { kind: qualification.kind, expiresAt: qualification.expiresAt },
  });

  revalidatePath('/personnel');
  return { ok: true, message: 'Habilitation ajoutée.' };
}

/* ──────────────────────────────────────────────────────────── Compétences ── */

const skillFormSchema = z.object({
  employeeId: z.uuid(),
  skillId: z.uuid(),
  level: z.coerce.number().int().min(1).max(4),
});

export async function assignSkillAction(
  _state: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('hr:write');
  const parsed = skillFormSchema.safeParse({
    employeeId: formData.get('employeeId'),
    skillId: formData.get('skillId'),
    level: formData.get('level') || 1,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const db = await getDb();
  const [employee] = await db
    .select({ id: t.employees.id, firstName: t.employees.firstName, lastName: t.employees.lastName })
    .from(t.employees)
    .where(eq(t.employees.id, parsed.data.employeeId))
    .limit(1);
  if (!employee) return { ok: false, message: 'Salarié introuvable.' };

  const [skill] = await db.select().from(t.skills).where(eq(t.skills.id, parsed.data.skillId)).limit(1);
  if (!skill) return { ok: false, message: 'Compétence introuvable.' };

  await db
    .insert(t.employeeSkills)
    .values({ employeeId: employee.id, skillId: skill.id, level: parsed.data.level })
    .onConflictDoUpdate({
      target: [t.employeeSkills.employeeId, t.employeeSkills.skillId],
      set: { level: parsed.data.level },
    });

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'employee_skill.assign',
    entityType: 'employee_skill',
    entityId: `${employee.id}:${skill.id}`,
    entityLabel: `${employee.firstName} ${employee.lastName} — ${skill.name}`,
    newValue: { skill: skill.code, level: parsed.data.level },
  });

  revalidatePath('/personnel');
  return { ok: true, message: 'Compétence ajoutée.' };
}
