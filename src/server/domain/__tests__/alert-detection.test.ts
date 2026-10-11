import { describe, expect, it } from 'vitest';
import {
  detectInventoryIssues,
  detectMachineIssues,
  detectOrderRiskIssues,
  detectStaffQualificationIssues,
} from '../alert-detection';
import type { InventorySnapshot, MachineSnapshot, OrderSnapshot } from '../../services/factory-context';

function machine(overrides: Partial<MachineSnapshot> = {}): MachineSnapshot {
  return {
    id: 'm1',
    code: 'PR-01',
    name: 'Presse 01',
    manufacturer: null,
    model: null,
    tonnage: 500,
    workshopId: 'w1',
    workshopName: 'Atelier A',
    status: 'production',
    severity: 'normal',
    statusSince: new Date(),
    downtimeMinutes: 0,
    plannedMinutes: 0,
    producedUnits: 0,
    rejectedUnits: 0,
    oeePct: 0,
    hourlyCostCents: 6_000,
    currentOrderNumber: null,
    currentProductName: null,
    currentMoldReference: null,
    reason: null,
    activitySeries: [],
    nextMoldChange: null,
    ...overrides,
  };
}

function order(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: 'o1',
    number: '1000',
    customerName: 'Client Test',
    status: 'in_production',
    priority: 'normal',
    dueAt: new Date(),
    quantityUnits: 100,
    coveredUnits: 0,
    remainingUnits: 100,
    progressPct: 0,
    palletsReady: 0,
    palletsRequired: 1,
    riskPct: 0,
    severity: 'normal',
    riskReasons: [],
    isLate: false,
    productNames: [],
    workshopIds: ['w1'],
    ...overrides,
  };
}

function inventoryItem(overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    id: 'i1',
    sku: 'SKU-1',
    name: 'Matière test',
    kind: 'raw_material',
    unit: 'kg',
    quantityOnHand: 100,
    quantityReserved: 0,
    available: 100,
    safetyStock: 50,
    reorderPoint: 60,
    averageDailyConsumption: 10,
    coverageDays: 10,
    shortageInDays: null,
    severity: 'normal',
    ...overrides,
  };
}

describe('detectMachineIssues', () => {
  it('ignore une machine saine', () => {
    expect(detectMachineIssues([machine({ severity: 'normal' })])).toEqual([]);
  });

  it('détecte une machine critique et calcule l’impact réel (coût horaire × durée d’arrêt)', () => {
    const [issue] = detectMachineIssues([
      machine({ severity: 'critical', status: 'stopped', downtimeMinutes: 60, hourlyCostCents: 7_000 }),
    ]);
    expect(issue.signature).toBe('machine:m1');
    expect(issue.impactCents).toBe(7_000);
    expect(issue.impactOrigin).toBe('computed');
  });
});

describe('detectOrderRiskIssues', () => {
  it('ignore une commande sans risque', () => {
    expect(detectOrderRiskIssues([order({ severity: 'normal' })])).toEqual([]);
  });

  it('ignore une commande à risque mais déjà expédiée', () => {
    expect(detectOrderRiskIssues([order({ severity: 'critical', status: 'shipped' })])).toEqual([]);
  });

  it('détecte une commande à risque active', () => {
    const [issue] = detectOrderRiskIssues([order({ severity: 'warning', riskPct: 35 })]);
    expect(issue.signature).toBe('commande:o1');
    expect(issue.severity).toBe('warning');
  });
});

describe('detectInventoryIssues', () => {
  it('ignore un stock sain', () => {
    expect(detectInventoryIssues([inventoryItem({ severity: 'normal' })])).toEqual([]);
  });

  it('détecte une rupture projetée', () => {
    const [issue] = detectInventoryIssues([inventoryItem({ severity: 'critical', shortageInDays: 3 })]);
    expect(issue.signature).toBe('stock:i1');
    expect(issue.problem).toContain('3 jour');
  });
});

describe('detectStaffQualificationIssues', () => {
  it('sévérité critique pour une habilitation expirée, avertissement sinon', () => {
    const issues = detectStaffQualificationIssues([
      { id: 'q1', employeeId: 'e1', fullName: 'Paul Durand', label: 'CACES', daysRemaining: -5, status: 'expired' },
      { id: 'q2', employeeId: 'e2', fullName: 'Inès Garnier', label: 'SST', daysRemaining: 10, status: 'expiring' },
    ]);
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].signature).toBe('personnel:q1');
    expect(issues[1].severity).toBe('warning');
  });
});
