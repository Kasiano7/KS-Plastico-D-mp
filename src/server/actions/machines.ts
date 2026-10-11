'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { assertAnyPermission, assertPermission, type SessionUser } from '../auth/session';
import { getDb, type Database } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';
import { DEFAULT_OPERATOR_HOURLY_COST_CENTS, computeDowntimeImpact } from '../domain/costing';
import { createAbruptStopRecords } from '../services/machine-stop';
import { nextIncidentReference } from '../services/incidents';
import { RETIRE_BLOCKED_STATUSES } from '../domain/machines';
import { demoWriteRefusal } from '../demo/guard';

export type ActionState = { ok?: boolean; message?: string };

const STATUS_TO_EVENT = {
  production: 'production_start',
  setup: 'setup',
  mold_change: 'mold_change',
  stopped: 'stop',
  fault: 'fault',
  maintenance: 'maintenance',
  idle: 'restart',
} as const;

const statusSchema = z.object({
  machineId: z.uuid(),
  status: z.enum(['production', 'setup', 'mold_change', 'stopped', 'fault', 'maintenance', 'idle']),
  reason: z.string().max(300).optional(),
});

/**
 * Changement d'état machine (§42).
 * Clôture l'événement en cours et en ouvre un nouveau : la timeline reste
 * reconstituable à la minute près.
 */
export async function changeMachineStatusAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('machines:write');

  const parsed = statusSchema.safeParse({
    machineId: formData.get('machineId'),
    status: formData.get('status'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const db = await getDb();
  const [machine] = await db
    .select()
    .from(t.machines)
    .where(eq(t.machines.id, parsed.data.machineId))
    .limit(1);
  if (!machine) return { ok: false, message: 'Machine introuvable.' };
  if (machine.status === parsed.data.status) {
    return { ok: false, message: 'La machine est déjà dans cet état.' };
  }

  const now = new Date();

  const [openEvent] = await db
    .select()
    .from(t.machineEvents)
    .where(and(eq(t.machineEvents.machineId, machine.id), isNull(t.machineEvents.endedAt)))
    .orderBy(desc(t.machineEvents.startedAt))
    .limit(1);

  if (openEvent) {
    await db
      .update(t.machineEvents)
      .set({
        endedAt: now,
        durationMinutes: Math.max(
          Math.round((now.getTime() - openEvent.startedAt.getTime()) / 60_000),
          0,
        ),
      })
      .where(eq(t.machineEvents.id, openEvent.id));
  }

  await db.insert(t.machineEvents).values({
    machineId: machine.id,
    type: STATUS_TO_EVENT[parsed.data.status],
    status: parsed.data.status,
    startedAt: now,
    reason: parsed.data.reason ?? null,
    source: 'manual',
  });

  await db
    .update(t.machines)
    .set({ status: parsed.data.status, statusSince: now })
    .where(eq(t.machines.id, machine.id));

  const abruptStop =
    (parsed.data.status === 'stopped' || parsed.data.status === 'fault') &&
    machine.status !== 'stopped' &&
    machine.status !== 'fault';
  const stopRecords = abruptStop
    ? await createAbruptStopRecords({
        db,
        machine,
        user,
        reason: parsed.data.reason,
        occurredAt: now,
      })
    : null;

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'machine.status_change',
    entityType: 'machine',
    entityId: machine.id,
    entityLabel: machine.name,
    previousValue: { status: machine.status, since: machine.statusSince },
    newValue: { status: parsed.data.status, since: now },
    justification: parsed.data.reason ?? null,
  });

  revalidatePath('/machines');
  revalidatePath(`/machines/${machine.id}`);
  // Le catalogue de moules liste les presses compatibles : il doit suivre.
  revalidatePath('/moules');
  revalidatePath('/');
  revalidatePath('/production');
  revalidatePath('/maintenance');
  revalidatePath('/alertes');

  return {
    ok: true,
    message: stopRecords
      ? `${machine.name} : arrêt enregistré. ${stopRecords.incident.reference} créé et responsables production/maintenance avertis.`
      : `${machine.name} : état mis à jour.`,
  };
}

const incidentSchema = z.object({
  machineId: z.uuid(),
  title: z.string().min(4, 'Titre trop court.').max(160),
  symptom: z.string().min(10, 'Décrivez le symptôme observé.').max(2000),
  severity: z.enum(['info', 'warning', 'critical']),
  downtimeMinutes: z.coerce.number().int().min(0).max(10_000).default(0),
  tags: z.string().max(300).optional(),
});

/**
 * Déclaration d'incident (§35).
 * L'incident nourrit la mémoire de l'usine ET, s'il est significatif, ouvre
 * une alerte dont l'impact financier est calculé, pas saisi.
 */
export async function declareIncidentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertAnyPermission(['incidents:declare', 'maintenance:write']);

  const parsed = incidentSchema.safeParse({
    machineId: formData.get('machineId'),
    title: formData.get('title'),
    symptom: formData.get('symptom'),
    severity: formData.get('severity'),
    downtimeMinutes: formData.get('downtimeMinutes') ?? 0,
    tags: formData.get('tags') || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Requête invalide.' };
  }

  const db = await getDb();
  const now = new Date();

  const [machine] = await db
    .select({
      machine: t.machines,
      workshopId: t.workshops.id,
    })
    .from(t.machines)
    .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
    .where(eq(t.machines.id, parsed.data.machineId))
    .limit(1);
  if (!machine) return { ok: false, message: 'Machine introuvable.' };

  // « La machine est arrêtée » doit se refléter sur la machine elle-même,
  // sinon la tuile continue d'afficher un état obsolète (§ poste opérateur).
  const machineStopped =
    parsed.data.severity === 'critical' &&
    machine.machine.status !== 'stopped' &&
    machine.machine.status !== 'fault';

  // Impact chiffré à partir de l'ordre en cours, jamais d'un nombre arbitraire.
  const [currentOrder] = await db
    .select({
      plannedUnitsPerHour: t.productionOrders.plannedUnitsPerHour,
      unitPriceCents: t.products.unitPriceCents,
      unitCostCents: t.products.unitCostCents,
      customerOrderId: t.productionOrders.customerOrderId,
    })
    .from(t.productionOrders)
    .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
    .where(
      and(eq(t.productionOrders.machineId, machine.machine.id), eq(t.productionOrders.status, 'running')),
    )
    .limit(1);

  const impact =
    parsed.data.downtimeMinutes > 0 && currentOrder
      ? computeDowntimeImpact({
          downtimeMinutes: parsed.data.downtimeMinutes,
          unitsPerHour: currentOrder.plannedUnitsPerHour,
          unitPriceCents: currentOrder.unitPriceCents,
          unitCostCents: currentOrder.unitCostCents,
          idleOperators: 1,
          operatorHourlyCostCents: DEFAULT_OPERATOR_HOURLY_COST_CENTS,
          machineHourlyCostCents: machine.machine.hourlyCostCents,
        })
      : null;

  // Référence métier séquentielle : INC-<année>-<rang>.
  const reference = await nextIncidentReference(db, now);

  const [incident] = await db
    .insert(t.incidents)
    .values({
      reference,
      title: parsed.data.title,
      severity: parsed.data.severity,
      status: 'open',
      machineId: machine.machine.id,
      workshopId: machine.workshopId,
      symptom: parsed.data.symptom,
      tags: parsed.data.tags
        ? parsed.data.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
        : null,
      downtimeMinutes: parsed.data.downtimeMinutes,
      estimatedCostCents: impact?.totalCents ?? 0,
      declaredBy: user.employeeId ?? null,
      occurredAt: now,
    })
    .returning();

  if (machineStopped) {
    const previousStatus = machine.machine.status;
    const previousStatusSince = machine.machine.statusSince;

    const [openEvent] = await db
      .select()
      .from(t.machineEvents)
      .where(and(eq(t.machineEvents.machineId, machine.machine.id), isNull(t.machineEvents.endedAt)))
      .orderBy(desc(t.machineEvents.startedAt))
      .limit(1);

    if (openEvent) {
      await db
        .update(t.machineEvents)
        .set({
          endedAt: now,
          durationMinutes: Math.max(
            Math.round((now.getTime() - openEvent.startedAt.getTime()) / 60_000),
            0,
          ),
        })
        .where(eq(t.machineEvents.id, openEvent.id));
    }

    await db.insert(t.machineEvents).values({
      machineId: machine.machine.id,
      type: 'stop',
      status: 'stopped',
      startedAt: now,
      reason: parsed.data.title,
      productionOrderId: null,
      source: 'manual',
    });

    await db
      .update(t.machines)
      .set({ status: 'stopped', statusSince: now })
      .where(eq(t.machines.id, machine.machine.id));

    await recordAudit({
      userId: user.id,
      userLabel: user.fullName,
      action: 'machine.status_change',
      entityType: 'machine',
      entityId: machine.machine.id,
      entityLabel: machine.machine.name,
      previousValue: { status: previousStatus, since: previousStatusSince },
      newValue: { status: 'stopped', since: now },
      justification: `Incident ${reference} — ${parsed.data.title}`,
    });
  }

  if (parsed.data.severity !== 'info') {
    await db.insert(t.alerts).values({
      severity: parsed.data.severity,
      status: 'open',
      domain: 'machine',
      title: `${machine.machine.name} — ${parsed.data.title}`,
      problem: parsed.data.symptom,
      probableCause: null,
      consequences:
        parsed.data.downtimeMinutes > 0
          ? `${parsed.data.downtimeMinutes} minutes de production perdues sur ${machine.machine.name}.`
          : null,
      impactCents: impact?.totalCents ?? 0,
      impactOrigin: 'estimated',
      machineId: machine.machine.id,
      workshopId: machine.workshopId,
      incidentId: incident.id,
      customerOrderId: currentOrder?.customerOrderId ?? null,
      detectedAt: now,
    });
  }

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'incident.declare',
    entityType: 'incident',
    entityId: incident.id,
    entityLabel: reference,
    newValue: {
      severity: parsed.data.severity,
      downtimeMinutes: parsed.data.downtimeMinutes,
      estimatedCostCents: impact?.totalCents ?? 0,
    },
  });

  revalidatePath('/machines');
  revalidatePath(`/machines/${machine.machine.id}`);
  revalidatePath('/alertes');
  revalidatePath('/historique');
  revalidatePath('/');

  return {
    ok: true,
    message: `Incident ${reference} déclaré${impact ? ` — impact estimé ${(impact.totalCents / 100).toLocaleString('fr-FR')} €` : ''}.${machineStopped ? ` ${machine.machine.name} passée à l'arrêt.` : ''}`,
  };
}

const machineSchema = z.object({
  code: z.string().trim().min(2, 'Code trop court.').max(20, 'Code trop long (20 caractères max).'),
  name: z.string().trim().min(2, 'Nom trop court.').max(120),
  workshopId: z.uuid('Atelier requis.'),
  tonnage: z.coerce.number().int().min(0).max(100_000),
  manufacturer: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  hourlyCostEuros: z.coerce.number().min(0).max(10_000),
  dailyCapacityHours: z.coerce.number().min(0).max(24),
  serialNumber: z.string().trim().max(120).optional(),
  manufacturingYear: z.coerce.number().int().min(1970).max(2100).optional(),
  totalHours: z.coerce.number().int().min(0).optional(),
  productionHours: z.coerce.number().int().min(0).optional(),
  controlSoftware: z.string().trim().max(120).optional(),
  controlSoftwareVersion: z.string().trim().max(60).optional(),
});

function readMachineForm(formData: FormData) {
  return machineSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    workshopId: formData.get('workshopId'),
    tonnage: formData.get('tonnage') || 0,
    manufacturer: formData.get('manufacturer') || undefined,
    model: formData.get('model') || undefined,
    hourlyCostEuros: formData.get('hourlyCostEuros') || 0,
    dailyCapacityHours: formData.get('dailyCapacityHours') || 21,
    serialNumber: formData.get('serialNumber') || undefined,
    manufacturingYear: formData.get('manufacturingYear') || undefined,
    totalHours: formData.get('totalHours') || undefined,
    productionHours: formData.get('productionHours') || undefined,
    controlSoftware: formData.get('controlSoftware') || undefined,
    controlSoftwareVersion: formData.get('controlSoftwareVersion') || undefined,
  });
}

const PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PHOTO_ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type PhotoResolution = { ok: true; photoId: string | null } | { ok: false; message: string };

/**
 * Résout la photo à associer à la machine — soit un nouvel import (ajouté à
 * la photothèque partagée et prioritaire), soit une photo déjà en
 * photothèque choisie dans la galerie (`photoId`), soit aucune (retombe sur
 * l'illustration générique). Jamais les deux à la fois : un import écrase
 * toujours une sélection de galerie laissée par erreur dans le formulaire.
 */
async function resolveMachinePhotoId(
  db: Database,
  formData: FormData,
  user: SessionUser,
): Promise<PhotoResolution> {
  const file = formData.get('photo');
  if (file instanceof File && file.size > 0) {
    if (file.size > PHOTO_MAX_SIZE_BYTES) {
      return { ok: false, message: 'Photo trop volumineuse (5 Mo maximum).' };
    }
    if (file.type && !PHOTO_ACCEPTED_TYPES.has(file.type)) {
      return { ok: false, message: 'Format de photo non pris en charge (PNG, JPEG ou WebP).' };
    }

    const contentBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const [photo] = await db
      .insert(t.machinePhotos)
      .values({
        fileName: file.name || 'photo',
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        contentBase64,
        uploadedBy: user.id,
        uploadedByLabel: user.fullName,
      })
      .returning();

    return { ok: true, photoId: photo.id };
  }

  const photoIdField = String(formData.get('photoId') ?? '');
  if (photoIdField === '' || photoIdField === 'none') return { ok: true, photoId: null };

  if (!z.uuid().safeParse(photoIdField).success) {
    return { ok: false, message: 'Photo invalide.' };
  }
  const [existing] = await db
    .select({ id: t.machinePhotos.id })
    .from(t.machinePhotos)
    .where(eq(t.machinePhotos.id, photoIdField))
    .limit(1);
  if (!existing) return { ok: false, message: 'Photo introuvable — elle a peut-être été supprimée.' };

  return { ok: true, photoId: existing.id };
}

/**
 * Création d'une machine (§ parc machines).
 * Réservée à l'administration : ajouter une presse au parc est une décision
 * d'investissement, pas un ajustement de production courante.
 */
export async function createMachineAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('admin:write');

  const parsed = readMachineForm(formData);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };

  const db = await getDb();

  const [workshop] = await db
    .select({ id: t.workshops.id })
    .from(t.workshops)
    .where(eq(t.workshops.id, parsed.data.workshopId))
    .limit(1);
  if (!workshop) return { ok: false, message: 'Atelier introuvable.' };

  const [existing] = await db
    .select({ id: t.machines.id })
    .from(t.machines)
    .where(eq(t.machines.code, parsed.data.code))
    .limit(1);
  if (existing) return { ok: false, message: `Le code « ${parsed.data.code} » est déjà utilisé.` };

  const photoResolution = await resolveMachinePhotoId(db, formData, user);
  if (!photoResolution.ok) return { ok: false, message: photoResolution.message };

  const [machine] = await db
    .insert(t.machines)
    .values({
      code: parsed.data.code,
      name: parsed.data.name,
      workshopId: parsed.data.workshopId,
      tonnage: parsed.data.tonnage,
      manufacturer: parsed.data.manufacturer || null,
      model: parsed.data.model || null,
      hourlyCostCents: Math.round(parsed.data.hourlyCostEuros * 100),
      dailyCapacityHours: parsed.data.dailyCapacityHours,
      serialNumber: parsed.data.serialNumber || null,
      manufacturingYear: parsed.data.manufacturingYear ?? null,
      totalHours: parsed.data.totalHours ?? null,
      productionHours: parsed.data.productionHours ?? null,
      controlSoftware: parsed.data.controlSoftware || null,
      controlSoftwareVersion: parsed.data.controlSoftwareVersion || null,
      photoId: photoResolution.photoId,
    })
    .returning();

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'machine.create',
    entityType: 'machine',
    entityId: machine.id,
    entityLabel: machine.name,
    newValue: { code: machine.code, workshopId: machine.workshopId, tonnage: machine.tonnage },
  });

  revalidatePath('/machines');
  redirect(`/machines/${machine.id}`);
}

/**
 * Modification de la fiche d'une machine (plaque signalétique, atelier,
 * coût horaire…). Distincte du changement d'état, qui reste géré par
 * `changeMachineStatusAction`.
 */
export async function updateMachineAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('machines:write');

  const parsedId = z.uuid().safeParse(formData.get('machineId'));
  if (!parsedId.success) return { ok: false, message: 'Machine invalide.' };

  const parsed = readMachineForm(formData);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };

  const db = await getDb();
  const [machine] = await db.select().from(t.machines).where(eq(t.machines.id, parsedId.data)).limit(1);
  if (!machine) return { ok: false, message: 'Machine introuvable.' };

  const [workshop] = await db
    .select({ id: t.workshops.id })
    .from(t.workshops)
    .where(eq(t.workshops.id, parsed.data.workshopId))
    .limit(1);
  if (!workshop) return { ok: false, message: 'Atelier introuvable.' };

  if (parsed.data.code !== machine.code) {
    const [existing] = await db
      .select({ id: t.machines.id })
      .from(t.machines)
      .where(eq(t.machines.code, parsed.data.code))
      .limit(1);
    if (existing) return { ok: false, message: `Le code « ${parsed.data.code} » est déjà utilisé.` };
  }

  const photoResolution = await resolveMachinePhotoId(db, formData, user);
  if (!photoResolution.ok) return { ok: false, message: photoResolution.message };

  await db
    .update(t.machines)
    .set({
      code: parsed.data.code,
      name: parsed.data.name,
      workshopId: parsed.data.workshopId,
      tonnage: parsed.data.tonnage,
      manufacturer: parsed.data.manufacturer || null,
      model: parsed.data.model || null,
      hourlyCostCents: Math.round(parsed.data.hourlyCostEuros * 100),
      dailyCapacityHours: parsed.data.dailyCapacityHours,
      serialNumber: parsed.data.serialNumber || null,
      manufacturingYear: parsed.data.manufacturingYear ?? null,
      totalHours: parsed.data.totalHours ?? null,
      productionHours: parsed.data.productionHours ?? null,
      controlSoftware: parsed.data.controlSoftware || null,
      controlSoftwareVersion: parsed.data.controlSoftwareVersion || null,
      photoId: photoResolution.photoId,
    })
    .where(eq(t.machines.id, machine.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'machine.update',
    entityType: 'machine',
    entityId: machine.id,
    entityLabel: parsed.data.name,
    previousValue: {
      code: machine.code,
      name: machine.name,
      workshopId: machine.workshopId,
      tonnage: machine.tonnage,
    },
    newValue: {
      code: parsed.data.code,
      name: parsed.data.name,
      workshopId: parsed.data.workshopId,
      tonnage: parsed.data.tonnage,
    },
  });

  revalidatePath('/machines');
  revalidatePath(`/machines/${machine.id}`);
  // Le catalogue de moules liste les presses compatibles : il doit suivre.
  revalidatePath('/moules');
  return { ok: true, message: 'Fiche machine mise à jour.' };
}

const activeSchema = z.object({
  machineId: z.uuid(),
  isActive: z.enum(['true', 'false']),
});

/**
 * Retrait / réactivation d'une machine du parc actif (§ parc machines).
 * Une presse en production ne peut pas être retirée sans être arrêtée
 * d'abord — le retrait n'est jamais une correction d'état déguisée.
 */
export async function setMachineActiveAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('admin:write');

  const parsed = activeSchema.safeParse({
    machineId: formData.get('machineId'),
    isActive: formData.get('isActive'),
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const db = await getDb();
  const [machine] = await db
    .select()
    .from(t.machines)
    .where(eq(t.machines.id, parsed.data.machineId))
    .limit(1);
  if (!machine) return { ok: false, message: 'Machine introuvable.' };

  const nextActive = parsed.data.isActive === 'true';
  if (machine.isActive === nextActive) {
    return {
      ok: false,
      message: nextActive ? 'Cette machine est déjà active.' : 'Cette machine est déjà retirée du parc.',
    };
  }

  if (!nextActive && RETIRE_BLOCKED_STATUSES.has(machine.status)) {
    return { ok: false, message: 'Arrêtez la presse avant de la retirer du parc.' };
  }

  await db.update(t.machines).set({ isActive: nextActive }).where(eq(t.machines.id, machine.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: nextActive ? 'machine.reactivate' : 'machine.retire',
    entityType: 'machine',
    entityId: machine.id,
    entityLabel: machine.name,
    previousValue: { isActive: machine.isActive },
    newValue: { isActive: nextActive },
  });

  revalidatePath('/machines');
  revalidatePath(`/machines/${machine.id}`);
  // Le catalogue de moules liste les presses compatibles : il doit suivre.
  revalidatePath('/moules');
  return {
    ok: true,
    message: nextActive ? `${machine.name} réactivée.` : `${machine.name} retirée du parc.`,
  };
}
