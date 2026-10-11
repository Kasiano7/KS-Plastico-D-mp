import { eq, inArray } from 'drizzle-orm';
import { gatewayPayloadSchema, ingestGatewayPayload } from '@/server/telemetry/ingestion';
import { gatewayAuthError } from '@/server/telemetry/gateway-auth';
import { scheduleAlertEvaluation } from '@/server/services/alert-scheduling';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1_000;

export async function GET(request: Request) {
  const authError = gatewayAuthError(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const requestedCodes = [...new Set(url.searchParams.getAll('machineCode'))]
    .filter((code) => code.length > 0 && code.length <= 40)
    .slice(0, 20);

  const db = await getDb();
  const machines = await db
    .select({
      id: t.machines.id,
      code: t.machines.code,
      name: t.machines.name,
      tonnage: t.machines.tonnage,
      currentMoldReference: t.molds.reference,
    })
    .from(t.machines)
    .leftJoin(t.molds, eq(t.machines.currentMoldId, t.molds.id))
    .where(requestedCodes.length > 0 ? inArray(t.machines.code, requestedCodes) : undefined)
    .orderBy(t.machines.code);

  const machineIds = machines.map((machine) => machine.id);
  const compatibilities = machineIds.length > 0
    ? await db
        .select({
          machineId: t.moldMachines.machineId,
          reference: t.molds.reference,
          name: t.molds.name,
        })
        .from(t.moldMachines)
        .innerJoin(t.molds, eq(t.moldMachines.moldId, t.molds.id))
        .where(inArray(t.moldMachines.machineId, machineIds))
        .orderBy(t.molds.reference)
    : [];

  return Response.json({
    ok: true,
    machines: machines.map((machine) => ({
      code: machine.code,
      name: machine.name,
      tonnage: machine.tonnage,
      currentMoldReference: machine.currentMoldReference,
      compatibleMolds: compatibilities
        .filter((compatibility) => compatibility.machineId === machine.id)
        .map(({ reference, name }) => ({ reference, name })),
    })),
  });
}

export async function POST(request: Request) {
  const authError = gatewayAuthError(request);
  if (authError) return authError;

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ ok: false, error: 'Le contenu doit être du JSON.' }, { status: 415 });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'Lot trop volumineux.' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'Lot trop volumineux.' }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'JSON invalide.' }, { status: 400 });
  }

  const parsed = gatewayPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'Relevés invalides.', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const now = Date.now();
  const incoherentTimestamp = parsed.data.readings.some(
    (reading) => Math.abs(new Date(reading.recordedAt).getTime() - now) > MAX_CLOCK_DRIFT_MS,
  );
  if (incoherentTimestamp) {
    return Response.json(
      { ok: false, error: 'Horodatage refusé : écart supérieur à cinq minutes.' },
      { status: 400 },
    );
  }

  try {
    const result = await ingestGatewayPayload(parsed.data);

    /*
     * La passerelle bat en continu : elle sert donc d'horloge à la détection
     * des alertes dérivées, qui ne tournait qu'une fois par jour faute d'une
     * seconde planification. L'appel est plafonné à une évaluation par quart
     * d'heure et n'est pas attendu — un relevé perdu coûte plus cher qu'une
     * alerte différée.
     */
    scheduleAlertEvaluation();

    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error('Échec ingestion télémétrie passerelle', error);
    return Response.json({ ok: false, error: 'Ingestion momentanément indisponible.' }, { status: 500 });
  }
}
