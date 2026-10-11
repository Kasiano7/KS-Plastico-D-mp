import { describe, expect, it, vi } from 'vitest';
import type { FactoryContext } from '../../services/factory-context';
import { createAliasMap, type EmployeeIdentity } from '../../domain/ai-privacy';
import { createAiToolRegistry } from '../tools';
import type { AiQuestion } from '../types';

const david: EmployeeIdentity = { id: 'uuid-a72', matricule: 'E-005', firstName: 'David', lastName: 'Dupont' };
const marc: EmployeeIdentity = { id: 'uuid-b18', matricule: 'E-011', firstName: 'Marc', lastName: 'Leblanc' };

vi.mock('../../services/operator-production', () => ({
  getOperatorProductionToday: vi.fn(async () => [
    {
      employeeId: david.id,
      workshopId: 'workshop-a',
      workshopName: 'Atelier A',
      shift: 'morning',
      machineCodes: ['PR-63'],
      goodUnits: 400,
      rejectedUnits: 24,
      downtimeMinutes: 52,
      scrapRatePct: 5.7,
    },
    {
      employeeId: marc.id,
      workshopId: 'workshop-b',
      workshopName: 'Atelier B',
      shift: 'afternoon',
      machineCodes: ['PR-64'],
      goodUnits: 600,
      rejectedUnits: 12,
      downtimeMinutes: 12,
      scrapRatePct: 2,
    },
  ]),
}));

const context = {
  capturedAt: new Date('2026-08-14T12:00:00Z'),
  dayStart: new Date('2026-08-14T00:00:00Z'),
  health: { global: 80, dimensions: [], weakest: [] },
  healthSeverity: 'info',
  healthVariation: null,
  previousGlobalScore: null,
  production: {
    producedUnits: 150,
    targetUnits: 200,
    achievementPct: 75,
    rejectedUnits: 2,
    scrapRatePct: 1.3,
  },
  workshops: [
    {
      id: 'workshop-a',
      code: 'A',
      name: 'Atelier A',
      targetUnits: 100,
      producedUnits: 80,
      achievementPct: 80,
      severity: 'warning',
      machinesDown: 1,
      machinesTotal: 1,
    },
    {
      id: 'workshop-b',
      code: 'B',
      name: 'Atelier B',
      targetUnits: 100,
      producedUnits: 70,
      achievementPct: 70,
      severity: 'warning',
      machinesDown: 0,
      machinesTotal: 1,
    },
  ],
  machines: [
    {
      id: 'machine-63',
      code: 'PR-63',
      name: 'Presse 63',
      workshopId: 'workshop-a',
      workshopName: 'Atelier A',
      status: 'stopped',
      severity: 'critical',
      statusSince: new Date('2026-08-14T10:00:00Z'),
      downtimeMinutes: 120,
      plannedMinutes: 300,
      producedUnits: 80,
      rejectedUnits: 2,
      oeePct: 62,
      hourlyCostCents: 8500,
      reason: null,
      activitySeries: [],
    },
    {
      id: 'machine-64',
      code: 'PR-64',
      name: 'Presse 64',
      workshopId: 'workshop-b',
      workshopName: 'Atelier B',
      status: 'production',
      severity: 'normal',
      statusSince: new Date('2026-08-14T08:00:00Z'),
      downtimeMinutes: 0,
      plannedMinutes: 300,
      producedUnits: 70,
      rejectedUnits: 0,
      oeePct: 91,
      hourlyCostCents: 9100,
      reason: null,
      activitySeries: [],
    },
  ],
  orders: [
    { id: 'order-a', number: 'CMD-A', riskPct: 30, workshopIds: ['workshop-a'] },
    { id: 'order-b', number: 'CMD-B', riskPct: 10, workshopIds: ['workshop-b'] },
  ],
  inventory: [],
  staff: { required: 0, present: 0, roster: [], absentToday: [], expiringQualifications: [] },
  alerts: [],
  healthInput: {},
} as unknown as FactoryContext;

function question(overrides: Partial<AiQuestion> = {}): AiQuestion {
  return {
    question: 'Pourquoi la presse 63 est-elle en retard ?',
    role: "Chef d'atelier",
    permissions: ['dashboard:read', 'production:read', 'machines:read', 'maintenance:read'],
    canSeeFinancials: false,
    workshopId: 'workshop-a',
    ...overrides,
  };
}

describe('outils métier du copilote', () => {
  it('récupère la machine autorisée et signale une cause absente sans l’inventer', async () => {
    const registry = createAiToolRegistry(question(), async () => context);
    const result = await registry.execute('get_machine_status', JSON.stringify({ query: '63' }));

    expect(result.ok).toBe(true);
    expect(result.missingData).toContain("La cause de l'état courant n'est pas renseignée.");
  });

  it('cloisonne les machines et commandes au seul atelier de la session', async () => {
    const registry = createAiToolRegistry(
      question({ permissions: [...question().permissions, 'orders:read'] }),
      async () => context,
    );

    const otherMachine = await registry.execute(
      'get_machine_status',
      JSON.stringify({ query: '64' }),
    );
    const orders = await registry.execute(
      'get_current_orders',
      JSON.stringify({ atRiskOnly: false }),
    );

    expect(otherMachine.error).toBe('not_found');
    expect(orders.data).toEqual([expect.objectContaining({ number: 'CMD-A' })]);
  });

  it('n’expose ni n’exécute l’outil financier sans finance:read', async () => {
    const loader = vi.fn(async () => context);
    const registry = createAiToolRegistry(question(), loader);

    expect(registry.definitions.map((tool) => tool.name)).not.toContain('get_production_costs');
    await expect(registry.execute('get_production_costs', '{}')).resolves.toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe('get_operator_production — pseudonymisation (§7, §10, §17, §21)', () => {
  const employees = [david, marc];

  it('ne renvoie jamais de nom, prénom ou matricule — uniquement des alias', async () => {
    const aliasMap = createAliasMap(employees, () => 0);
    const registry = createAiToolRegistry(
      question({ permissions: [...question().permissions, 'hr:read', 'production:read'] }),
      async () => context,
      aliasMap,
    );

    const result = await registry.execute('get_operator_production', '{}');
    const payload = JSON.stringify(result);

    expect(result.ok).toBe(true);
    for (const employee of employees) {
      expect(payload).not.toContain(employee.firstName);
      expect(payload).not.toContain(employee.lastName);
      expect(payload).not.toContain(employee.matricule);
      expect(payload).not.toContain(employee.id);
    }
    expect(payload).toContain(aliasMap.aliasFor(david.id));
    expect(payload).toContain(aliasMap.aliasFor(marc.id));
  });

  it('deux appels distincts pseudonymisent le même salarié avec des alias différents', async () => {
    const firstCallAliasMap = createAliasMap(employees, () => 0);
    const secondCallAliasMap = createAliasMap(employees, (max) => max - 1);

    expect(firstCallAliasMap.aliasFor(david.id)).not.toBe(secondCallAliasMap.aliasFor(david.id));
  });

  it('exige hr:read ET production:read — refuse si l’un des deux manque', async () => {
    const aliasMap = createAliasMap(employees, () => 0);
    const registry = createAiToolRegistry(
      question({ permissions: ['dashboard:read', 'hr:read'] }), // sans production:read
      async () => context,
      aliasMap,
    );

    await expect(registry.execute('get_operator_production', '{}')).resolves.toMatchObject({
      ok: false,
      error: 'forbidden',
    });
  });

  it('n’expose pas l’outil sans hr:read', () => {
    const aliasMap = createAliasMap(employees, () => 0);
    const registry = createAiToolRegistry(question(), async () => context, aliasMap);
    expect(registry.definitions.map((tool) => tool.name)).not.toContain('get_operator_production');
  });

  it('refuse plutôt que de risquer une fuite quand aucun alias n’est disponible', async () => {
    const registry = createAiToolRegistry(
      question({ permissions: [...question().permissions, 'hr:read', 'production:read'] }),
      async () => context,
      // Pas d'aliasMap fourni — le fournisseur de démonstration n'appelle
      // jamais cet outil ; s'il l'était, aucune identité ne doit fuiter.
    );

    await expect(registry.execute('get_operator_production', '{}')).resolves.toMatchObject({
      ok: false,
    });
  });
});

