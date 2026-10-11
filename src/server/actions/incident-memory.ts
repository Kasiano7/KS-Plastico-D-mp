'use server';

import { desc, eq, isNotNull, or } from 'drizzle-orm';
import { assertAnyPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { findSimilarIncidents, type SimilarIncident } from '../domain/incident-memory';

/**
 * Recherche d'incidents similaires pendant la saisie d'un signalement.
 *
 * Appelée au fil de la frappe : c'est le moment où l'information sert. La
 * montrer après l'enregistrement serait trop tard — le diagnostic aura déjà
 * commencé.
 *
 * Lecture seule, et gardée : la mémoire des pannes contient les causes racines
 * de l'usine, elle n'est pas publique.
 */
export type IncidentMemoryResult = {
  matches: {
    reference: string;
    symptom: string;
    rootCause: string | null;
    resolution: string | null;
    machineName: string | null;
    downtimeMinutes: number;
    occurredAt: string;
    matchedTerms: string[];
    sameMachine: boolean;
  }[];
};

/** Au-delà, la requête devient coûteuse sans devenir plus pertinente. */
const HISTORY_LIMIT = 400;

export async function searchIncidentMemoryAction(
  symptom: string,
  machineId: string | null,
): Promise<IncidentMemoryResult> {
  await assertAnyPermission(['maintenance:read', 'incidents:declare']);

  if (symptom.trim().length < 6) return { matches: [] };

  const db = await getDb();
  const rows = await db
    .select({
      id: t.incidents.id,
      reference: t.incidents.reference,
      symptom: t.incidents.symptom,
      rootCause: t.incidents.rootCause,
      resolution: t.incidents.resolution,
      tags: t.incidents.tags,
      machineId: t.incidents.machineId,
      machineName: t.machines.name,
      downtimeMinutes: t.incidents.downtimeMinutes,
      occurredAt: t.incidents.occurredAt,
    })
    .from(t.incidents)
    .leftJoin(t.machines, eq(t.incidents.machineId, t.machines.id))
    // Un incident sans diagnostic n'apprend rien : autant ne pas le charger.
    .where(or(isNotNull(t.incidents.rootCause), isNotNull(t.incidents.resolution)))
    .orderBy(desc(t.incidents.occurredAt))
    .limit(HISTORY_LIMIT);

  const similar: SimilarIncident[] = findSimilarIncidents(symptom, rows, { machineId });

  return {
    matches: similar.map((entry) => ({
      reference: entry.incident.reference,
      symptom: entry.incident.symptom,
      rootCause: entry.incident.rootCause,
      resolution: entry.incident.resolution,
      machineName: entry.incident.machineName,
      downtimeMinutes: entry.incident.downtimeMinutes,
      occurredAt: entry.incident.occurredAt.toISOString(),
      matchedTerms: entry.matchedTerms,
      sameMachine: entry.sameMachine,
    })),
  };
}
