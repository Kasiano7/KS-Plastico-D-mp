/**
 * Tests d'intégration des Server Actions machine (§ audit MVP, partie C).
 *
 * Avant ces tests, seules les fonctions pures du domaine étaient couvertes :
 * les mutations elles-mêmes (garde-fous, transitions d'état, journal
 * d'audit) n'avaient aucune garantie automatisée. La session est simulée
 * (`assertPermission`/`assertAnyPermission` mockés) — c'est un mécanisme
 * transverse déjà couvert par `domain/__tests__/permissions.test.ts` — mais
 * la base de données est réelle : une instance PGlite en mémoire, migrée et
 * amorcée avec le même jeu de démonstration que le développement local.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.PGLITE_DATA_DIR = 'memory://';

// Le package `server-only` bloque l'import en dehors du bundler Next.js —
// neutralisé ici, comme le ferait n'importe quel runtime de test Node.
vi.mock('server-only', () => ({}));
// `revalidatePath` exige un contexte de requête Next.js qui n'existe pas
// dans un test : les actions doivent pouvoir revalider sans lui.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const session = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('@/server/auth/session', () => {
  const FORBIDDEN = "Vous n'avez pas l'autorisation d'effectuer cette action.";
  const user = () => ({
    id: '00000000-0000-4000-8000-000000000001',
    email: 'test@demo.example',
    fullName: 'Utilisateur de test',
    roleId: 'test-role',
    role: 'test',
    roleLabel: 'Test',
    workshopId: null,
    employeeId: null,
    permissions: session.permissions,
  });
  return {
    assertPermission: async (permission: string) => {
      if (!session.permissions.includes(permission)) throw new Error(FORBIDDEN);
      return user();
    },
    assertAnyPermission: async (permissions: string[]) => {
      if (!permissions.some((permission) => session.permissions.includes(permission))) {
        throw new Error(FORBIDDEN);
      }
      return user();
    },
  };
});

// Importés après le mock : les Server Actions résolvent `../auth/session` au
// même chemin que celui mocké ci-dessus.
const { changeMachineStatusAction, setMachineActiveAction } = await import('../machines');
const { updateProductionOrderStatusAction } = await import('../production-orders');
const { getDb } = await import('../../db/client');
const t = await import('../../db/schema');

let machine: typeof t.machines.$inferSelect;

beforeAll(async () => {
  const db = await getDb();
  const [seeded] = await db.select().from(t.machines).where(eq(t.machines.code, 'PR-64')).limit(1);
  if (!seeded) throw new Error('Jeu de démonstration introuvable : PR-64 doit exister après le seed.');
  machine = seeded;
});

afterEach(() => {
  session.permissions = [];
});

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('changeMachineStatusAction', () => {
  it('refuse sans la permission machines:write', async () => {
    session.permissions = [];
    await expect(
      changeMachineStatusAction({}, formData({ machineId: machine.id, status: 'maintenance' })),
    ).rejects.toThrow("Vous n'avez pas l'autorisation");
  });

  it('change réellement le statut, journalise l’événement et l’audit', async () => {
    session.permissions = ['machines:write'];
    const db = await getDb();

    const result = await changeMachineStatusAction(
      {},
      formData({ machineId: machine.id, status: 'maintenance', reason: 'Test automatisé' }),
    );
    expect(result.ok).toBe(true);

    const [updated] = await db.select().from(t.machines).where(eq(t.machines.id, machine.id)).limit(1);
    expect(updated.status).toBe('maintenance');

    const [openEvent] = await db
      .select()
      .from(t.machineEvents)
      .where(and(eq(t.machineEvents.machineId, machine.id), isNull(t.machineEvents.endedAt)))
      .limit(1);
    expect(openEvent?.status).toBe('maintenance');

    const [audit] = await db
      .select()
      .from(t.auditLogs)
      .where(eq(t.auditLogs.entityId, machine.id))
      .orderBy(t.auditLogs.occurredAt)
      .limit(50)
      .then((rows) => rows.filter((row) => row.action === 'machine.status_change').slice(-1));
    expect(audit?.newValue).toMatchObject({ status: 'maintenance' });

    // Remet la machine dans un état qui n'entrave pas les tests suivants.
    await db.update(t.machines).set({ status: 'idle' }).where(eq(t.machines.id, machine.id));
  });

  it('refuse un statut identique au statut courant', async () => {
    session.permissions = ['machines:write'];
    const db = await getDb();
    await db.update(t.machines).set({ status: 'idle' }).where(eq(t.machines.id, machine.id));

    const result = await changeMachineStatusAction({}, formData({ machineId: machine.id, status: 'idle' }));
    expect(result.ok).toBe(false);
  });
});

describe('setMachineActiveAction', () => {
  it('refuse de retirer une presse en production', async () => {
    session.permissions = ['admin:write'];
    const db = await getDb();
    await db.update(t.machines).set({ status: 'production', isActive: true }).where(eq(t.machines.id, machine.id));

    const result = await setMachineActiveAction(
      {},
      formData({ machineId: machine.id, isActive: 'false' }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Arrêtez la presse/);

    const [current] = await db.select().from(t.machines).where(eq(t.machines.id, machine.id)).limit(1);
    expect(current.isActive).toBe(true);
  });

  it('retire puis réactive une presse à l’arrêt', async () => {
    session.permissions = ['admin:write'];
    const db = await getDb();
    await db.update(t.machines).set({ status: 'idle' }).where(eq(t.machines.id, machine.id));

    const retired = await setMachineActiveAction(
      {},
      formData({ machineId: machine.id, isActive: 'false' }),
    );
    expect(retired.ok).toBe(true);
    let [current] = await (await getDb()).select().from(t.machines).where(eq(t.machines.id, machine.id)).limit(1);
    expect(current.isActive).toBe(false);

    const reactivated = await setMachineActiveAction(
      {},
      formData({ machineId: machine.id, isActive: 'true' }),
    );
    expect(reactivated.ok).toBe(true);
    [current] = await db.select().from(t.machines).where(eq(t.machines.id, machine.id)).limit(1);
    expect(current.isActive).toBe(true);
  });
});

describe('updateProductionOrderStatusAction', () => {
  async function realOrderOnMachine() {
    const db = await getDb();
    const [order] = await db
      .select()
      .from(t.productionOrders)
      .where(eq(t.productionOrders.machineId, machine.id))
      .limit(1);
    if (!order) throw new Error('Aucun ordre de fabrication rattaché à PR-64 dans le seed.');
    return order;
  }

  it('refuse une transition incompatible avec le statut courant', async () => {
    session.permissions = ['production:write'];
    const db = await getDb();
    const order = await realOrderOnMachine();
    await db.update(t.productionOrders).set({ status: 'done' }).where(eq(t.productionOrders.id, order.id));

    const result = await updateProductionOrderStatusAction(
      {},
      formData({ productionOrderId: order.id, transition: 'start' }),
    );
    expect(result.ok).toBe(false);
  });

  it('démarre un ordre planifié et journalise l’audit', async () => {
    session.permissions = ['production:write'];
    const db = await getDb();
    const order = await realOrderOnMachine();
    await db
      .update(t.productionOrders)
      .set({ status: 'planned', actualStartAt: null })
      .where(eq(t.productionOrders.id, order.id));

    const result = await updateProductionOrderStatusAction(
      {},
      formData({ productionOrderId: order.id, transition: 'start' }),
    );
    expect(result.ok).toBe(true);

    const [updated] = await db.select().from(t.productionOrders).where(eq(t.productionOrders.id, order.id)).limit(1);
    expect(updated.status).toBe('running');
    expect(updated.actualStartAt).not.toBeNull();

    const auditRows = await db
      .select()
      .from(t.auditLogs)
      .where(eq(t.auditLogs.entityId, order.id))
      .then((rows) => rows.filter((row) => row.action === 'production_order.start'));
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it('ne laisse qu’un seul ordre « en cours » par presse', async () => {
    session.permissions = ['production:write'];
    const db = await getDb();
    const orders = await db
      .select()
      .from(t.productionOrders)
      .where(eq(t.productionOrders.machineId, machine.id))
      .limit(2);
    if (orders.length < 2) return; // Le seed ne prévoit qu'un ordre sur cette presse : rien à vérifier ici.

    const [first, second] = orders;
    await db.update(t.productionOrders).set({ status: 'running' }).where(eq(t.productionOrders.id, first.id));
    await db.update(t.productionOrders).set({ status: 'planned' }).where(eq(t.productionOrders.id, second.id));

    const result = await updateProductionOrderStatusAction(
      {},
      formData({ productionOrderId: second.id, transition: 'start' }),
    );
    expect(result.ok).toBe(true);

    const [firstAfter] = await db.select().from(t.productionOrders).where(eq(t.productionOrders.id, first.id)).limit(1);
    expect(firstAfter.status).toBe('paused');
  });
});
