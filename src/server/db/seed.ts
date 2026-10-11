import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { Database } from './client';
import * as t from './schema';
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, ROLE_CODES } from '../domain/permissions';
import { computeUnitCost } from '../domain/costing';
import { addDays, addHours, addMinutes, atTime, nextWorkingDay } from './seed-helpers';

/**
 * Jeu de données de démonstration (§41).
 *
 * Ce n'est pas un ensemble de nombres aléatoires : c'est **une histoire d'usine
 * cohérente**. La Presse 64 est réellement à l'arrêt, cet arrêt bloque
 * réellement un ordre de fabrication, cet ordre appartient réellement à la
 * commande #5842, dont le risque de retard est réellement calculé à partir de
 * la capacité restante. Toutes les vues de l'application lisent les mêmes faits.
 */

export const DEMO_PASSWORD = 'Demo-9b8d8-2kx8w';

export async function seedIfEmpty(db: Database): Promise<void> {
  const existing = await db.select({ id: t.users.id }).from(t.users).limit(1);
  if (existing.length > 0) return;
  await seed(db);
}

export async function seed(db: Database): Promise<void> {
  const now = new Date();
  const today = atTime(now, 0, 0);

  // ─────────────────────────────────────────────────────────────── RBAC ────
  const permissionRows = await db
    .insert(t.permissions)
    .values(
      Object.entries(PERMISSIONS).map(([code, description]) => ({
        code,
        domain: code.split(':')[0],
        description,
      })),
    )
    .returning();
  const permissionByCode = new Map(permissionRows.map((row) => [row.code, row.id]));

  const roleRows = await db
    .insert(t.roles)
    .values(
      // Configuration initiale. Ces rôles sont marqués « système » : leurs
      // permissions restent modifiables depuis l'administration, mais ils ne
      // peuvent pas être supprimés ni voir leur code technique changer.
      ROLE_CODES.map((code, index) => ({
        code,
        name: ROLE_LABELS[code],
        description: ROLE_DESCRIPTIONS[code],
        isSystem: true,
        rank: index,
      })),
    )
    .returning();
  const roleByCode = new Map(roleRows.map((row) => [row.code, row.id]));

  await db.insert(t.rolePermissions).values(
    ROLE_CODES.flatMap((role) =>
      ROLE_PERMISSIONS[role].map((permission) => ({
        roleId: roleByCode.get(role)!,
        permissionId: permissionByCode.get(permission)!,
      })),
    ),
  );

  // ────────────────────────────────────────────────────────── Ateliers ────
  const [workshopA, workshopB, workshopC] = await db
    .insert(t.workshops)
    .values([
      {
        code: 'A',
        name: 'Atelier PU',
        description: 'Préparation et transformation des pièces PU avant finition.',
        dailyTargetUnits: 5500,
      },
      {
        code: 'B',
        name: 'Atelier Injection',
        description: 'Presses de moulage des pièces plastiques techniques de moyen et grand format.',
        dailyTargetUnits: 2080,
      },
      {
        code: 'C',
        name: 'Montage / expédition',
        description: 'Finition, assemblage, contrôle final, emballage et préparation des expéditions.',
        dailyTargetUnits: 2100,
      },
    ])
    .returning();

  // ───────────────────────────────────────────────────────── Fournisseurs ──
  const [supPolymers, supPallets, supTooling] = await db
    .insert(t.suppliers)
    .values([
      {
        code: 'FRN-POLY',
        name: 'Fournisseur matière A',
        category: 'Matières plastiques',
        contactEmail: 'commandes@fournisseur-a.demo.example',
        leadTimeDays: 6,
        reliabilityPct: 92,
      },
      {
        code: 'FRN-PAL',
        name: 'Fournisseur emballages B',
        category: 'Emballage et palettes',
        contactEmail: 'adv@fournisseur-b.demo.example',
        leadTimeDays: 2,
        reliabilityPct: 88,
      },
      {
        code: 'FRN-OUT',
        name: 'Fournisseur outillage C',
        category: 'Outillage et pièces détachées',
        contactEmail: 'service@fournisseur-c.demo.example',
        leadTimeDays: 12,
        reliabilityPct: 96,
      },
    ])
    .returning();

  // ────────────────────────────────────────────────────────────── Matières ──
  const [ppNoir, absNoir, pehdGris, ppFv30] = await db
    .insert(t.materials)
    .values([
      { code: 'PP-COPO-NOIR', name: 'PP copolymère noir', family: 'PP', color: 'Noir', costCentsPerKg: 180, supplierId: supPolymers.id },
      { code: 'ABS-NOIR', name: 'ABS noir', family: 'ABS', color: 'Noir', costCentsPerKg: 265, supplierId: supPolymers.id },
      { code: 'PEHD-GRIS', name: 'PEHD gris anthracite', family: 'PEHD', color: 'Gris', costCentsPerKg: 155, supplierId: supPolymers.id },
      { code: 'PP-FV30', name: 'PP chargé fibre de verre 30 %', family: 'PP', color: 'Noir', costCentsPerKg: 320, supplierId: supPolymers.id },
    ])
    .returning();

  // ───────────────────────────────────────────────────── Modèle de coût ────
  const [costModel] = await db
    .insert(t.costModels)
    .values([
      {
        code: 'STD-2026',
        name: 'Modèle standard 2026',
        energyCentsPerHour: 1_450,
        laborCentsPerHour: 2_800,
        overheadCentsPerHour: 1_600,
        consumablesCentsPerHour: 320,
        isDefault: true,
      },
    ])
    .returning();

  // ───────────────────────────────────────────────────────────── Moules ────
  const moldRows = await db
    .insert(t.molds)
    .values([
      { reference: 'MOU-045', name: 'Garde-boue 2 essieux', cavities: 1, changeoverMinutes: 240, location: 'Rack B-12', status: 'mounted', cyclesSinceMaintenance: 148_000 },
      { reference: 'MOU-046', name: 'Garde-boue 3 essieux', cavities: 1, changeoverMinutes: 240, location: 'Rack B-14', status: 'available', cyclesSinceMaintenance: 92_000 },
      { reference: 'MOU-112', name: 'Bavette anti-projection 450', cavities: 2, changeoverMinutes: 180, location: 'Rack A-03', status: 'mounted', cyclesSinceMaintenance: 61_000 },
      { reference: 'MOU-118', name: 'Support batterie', cavities: 4, changeoverMinutes: 120, location: 'Rack A-07', status: 'mounted', cyclesSinceMaintenance: 187_000 },
      { reference: 'MOU-203', name: 'Passage de roue 780', cavities: 1, changeoverMinutes: 210, location: 'Rack C-02', status: 'available', cyclesSinceMaintenance: 34_000 },
      { reference: 'MOU-247', name: 'Coiffe de réservoir', cavities: 2, changeoverMinutes: 150, location: 'Rack C-05', status: 'mounted', cyclesSinceMaintenance: 120_000 },
    ])
    .returning();
  const mold = Object.fromEntries(moldRows.map((row) => [row.reference, row])) as Record<string, (typeof moldRows)[number]>;

  // ──────────────────────────────────────────────────────────── Machines ───
  // La Presse 64 est à l'arrêt depuis 1 h 12 : c'est le point de départ de
  // toute l'histoire racontée par la Control Tower.
  const stoppedSince = addMinutes(now, -72);

  const machineRows = await db
    .insert(t.machines)
    .values([
      { code: 'PR-04', name: 'Presse 04', workshopId: workshopA.id, tonnage: 800, manufacturer: 'Constructeur presses A', model: 'A-SP 800', status: 'production', statusSince: addHours(now, -4), currentMoldId: mold['MOU-112'].id, hourlyCostCents: 6_500, dailyCapacityHours: 21, serialNumber: 'CA04-800SP-2018-1142', manufacturingYear: 2018, totalHours: 41_260, productionHours: 33_180, controlSoftware: 'Commande A', controlSoftwareVersion: 'V3.18.7' },
      { code: 'PR-12', name: 'Presse 12', workshopId: workshopA.id, tonnage: 1000, manufacturer: 'Constructeur presses C', model: 'C-1000', status: 'production', statusSince: addHours(now, -6), currentMoldId: mold['MOU-118'].id, hourlyCostCents: 7_200, dailyCapacityHours: 21, serialNumber: 'CC12-1000-2020-0477', manufacturingYear: 2020, totalHours: 28_940, productionHours: 23_610, controlSoftware: 'Commande C', controlSoftwareVersion: 'V6.4.2' },
      // Presses de l'atelier PU (bâtiment rose) — numérotées par ligne de production,
      // du haut vers le bas de la photo : 41-42-53-44 / 11-31-52-34 / 21-22-51-43 / 12-54-55.
      { code: 'PR-11', name: 'Presse 11/31', workshopId: workshopA.id, tonnage: 400, manufacturer: 'Constructeur presses A', model: 'A-SP 400', status: 'production', statusSince: addHours(now, -2), currentMoldId: null, hourlyCostCents: 5_400, dailyCapacityHours: 21, serialNumber: 'CA11-400SP-2019-0876', manufacturingYear: 2019, totalHours: 38_200, productionHours: 30_150, controlSoftware: 'Commande A', controlSoftwareVersion: 'V3.18.7' },
      { code: 'PR-21', name: 'Presse 21', workshopId: workshopA.id, tonnage: 350, manufacturer: 'Constructeur presses B', model: 'B-350', status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CB21-350-2020-0433', manufacturingYear: 2020, totalHours: 24_680, productionHours: 19_020, controlSoftware: 'Commande B', controlSoftwareVersion: 'V2.7.4' },
      { code: 'PR-22', name: 'Presse 22', workshopId: workshopA.id, tonnage: 350, manufacturer: 'Constructeur presses B', model: 'B-350', status: 'production', statusSince: addHours(now, -5), currentMoldId: null, hourlyCostCents: 5_100, dailyCapacityHours: 21, serialNumber: 'CB22-350-2020-0434', manufacturingYear: 2020, totalHours: 23_910, productionHours: 18_640, controlSoftware: 'Commande B', controlSoftwareVersion: 'V2.7.4' },
      { code: 'PR-34', name: 'Presse 34', workshopId: workshopA.id, tonnage: 300, manufacturer: 'Constructeur presses A', model: 'A-SP 300', status: 'production', statusSince: addHours(now, -3), currentMoldId: null, hourlyCostCents: 5_000, dailyCapacityHours: 21, serialNumber: 'CA34-300SP-2018-0765', manufacturingYear: 2018, totalHours: 40_120, productionHours: 32_480, controlSoftware: 'Commande A', controlSoftwareVersion: 'V3.18.7' },
      { code: 'PR-41', name: 'Presse 41', workshopId: workshopA.id, tonnage: 250, manufacturer: 'Constructeur presses A', model: 'A-SY 250', status: 'production', statusSince: addHours(now, -6), currentMoldId: null, hourlyCostCents: 4_600, dailyCapacityHours: 21, serialNumber: 'CA41-250SY-2021-0345', manufacturingYear: 2021, totalHours: 17_980, productionHours: 14_120, controlSoftware: 'Commande A', controlSoftwareVersion: 'V4.02.1' },
      { code: 'PR-42', name: 'Presse 42', workshopId: workshopA.id, tonnage: 250, manufacturer: 'Constructeur presses B', model: 'B-250', status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CB42-250-2021-0512', manufacturingYear: 2021, totalHours: 15_460, productionHours: 11_890, controlSoftware: 'Commande B', controlSoftwareVersion: 'V2.7.4' },
      { code: 'PR-43', name: 'Presse 43', workshopId: workshopA.id, tonnage: 300, manufacturer: 'Constructeur presses C', model: 'C-300', status: 'setup', statusSince: addMinutes(now, -20), currentMoldId: null, hourlyCostCents: 5_000, dailyCapacityHours: 14, serialNumber: 'CC43-300-2017-0199', manufacturingYear: 2017, totalHours: 59_870, productionHours: 45_210, controlSoftware: 'Commande C', controlSoftwareVersion: 'V5.1.9' },
      { code: 'PR-44', name: 'Presse 44', workshopId: workshopA.id, tonnage: 250, manufacturer: 'Constructeur presses A', model: 'A-SY 250', status: 'production', statusSince: addHours(now, -4), currentMoldId: null, hourlyCostCents: 4_600, dailyCapacityHours: 21, serialNumber: 'CA44-250SY-2021-0346', manufacturingYear: 2021, totalHours: 16_720, productionHours: 13_050, controlSoftware: 'Commande A', controlSoftwareVersion: 'V4.02.1' },
      { code: 'PR-51', name: 'Presse 51', workshopId: workshopA.id, tonnage: 200, manufacturer: 'Constructeur presses B', model: 'B-200', status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CB51-200-2022-0287', manufacturingYear: 2022, totalHours: 9_340, productionHours: 6_980, controlSoftware: 'Commande B', controlSoftwareVersion: 'V2.7.4' },
      { code: 'PR-52', name: 'Presse 52', workshopId: workshopA.id, tonnage: 200, manufacturer: 'Constructeur presses A', model: 'A-SP 200', status: 'production', statusSince: addHours(now, -7), currentMoldId: null, hourlyCostCents: 4_200, dailyCapacityHours: 21, serialNumber: 'CA52-200SP-2019-0877', manufacturingYear: 2019, totalHours: 36_540, productionHours: 28_960, controlSoftware: 'Commande A', controlSoftwareVersion: 'V3.18.7' },
      { code: 'PR-53', name: 'Presse 53', workshopId: workshopA.id, tonnage: 250, manufacturer: 'Constructeur presses C', model: 'C-250', status: 'production', statusSince: addHours(now, -2), currentMoldId: null, hourlyCostCents: 4_400, dailyCapacityHours: 21, serialNumber: 'CC53-250-2018-0234', manufacturingYear: 2018, totalHours: 47_280, productionHours: 36_910, controlSoftware: 'Commande C', controlSoftwareVersion: 'V5.1.9' },
      { code: 'PR-54', name: 'Presse 54', workshopId: workshopA.id, tonnage: 180, manufacturer: 'Constructeur presses B', model: 'B-180', status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CB54-180-2022-0288', manufacturingYear: 2022, totalHours: 8_120, productionHours: 6_010, controlSoftware: 'Commande B', controlSoftwareVersion: 'V2.7.4' },
      { code: 'PR-55', name: 'Presse 55', workshopId: workshopA.id, tonnage: 180, manufacturer: 'Constructeur presses A', model: 'A-SY 180', status: 'production', statusSince: addHours(now, -5), currentMoldId: null, hourlyCostCents: 4_000, dailyCapacityHours: 21, serialNumber: 'CA55-180SY-2021-0347', manufacturingYear: 2021, totalHours: 14_890, productionHours: 11_430, controlSoftware: 'Commande A', controlSoftwareVersion: 'V4.02.1' },
      { code: 'PR-59', name: 'Presse 59', workshopId: workshopB.id, tonnage: 1000, manufacturer: 'Constructeur presses A', model: 'A-SY 1000 servo', status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CA59-1000SY-2019-1587', manufacturingYear: 2019, totalHours: 34_120, productionHours: 27_450, controlSoftware: 'Commande A', controlSoftwareVersion: 'V3.18.7' },
      { code: 'PR-60', name: 'Presse 60', workshopId: workshopB.id, tonnage: 1500, manufacturer: 'Constructeur presses A', model: 'A-MU 1500', status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CA60-1500MU-2021-0912', manufacturingYear: 2021, totalHours: 19_880, productionHours: 15_240, controlSoftware: 'Commande A', controlSoftwareVersion: 'V4.02.1' },
      { code: 'PR-61', name: 'Presse 61', workshopId: workshopB.id, tonnage: 0, manufacturer: 'Constructeur presses C', model: null, status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CC61-0000-2015-0233', manufacturingYear: 2015, totalHours: 58_410, productionHours: 44_970, controlSoftware: 'Commande C', controlSoftwareVersion: 'V5.1.9' },
      { code: 'PR-62', name: 'Presse 62', workshopId: workshopB.id, tonnage: 0, manufacturer: 'Constructeur presses C', model: null, status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CC62-0000-2015-0234', manufacturingYear: 2015, totalHours: 57_020, productionHours: 43_880, controlSoftware: 'Commande C', controlSoftwareVersion: 'V5.1.9' },
      { code: 'PR-63', name: 'Presse 63', workshopId: workshopB.id, tonnage: 0, manufacturer: 'Constructeur presses C', model: null, status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CC63-0000-2016-0301', manufacturingYear: 2016, totalHours: 52_360, productionHours: 40_115, controlSoftware: 'Commande C', controlSoftwareVersion: 'V5.1.9' },
      { code: 'PR-64', name: 'Presse 64', workshopId: workshopB.id, tonnage: 0, manufacturer: 'Constructeur presses C', model: null, status: 'stopped', statusSince: stoppedSince, currentMoldId: mold['MOU-045'].id, hourlyCostCents: 7_400, dailyCapacityHours: 21, serialNumber: 'CC64-0000-2016-0302', manufacturingYear: 2016, totalHours: 51_740, productionHours: 39_620, controlSoftware: 'Commande C', controlSoftwareVersion: 'V5.1.9' },
      { code: 'PR-65', name: 'Presse 65', workshopId: workshopB.id, tonnage: 650, manufacturer: 'Constructeur presses B', model: 'B-650S', status: 'setup', statusSince: addMinutes(now, -35), currentMoldId: null, hourlyCostCents: 6_800, dailyCapacityHours: 14, serialNumber: 'CB65-650-2022-0188', manufacturingYear: 2022, totalHours: 12_450, productionHours: 9_310, controlSoftware: 'Commande B', controlSoftwareVersion: 'V2.7.4' },
      { code: 'PR-66', name: 'Presse 66', workshopId: workshopB.id, tonnage: 850, manufacturer: 'Constructeur presses B', model: 'B-850SW', status: 'idle', statusSince: now, currentMoldId: null, hourlyCostCents: 0, dailyCapacityHours: 21, serialNumber: 'CB66-850-2022-0219', manufacturingYear: 2022, totalHours: 11_180, productionHours: 8_460, controlSoftware: 'Commande B', controlSoftwareVersion: 'V2.7.4' },
      { code: 'PR-67', name: 'Presse 67', workshopId: workshopB.id, tonnage: 1500, manufacturer: 'Constructeur presses A', model: 'A-SY multi 1500', status: 'production', statusSince: addHours(now, -3), currentMoldId: mold['MOU-247'].id, hourlyCostCents: 5_200, dailyCapacityHours: 21, serialNumber: 'CA67-1500MU-2019-1588', manufacturingYear: 2019, totalHours: 36_905, productionHours: 29_740, controlSoftware: 'Commande A', controlSoftwareVersion: 'V3.18.7' },
    ])
    .returning();
  const machine = Object.fromEntries(machineRows.map((row) => [row.code, row])) as Record<string, (typeof machineRows)[number]>;

  await db.insert(t.moldMachines).values([
    { moldId: mold['MOU-112'].id, machineId: machine['PR-59'].id },
    { moldId: mold['MOU-118'].id, machineId: machine['PR-59'].id },
    { moldId: mold['MOU-203'].id, machineId: machine['PR-60'].id },
    { moldId: mold['MOU-247'].id, machineId: machine['PR-60'].id },
    { moldId: mold['MOU-045'].id, machineId: machine['PR-61'].id },
    { moldId: mold['MOU-046'].id, machineId: machine['PR-61'].id },
    { moldId: mold['MOU-045'].id, machineId: machine['PR-64'].id },
    { moldId: mold['MOU-045'].id, machineId: machine['PR-65'].id },
    { moldId: mold['MOU-046'].id, machineId: machine['PR-64'].id },
    { moldId: mold['MOU-046'].id, machineId: machine['PR-12'].id },
    { moldId: mold['MOU-112'].id, machineId: machine['PR-04'].id },
    { moldId: mold['MOU-112'].id, machineId: machine['PR-65'].id },
    { moldId: mold['MOU-118'].id, machineId: machine['PR-12'].id },
    { moldId: mold['MOU-118'].id, machineId: machine['PR-04'].id },
    { moldId: mold['MOU-203'].id, machineId: machine['PR-67'].id },
    { moldId: mold['MOU-203'].id, machineId: machine['PR-65'].id },
    { moldId: mold['MOU-247'].id, machineId: machine['PR-67'].id },
  ]);

  // ───────────────────────────────────────────────────────────── Clients ───
  const customerRows = await db
    .insert(t.customers)
    .values([
      { code: 'PL1', name: 'Constructeur poids lourds 1', country: 'France', contactEmail: 'achats@client-pl1.demo.example', leadTimeDays: 15 },
      { code: 'PL2', name: 'Constructeur poids lourds 2', country: 'Suède', contactEmail: 'achats@client-pl2.demo.example', leadTimeDays: 20 },
      { code: 'PL3', name: 'Constructeur poids lourds 3', country: 'France', contactEmail: 'achats@client-pl3.demo.example', leadTimeDays: 18 },
      { code: 'PL4', name: 'Constructeur poids lourds 4', country: 'Italie', contactEmail: 'achats@client-pl4.demo.example', leadTimeDays: 21 },
      { code: 'PL5', name: 'Constructeur poids lourds 5', country: 'Pays-Bas', contactEmail: 'achats@client-pl5.demo.example', leadTimeDays: 25 },
    ])
    .returning();
  const customer = Object.fromEntries(customerRows.map((row) => [row.code, row])) as Record<string, (typeof customerRows)[number]>;

  // ──────────────────────────────────────────────────────────── Produits ───
  // Le coût de revient n'est pas saisi à la main : il est calculé par le
  // domaine à partir du modèle de coût, de la matière et du temps de cycle.
  type ProductSeed = {
    reference: string;
    name: string;
    family: string;
    customerId: string;
    materialId: string;
    materialCostCentsPerKg: number;
    moldRef: string;
    weightGrams: number;
    cycleTimeSeconds: number;
    unitsPerPallet: number;
    dimensionsMm: string;
    description: string;
    /** Machine de référence pour le calcul du coût. */
    referenceMachine: string;
    marginTarget: number;
    scrapRate: number;
  };

  const productSeeds: ProductSeed[] = [
    { reference: 'GB-2E-001', name: 'Garde-boue 2 essieux', family: 'Garde-boue', customerId: customer.PL1.id, materialId: ppNoir.id, materialCostCentsPerKg: ppNoir.costCentsPerKg, moldRef: 'MOU-045', weightGrams: 2_450, cycleTimeSeconds: 120, unitsPerPallet: 250, dimensionsMm: '650 × 500 × 300', description: 'Garde-boue arrière pour porteur 2 essieux, PP copolymère noir.', referenceMachine: 'PR-64', marginTarget: 0.42, scrapRate: 0.012 },
    { reference: 'GB-3E-001', name: 'Garde-boue 3 essieux', family: 'Garde-boue', customerId: customer.PL2.id, materialId: ppNoir.id, materialCostCentsPerKg: ppNoir.costCentsPerKg, moldRef: 'MOU-046', weightGrams: 3_200, cycleTimeSeconds: 145, unitsPerPallet: 200, dimensionsMm: '820 × 500 × 320', description: 'Garde-boue arrière 3 essieux, version renforcée.', referenceMachine: 'PR-64', marginTarget: 0.4, scrapRate: 0.018 },
    { reference: 'BAV-450', name: 'Bavette anti-projection 450', family: 'Bavette', customerId: customer.PL4.id, materialId: pehdGris.id, materialCostCentsPerKg: pehdGris.costCentsPerKg, moldRef: 'MOU-112', weightGrams: 900, cycleTimeSeconds: 65, unitsPerPallet: 600, dimensionsMm: '450 × 350 × 12', description: 'Bavette souple anti-projection, PEHD gris anthracite.', referenceMachine: 'PR-04', marginTarget: 0.48, scrapRate: 0.008 },
    { reference: 'SUP-BAT-12', name: 'Support batterie', family: 'Support', customerId: customer.PL5.id, materialId: ppFv30.id, materialCostCentsPerKg: ppFv30.costCentsPerKg, moldRef: 'MOU-118', weightGrams: 1_450, cycleTimeSeconds: 95, unitsPerPallet: 400, dimensionsMm: '600 × 300 × 98', description: 'Support de batterie technique, PP chargé fibre de verre 30 %.', referenceMachine: 'PR-12', marginTarget: 0.35, scrapRate: 0.021 },
    { reference: 'PDR-780', name: 'Passage de roue 780', family: 'Passage de roue', customerId: customer.PL3.id, materialId: ppNoir.id, materialCostCentsPerKg: ppNoir.costCentsPerKg, moldRef: 'MOU-203', weightGrams: 2_900, cycleTimeSeconds: 135, unitsPerPallet: 180, dimensionsMm: '780 × 460 × 280', description: 'Passage de roue avant, montage sur châssis 780 mm.', referenceMachine: 'PR-67', marginTarget: 0.38, scrapRate: 0.015 },
    { reference: 'COIF-220', name: 'Coiffe de réservoir', family: 'Accessoire', customerId: customer.PL1.id, materialId: absNoir.id, materialCostCentsPerKg: absNoir.costCentsPerKg, moldRef: 'MOU-247', weightGrams: 640, cycleTimeSeconds: 55, unitsPerPallet: 900, dimensionsMm: '220 × 220 × 90', description: 'Coiffe de protection de réservoir AdBlue.', referenceMachine: 'PR-67', marginTarget: 0.45, scrapRate: 0.009 },
  ];

  const productRows = await db
    .insert(t.products)
    .values(
      productSeeds.map((seedRow) => {
        const cost = computeUnitCost({
          weightGrams: seedRow.weightGrams,
          materialCostCentsPerKg: seedRow.materialCostCentsPerKg,
          cycleTimeSeconds: seedRow.cycleTimeSeconds,
          cavities: mold[seedRow.moldRef].cavities,
          machineHourlyCostCents: machine[seedRow.referenceMachine].hourlyCostCents,
          laborHourlyCostCents: costModel.laborCentsPerHour,
          overheadHourlyCostCents: costModel.overheadCentsPerHour,
          consumablesHourlyCostCents: costModel.consumablesCentsPerHour,
          scrapRate: seedRow.scrapRate,
        });

        return {
          reference: seedRow.reference,
          name: seedRow.name,
          family: seedRow.family,
          customerId: seedRow.customerId,
          materialId: seedRow.materialId,
          moldId: mold[seedRow.moldRef].id,
          description: seedRow.description,
          weightGrams: seedRow.weightGrams,
          dimensionsMm: seedRow.dimensionsMm,
          cycleTimeSeconds: seedRow.cycleTimeSeconds,
          unitsPerPallet: seedRow.unitsPerPallet,
          unitCostCents: cost.totalCents,
          unitPriceCents: Math.round(cost.totalCents / (1 - seedRow.marginTarget)),
        };
      }),
    )
    .returning();
  const product = Object.fromEntries(productRows.map((row) => [row.reference, row])) as Record<string, (typeof productRows)[number]>;

  // Compatibilités pièce ↔ machine, avec la cadence réelle de chaque couple.
  await db.insert(t.productMachines).values([
    { productId: product['GB-2E-001'].id, machineId: machine['PR-64'].id, unitsPerHour: 30, isPreferred: true },
    { productId: product['GB-2E-001'].id, machineId: machine['PR-65'].id, unitsPerHour: 26, isPreferred: false },
    { productId: product['GB-3E-001'].id, machineId: machine['PR-64'].id, unitsPerHour: 24.8, isPreferred: true },
    { productId: product['GB-3E-001'].id, machineId: machine['PR-12'].id, unitsPerHour: 23, isPreferred: false },
    { productId: product['BAV-450'].id, machineId: machine['PR-04'].id, unitsPerHour: 110, isPreferred: true },
    { productId: product['BAV-450'].id, machineId: machine['PR-65'].id, unitsPerHour: 96, isPreferred: false },
    { productId: product['SUP-BAT-12'].id, machineId: machine['PR-12'].id, unitsPerHour: 151, isPreferred: true },
    { productId: product['SUP-BAT-12'].id, machineId: machine['PR-04'].id, unitsPerHour: 138, isPreferred: false },
    { productId: product['PDR-780'].id, machineId: machine['PR-67'].id, unitsPerHour: 26.6, isPreferred: true },
    { productId: product['PDR-780'].id, machineId: machine['PR-65'].id, unitsPerHour: 24, isPreferred: false },
    { productId: product['COIF-220'].id, machineId: machine['PR-67'].id, unitsPerHour: 130, isPreferred: true },
    { productId: product['BAV-450'].id, machineId: machine['PR-59'].id, unitsPerHour: 112, isPreferred: false },
    { productId: product['SUP-BAT-12'].id, machineId: machine['PR-59'].id, unitsPerHour: 138, isPreferred: false },
    { productId: product['PDR-780'].id, machineId: machine['PR-60'].id, unitsPerHour: 26.6, isPreferred: false },
    { productId: product['COIF-220'].id, machineId: machine['PR-60'].id, unitsPerHour: 130, isPreferred: false },
    { productId: product['GB-2E-001'].id, machineId: machine['PR-61'].id, unitsPerHour: 30, isPreferred: false },
    { productId: product['GB-3E-001'].id, machineId: machine['PR-61'].id, unitsPerHour: 24.8, isPreferred: false },
  ]);

  // ────────────────────────────────────────────────────────── Employés ─────
  type EmployeeSeed = {
    matricule: string;
    firstName: string;
    lastName: string;
    workshopId: string;
    jobTitle: string;
    shift: 'morning' | 'afternoon' | 'night';
    hourlyCostCents: number;
  };

  const employeeSeeds: EmployeeSeed[] = [
    { matricule: 'E-001', firstName: 'Paul', lastName: 'Durand', workshopId: workshopA.id, jobTitle: 'Régleur presse', shift: 'afternoon', hourlyCostCents: 3_100 },
    { matricule: 'E-002', firstName: 'Luc', lastName: 'Bernard', workshopId: workshopA.id, jobTitle: 'Régleur presse', shift: 'morning', hourlyCostCents: 3_050 },
    { matricule: 'E-003', firstName: 'Julie', lastName: 'Petit', workshopId: workshopA.id, jobTitle: 'Opératrice', shift: 'morning', hourlyCostCents: 2_500 },
    { matricule: 'E-004', firstName: 'Henri', lastName: 'Robert', workshopId: workshopA.id, jobTitle: 'Cariste', shift: 'morning', hourlyCostCents: 2_650 },
    { matricule: 'E-005', firstName: 'Samir', lastName: 'Richard', workshopId: workshopB.id, jobTitle: 'Régleur presse', shift: 'morning', hourlyCostCents: 3_150 },
    { matricule: 'E-006', firstName: 'Inès', lastName: 'Garnier', workshopId: workshopB.id, jobTitle: "Chef d'atelier", shift: 'morning', hourlyCostCents: 3_900 },
    { matricule: 'E-007', firstName: 'Kevin', lastName: 'Lambert', workshopId: workshopB.id, jobTitle: 'Opérateur', shift: 'afternoon', hourlyCostCents: 2_480 },
    { matricule: 'E-008', firstName: 'Camille', lastName: 'Faure', workshopId: workshopB.id, jobTitle: 'Contrôleuse qualité', shift: 'morning', hourlyCostCents: 2_900 },
    { matricule: 'E-009', firstName: 'Romain', lastName: 'Blanc', workshopId: workshopB.id, jobTitle: 'Opérateur', shift: 'night', hourlyCostCents: 2_620 },
    { matricule: 'E-010', firstName: 'Lucie', lastName: 'Mercier', workshopId: workshopC.id, jobTitle: 'Opératrice', shift: 'morning', hourlyCostCents: 2_480 },
    { matricule: 'E-011', firstName: 'Yves', lastName: 'Dumas', workshopId: workshopC.id, jobTitle: 'Régleur presse', shift: 'afternoon', hourlyCostCents: 3_020 },
    { matricule: 'E-012', firstName: 'Léa', lastName: 'Fournier', workshopId: workshopC.id, jobTitle: 'Opératrice', shift: 'morning', hourlyCostCents: 2_460 },
    { matricule: 'E-013', firstName: 'Hervé', lastName: 'Morel', workshopId: workshopB.id, jobTitle: 'Technicien maintenance', shift: 'morning', hourlyCostCents: 3_600 },
    { matricule: 'E-014', firstName: 'Gilles', lastName: 'Simon', workshopId: workshopA.id, jobTitle: 'Magasinier', shift: 'morning', hourlyCostCents: 2_700 },
  ];

  const employeeRows = await db.insert(t.employees).values(employeeSeeds).returning();
  const employee = Object.fromEntries(employeeRows.map((row) => [row.matricule, row])) as Record<string, (typeof employeeRows)[number]>;

  const skillRows = await db
    .insert(t.skills)
    .values([
      { code: 'presse_1000t', name: 'Conduite presse 1000T', category: 'Production' },
      { code: 'presse_800t', name: 'Conduite presse 800T', category: 'Production' },
      { code: 'reglage', name: 'Réglage et démarrage série', category: 'Production' },
      { code: 'changement_moule', name: 'Changement de moule', category: 'Production' },
      { code: 'controle_visuel', name: 'Contrôle visuel', category: 'Qualité' },
      { code: 'metrologie', name: 'Métrologie dimensionnelle', category: 'Qualité' },
      { code: 'cariste', name: 'Conduite chariot élévateur', category: 'Logistique' },
      { code: 'maintenance_niv2', name: 'Maintenance niveau 2', category: 'Maintenance' },
    ])
    .returning();
  const skill = Object.fromEntries(skillRows.map((row) => [row.code, row])) as Record<string, (typeof skillRows)[number]>;

  await db.insert(t.employeeSkills).values([
    { employeeId: employee['E-001'].id, skillId: skill.presse_1000t.id, level: 4 },
    { employeeId: employee['E-001'].id, skillId: skill.presse_800t.id, level: 4 },
    { employeeId: employee['E-001'].id, skillId: skill.reglage.id, level: 4 },
    { employeeId: employee['E-001'].id, skillId: skill.changement_moule.id, level: 3 },
    { employeeId: employee['E-002'].id, skillId: skill.presse_1000t.id, level: 3 },
    { employeeId: employee['E-002'].id, skillId: skill.reglage.id, level: 3 },
    { employeeId: employee['E-003'].id, skillId: skill.controle_visuel.id, level: 3 },
    { employeeId: employee['E-004'].id, skillId: skill.cariste.id, level: 4 },
    { employeeId: employee['E-005'].id, skillId: skill.presse_1000t.id, level: 4 },
    { employeeId: employee['E-005'].id, skillId: skill.reglage.id, level: 3 },
    { employeeId: employee['E-005'].id, skillId: skill.changement_moule.id, level: 4 },
    { employeeId: employee['E-006'].id, skillId: skill.presse_1000t.id, level: 3 },
    { employeeId: employee['E-007'].id, skillId: skill.controle_visuel.id, level: 2 },
    { employeeId: employee['E-008'].id, skillId: skill.metrologie.id, level: 4 },
    { employeeId: employee['E-008'].id, skillId: skill.controle_visuel.id, level: 4 },
    { employeeId: employee['E-009'].id, skillId: skill.presse_800t.id, level: 2 },
    { employeeId: employee['E-010'].id, skillId: skill.controle_visuel.id, level: 3 },
    { employeeId: employee['E-011'].id, skillId: skill.presse_800t.id, level: 3 },
    { employeeId: employee['E-011'].id, skillId: skill.reglage.id, level: 3 },
    { employeeId: employee['E-013'].id, skillId: skill.maintenance_niv2.id, level: 4 },
    { employeeId: employee['E-014'].id, skillId: skill.cariste.id, level: 3 },
  ]);

  await db.insert(t.qualifications).values([
    // Habilitation bientôt expirée — alimente l'alerte RH de la Control Tower.
    { employeeId: employee['E-005'].id, kind: 'sst', label: 'Sauveteur secouriste du travail', obtainedAt: addDays(today, -685), expiresAt: addDays(today, 45), alertLeadDays: 90 },
    { employeeId: employee['E-001'].id, kind: 'sst', label: 'Sauveteur secouriste du travail', obtainedAt: addDays(today, -300), expiresAt: addDays(today, 430), alertLeadDays: 90 },
    { employeeId: employee['E-004'].id, kind: 'caces', label: 'CACES R489 catégorie 3', obtainedAt: addDays(today, -1_400), expiresAt: addDays(today, 78), alertLeadDays: 90 },
    { employeeId: employee['E-014'].id, kind: 'caces', label: 'CACES R489 catégorie 3', obtainedAt: addDays(today, -900), expiresAt: addDays(today, 920), alertLeadDays: 90 },
    { employeeId: employee['E-013'].id, kind: 'electrical', label: 'Habilitation électrique BR', obtainedAt: addDays(today, -420), expiresAt: addDays(today, 680), alertLeadDays: 90 },
    { employeeId: employee['E-006'].id, kind: 'safety', label: 'Formation sécurité machines', obtainedAt: addDays(today, -200), expiresAt: addDays(today, 530), alertLeadDays: 90 },
  ]);

  await db.insert(t.absences).values([
    // Luc Bernard est absent aujourd'hui : l'atelier A perd un régleur.
    { employeeId: employee['E-002'].id, type: 'sick_leave', startsAt: addDays(today, -1), endsAt: addDays(today, 3), reason: 'Arrêt maladie' },
    { employeeId: employee['E-012'].id, type: 'holiday', startsAt: addDays(today, 5), endsAt: addDays(today, 15), reason: 'Congés payés' },
    { employeeId: employee['E-009'].id, type: 'training', startsAt: addDays(today, 2), endsAt: addDays(today, 3), reason: 'Formation changement de moule' },
  ]);

  await db.insert(t.trainings).values([
    { employeeId: employee['E-009'].id, title: 'Changement de moule — niveau 1', provider: 'Fournisseur outillage C — formation', startsAt: addDays(today, 2), endsAt: addDays(today, 3), isMandatory: false },
    { employeeId: employee['E-007'].id, title: 'Recyclage SST', provider: 'AFPI', startsAt: addDays(today, 20), endsAt: addDays(today, 20), isMandatory: true },
  ]);

  // ───────────────────────────────────────────────────────── Utilisateurs ──
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.insert(t.users).values([
    { email: 'direction@demo.example', passwordHash, fullName: 'Anne Laurent', roleId: roleByCode.get('direction')!, workshopId: null },
    { email: 'production@demo.example', passwordHash, fullName: 'Jérôme Leroy', roleId: roleByCode.get('responsable_production')!, workshopId: null },
    { email: 'atelier@demo.example', passwordHash, fullName: 'Inès Garnier', roleId: roleByCode.get('chef_atelier')!, workshopId: workshopB.id, employeeId: employee['E-006'].id },
    { email: 'maintenance@demo.example', passwordHash, fullName: 'Hervé Morel', roleId: roleByCode.get('responsable_maintenance')!, workshopId: null, employeeId: employee['E-013'].id },
    { email: 'rh@demo.example', passwordHash, fullName: 'Nathalie Colin', roleId: roleByCode.get('responsable_rh')!, workshopId: null },
    { email: 'stock@demo.example', passwordHash, fullName: 'Gilles Simon', roleId: roleByCode.get('responsable_stock')!, workshopId: null, employeeId: employee['E-014'].id },
    { email: 'operateur@demo.example', passwordHash, fullName: 'Paul Durand', roleId: roleByCode.get('operateur')!, workshopId: workshopA.id, employeeId: employee['E-001'].id },
  ]);

  // ───────────────────────────────────────────────────────────── Stocks ────
  const inventoryRows = await db
    .insert(t.inventoryItems)
    .values([
      // Produits finis — le stock de GB-2E-001 couvre 2 000 pièces de la commande #5842.
      { sku: 'PF-GB-2E-001', name: 'Garde-boue 2 essieux', kind: 'finished_good', unit: 'pièce', productId: product['GB-2E-001'].id, location: 'Zone PF-A', quantityOnHand: 2_000, quantityReserved: 0, safetyStock: 0, reorderPoint: 500, averageDailyConsumption: 320, unitCostCents: product['GB-2E-001'].unitCostCents },
      { sku: 'PF-GB-3E-001', name: 'Garde-boue 3 essieux', kind: 'finished_good', unit: 'pièce', productId: product['GB-3E-001'].id, location: 'Zone PF-A', quantityOnHand: 640, quantityReserved: 0, safetyStock: 0, reorderPoint: 400, averageDailyConsumption: 180, unitCostCents: product['GB-3E-001'].unitCostCents },
      { sku: 'PF-BAV-450', name: 'Bavette anti-projection 450', kind: 'finished_good', unit: 'pièce', productId: product['BAV-450'].id, location: 'Zone PF-B', quantityOnHand: 3_400, quantityReserved: 0, safetyStock: 0, reorderPoint: 1_200, averageDailyConsumption: 700, unitCostCents: product['BAV-450'].unitCostCents },
      { sku: 'PF-SUP-BAT-12', name: 'Support batterie', kind: 'finished_good', unit: 'pièce', productId: product['SUP-BAT-12'].id, location: 'Zone PF-B', quantityOnHand: 5_200, quantityReserved: 0, safetyStock: 0, reorderPoint: 2_000, averageDailyConsumption: 900, unitCostCents: product['SUP-BAT-12'].unitCostCents },
      { sku: 'PF-PDR-780', name: 'Passage de roue 780', kind: 'finished_good', unit: 'pièce', productId: product['PDR-780'].id, location: 'Zone PF-C', quantityOnHand: 500, quantityReserved: 0, safetyStock: 0, reorderPoint: 300, averageDailyConsumption: 140, unitCostCents: product['PDR-780'].unitCostCents },
      { sku: 'PF-COIF-220', name: 'Coiffe de réservoir', kind: 'finished_good', unit: 'pièce', productId: product['COIF-220'].id, location: 'Zone PF-C', quantityOnHand: 9_100, quantityReserved: 0, safetyStock: 0, reorderPoint: 2_500, averageDailyConsumption: 1_100, unitCostCents: product['COIF-220'].unitCostCents },

      // Palettes : 300 aujourd'hui, 150 consommées par jour → rupture sous 48 h.
      { sku: 'PAL-EUR-1208', name: 'Palette Europe 1200 × 800', kind: 'pallet', unit: 'palette', supplierId: supPallets.id, location: 'Quai réception', quantityOnHand: 300, quantityReserved: 0, safetyStock: 50, reorderPoint: 400, averageDailyConsumption: 150, unitCostCents: 1_450 },
      { sku: 'PAL-PERD-1210', name: 'Palette perdue 1200 × 1000', kind: 'pallet', unit: 'palette', supplierId: supPallets.id, location: 'Quai réception', quantityOnHand: 820, quantityReserved: 0, safetyStock: 60, reorderPoint: 300, averageDailyConsumption: 70, unitCostCents: 980 },
      { sku: 'CAI-GRIL-600', name: 'Caisse grillagée 1200 × 800', kind: 'crate', unit: 'caisse', supplierId: supPallets.id, location: 'Zone logistique', quantityOnHand: 145, quantityReserved: 0, safetyStock: 20, reorderPoint: 60, averageDailyConsumption: 12, unitCostCents: 9_800 },

      // Matières premières, en kilogrammes.
      { sku: 'MP-PP-COPO-NOIR', name: 'PP copolymère noir', kind: 'raw_material', unit: 'kg', supplierId: supPolymers.id, location: 'Silo 1', quantityOnHand: 12_400, quantityReserved: 0, safetyStock: 2_000, reorderPoint: 6_000, averageDailyConsumption: 1_650, unitCostCents: 180 },
      { sku: 'MP-ABS-NOIR', name: 'ABS noir', kind: 'raw_material', unit: 'kg', supplierId: supPolymers.id, location: 'Silo 2', quantityOnHand: 4_800, quantityReserved: 0, safetyStock: 800, reorderPoint: 2_500, averageDailyConsumption: 520, unitCostCents: 265 },
      { sku: 'MP-PEHD-GRIS', name: 'PEHD gris anthracite', kind: 'raw_material', unit: 'kg', supplierId: supPolymers.id, location: 'Silo 3', quantityOnHand: 6_900, quantityReserved: 0, safetyStock: 1_000, reorderPoint: 3_000, averageDailyConsumption: 640, unitCostCents: 155 },
      { sku: 'MP-PP-FV30', name: 'PP chargé fibre de verre 30 %', kind: 'raw_material', unit: 'kg', supplierId: supPolymers.id, location: 'Big bags — Zone M', quantityOnHand: 2_150, quantityReserved: 0, safetyStock: 600, reorderPoint: 2_400, averageDailyConsumption: 430, unitCostCents: 320 },

      // Consommables, outillage et pièces détachées.
      { sku: 'CONS-DEMOU', name: 'Agent démoulant (bidon 5 L)', kind: 'consumable', unit: 'bidon', supplierId: supTooling.id, location: 'Magasin', quantityOnHand: 34, quantityReserved: 0, safetyStock: 6, reorderPoint: 12, averageDailyConsumption: 2, unitCostCents: 3_400 },
      { sku: 'CONS-FILM-ETIR', name: 'Film étirable palettisation', kind: 'consumable', unit: 'rouleau', supplierId: supPallets.id, location: 'Magasin', quantityOnHand: 58, quantityReserved: 0, safetyStock: 10, reorderPoint: 20, averageDailyConsumption: 6, unitCostCents: 1_250 },
      { sku: 'OUT-BUSE-45', name: 'Buse d’injection Ø 45', kind: 'tooling', unit: 'pièce', supplierId: supTooling.id, location: 'Magasin outillage', quantityOnHand: 7, quantityReserved: 0, safetyStock: 2, reorderPoint: 3, averageDailyConsumption: 0, unitCostCents: 22_000 },
      { sku: 'PDR-RESIST-C1000', name: 'Résistance fourreau presse C-1000', kind: 'spare_part', unit: 'pièce', supplierId: supTooling.id, location: 'Magasin maintenance', quantityOnHand: 2, quantityReserved: 0, safetyStock: 1, reorderPoint: 3, averageDailyConsumption: 0, unitCostCents: 18_500 },
    ])
    .returning();
  const item = Object.fromEntries(inventoryRows.map((row) => [row.sku, row])) as Record<string, (typeof inventoryRows)[number]>;

  // ──────────────────────────────────────────────────────── Commandes ─────
  type OrderSeed = {
    number: string;
    customer: string;
    status: 'confirmed' | 'in_production' | 'ready' | 'shipped';
    priority: 'low' | 'normal' | 'high' | 'critical';
    dueInDays: number;
    orderedDaysAgo: number;
    lines: { product: string; quantity: number; reserved: number; produced: number }[];
    notes?: string;
  };

  const orderSeeds: OrderSeed[] = [
    {
      number: '5842',
      customer: 'PL1',
      status: 'in_production',
      priority: 'high',
      dueInDays: 9,
      orderedDaysAgo: 9,
      // 10 000 pièces, 2 000 couvertes par le stock : le parcours de référence (§54).
      lines: [{ product: 'GB-2E-001', quantity: 10_000, reserved: 2_000, produced: 1_500 }],
      notes: 'Commande cadencée — livraison ferme, pénalités de retard contractuelles.',
    },
    {
      number: '5819',
      customer: 'PL2',
      status: 'in_production',
      priority: 'normal',
      dueInDays: 8,
      orderedDaysAgo: 12,
      lines: [{ product: 'GB-3E-001', quantity: 3_000, reserved: 640, produced: 400 }],
      notes: 'Reportable : le client accepte une livraison lundi.',
    },
    {
      number: '5847',
      customer: 'PL3',
      status: 'confirmed',
      priority: 'normal',
      dueInDays: 9,
      orderedDaysAgo: 3,
      // 10 palettes commandées, 2 disponibles en stock : l'exemple du §17.
      lines: [{ product: 'PDR-780', quantity: 1_800, reserved: 360, produced: 0 }],
    },
    {
      number: '5851',
      customer: 'PL4',
      status: 'confirmed',
      priority: 'normal',
      dueInDays: 12,
      orderedDaysAgo: 2,
      lines: [{ product: 'BAV-450', quantity: 12_000, reserved: 3_400, produced: 0 }],
    },
    {
      number: '5853',
      customer: 'PL5',
      status: 'confirmed',
      priority: 'low',
      dueInDays: 18,
      orderedDaysAgo: 1,
      lines: [{ product: 'SUP-BAT-12', quantity: 20_000, reserved: 5_200, produced: 0 }],
    },
    {
      number: '5836',
      customer: 'PL1',
      status: 'ready',
      priority: 'high',
      dueInDays: 2,
      orderedDaysAgo: 16,
      lines: [{ product: 'COIF-220', quantity: 9_000, reserved: 9_000, produced: 0 }],
    },
    {
      number: '5828',
      customer: 'PL2',
      status: 'shipped',
      priority: 'normal',
      dueInDays: -3,
      orderedDaysAgo: 24,
      lines: [{ product: 'GB-2E-001', quantity: 4_000, reserved: 0, produced: 4_000 }],
    },
    {
      number: '5855',
      customer: 'PL3',
      status: 'confirmed',
      priority: 'low',
      dueInDays: 22,
      orderedDaysAgo: 0,
      lines: [{ product: 'GB-2E-001', quantity: 6_000, reserved: 0, produced: 0 }],
    },
  ];

  const orderRows = await db
    .insert(t.customerOrders)
    .values(
      orderSeeds.map((orderSeed) => ({
        number: orderSeed.number,
        customerId: customer[orderSeed.customer].id,
        status: orderSeed.status,
        priority: orderSeed.priority,
        orderedAt: addDays(today, -orderSeed.orderedDaysAgo),
        dueAt: atTime(addDays(today, orderSeed.dueInDays), 17, 0),
        shippedAt: orderSeed.status === 'shipped' ? addDays(today, -4) : null,
        notes: orderSeed.notes ?? null,
      })),
    )
    .returning();
  const order = Object.fromEntries(orderRows.map((row) => [row.number, row])) as Record<string, (typeof orderRows)[number]>;

  const lineRows = await db
    .insert(t.orderLines)
    .values(
      orderSeeds.flatMap((orderSeed) =>
        orderSeed.lines.map((line) => ({
          orderId: order[orderSeed.number].id,
          productId: product[line.product].id,
          quantityUnits: line.quantity,
          reservedUnits: line.reserved,
          producedUnits: line.produced,
          unitPriceCents: product[line.product].unitPriceCents,
        })),
      ),
    )
    .returning();
  const lineByOrderNumber = new Map(
    orderRows.map((row) => [row.number, lineRows.find((line) => line.orderId === row.id)!]),
  );

  // Réservations de stock : ce qui est promis n'est plus disponible (§17).
  const reservations: { sku: string; orderNumber: string; quantity: number }[] = [
    { sku: 'PF-GB-2E-001', orderNumber: '5842', quantity: 2_000 },
    { sku: 'PF-GB-3E-001', orderNumber: '5819', quantity: 640 },
    { sku: 'PF-PDR-780', orderNumber: '5847', quantity: 360 },
    { sku: 'PF-BAV-450', orderNumber: '5851', quantity: 3_400 },
    { sku: 'PF-SUP-BAT-12', orderNumber: '5853', quantity: 5_200 },
    { sku: 'PF-COIF-220', orderNumber: '5836', quantity: 9_000 },
  ];

  await db.insert(t.inventoryReservations).values(
    reservations.map((reservation) => ({
      itemId: item[reservation.sku].id,
      customerOrderId: order[reservation.orderNumber].id,
      quantity: reservation.quantity,
      status: 'active' as const,
    })),
  );

  for (const reservation of reservations) {
    await db
      .update(t.inventoryItems)
      .set({ quantityReserved: sql`${t.inventoryItems.quantityReserved} + ${reservation.quantity}` })
      .where(eq(t.inventoryItems.id, item[reservation.sku].id));
  }

  // ──────────────────────────────────────────── Ordres de fabrication ─────
  type ProductionOrderSeed = {
    number: string;
    orderNumber: string;
    product: string;
    machine: string;
    moldRef: string;
    status: 'planned' | 'released' | 'running' | 'paused' | 'done';
    quantity: number;
    produced: number;
    rejected: number;
    startOffsetDays: number;
    startHour: number;
    durationHours: number;
    unitsPerHour: number;
  };

  const productionOrderSeeds: ProductionOrderSeed[] = [
    // L'OF bloqué par l'arrêt de la Presse 64 — cœur du scénario.
    { number: 'OF-2411', orderNumber: '5842', product: 'GB-2E-001', machine: 'PR-64', moldRef: 'MOU-045', status: 'paused', quantity: 4_000, produced: 1_500, rejected: 24, startOffsetDays: 0, startHour: 6, durationHours: 14, unitsPerHour: 30 },
    { number: 'OF-2412', orderNumber: '5842', product: 'GB-2E-001', machine: 'PR-64', moldRef: 'MOU-045', status: 'planned', quantity: 4_000, produced: 0, rejected: 0, startOffsetDays: 2, startHour: 6, durationHours: 14, unitsPerHour: 30 },
    { number: 'OF-2415', orderNumber: '5819', product: 'GB-3E-001', machine: 'PR-64', moldRef: 'MOU-046', status: 'planned', quantity: 2_360, produced: 0, rejected: 0, startOffsetDays: 1, startHour: 6, durationHours: 12, unitsPerHour: 24.8 },
    { number: 'OF-2408', orderNumber: '5851', product: 'BAV-450', machine: 'PR-04', moldRef: 'MOU-112', status: 'running', quantity: 4_400, produced: 2_180, rejected: 18, startOffsetDays: 0, startHour: 5, durationHours: 16, unitsPerHour: 110 },
    { number: 'OF-2409', orderNumber: '5853', product: 'SUP-BAT-12', machine: 'PR-12', moldRef: 'MOU-118', status: 'running', quantity: 6_040, produced: 3_020, rejected: 62, startOffsetDays: 0, startHour: 5, durationHours: 20, unitsPerHour: 151 },
    { number: 'OF-2413', orderNumber: '5847', product: 'PDR-780', machine: 'PR-67', moldRef: 'MOU-203', status: 'planned', quantity: 1_440, produced: 0, rejected: 0, startOffsetDays: 1, startHour: 6, durationHours: 14, unitsPerHour: 26.6 },
    { number: 'OF-2414', orderNumber: '5836', product: 'COIF-220', machine: 'PR-67', moldRef: 'MOU-247', status: 'running', quantity: 2_600, produced: 1_950, rejected: 12, startOffsetDays: 0, startHour: 6, durationHours: 12, unitsPerHour: 130 },
    { number: 'OF-2416', orderNumber: '5855', product: 'GB-2E-001', machine: 'PR-65', moldRef: 'MOU-045', status: 'planned', quantity: 6_000, produced: 0, rejected: 0, startOffsetDays: 3, startHour: 6, durationHours: 18, unitsPerHour: 26 },
  ];

  const productionOrderRows = await db
    .insert(t.productionOrders)
    .values(
      productionOrderSeeds.map((of) => {
        const start = atTime(addDays(today, of.startOffsetDays), of.startHour, 0);
        return {
          number: of.number,
          orderLineId: lineByOrderNumber.get(of.orderNumber)?.id ?? null,
          customerOrderId: order[of.orderNumber].id,
          productId: product[of.product].id,
          machineId: machine[of.machine].id,
          moldId: mold[of.moldRef].id,
          status: of.status,
          quantityUnits: of.quantity,
          producedUnits: of.produced,
          rejectedUnits: of.rejected,
          plannedStartAt: start,
          plannedEndAt: addHours(start, of.durationHours),
          actualStartAt: of.status === 'running' || of.status === 'paused' ? start : null,
          plannedUnitsPerHour: of.unitsPerHour,
        };
      }),
    )
    .returning();
  const productionOrder = Object.fromEntries(productionOrderRows.map((row) => [row.number, row])) as Record<
    string,
    (typeof productionOrderRows)[number]
  >;

  await db.insert(t.productionRuns).values([
    { productionOrderId: productionOrder['OF-2411'].id, machineId: machine['PR-64'].id, operatorId: employee['E-005'].id, startedAt: atTime(today, 6, 0), goodUnits: 1_500, rejectedUnits: 24, downtimeMinutes: 72 },
    { productionOrderId: productionOrder['OF-2408'].id, machineId: machine['PR-04'].id, operatorId: employee['E-003'].id, startedAt: atTime(today, 5, 0), goodUnits: 2_180, rejectedUnits: 18, downtimeMinutes: 22 },
    { productionOrderId: productionOrder['OF-2409'].id, machineId: machine['PR-12'].id, operatorId: employee['E-002'].id, startedAt: atTime(today, 5, 0), goodUnits: 3_020, rejectedUnits: 62, downtimeMinutes: 34 },
    { productionOrderId: productionOrder['OF-2414'].id, machineId: machine['PR-67'].id, operatorId: employee['E-010'].id, startedAt: atTime(today, 6, 0), goodUnits: 1_950, rejectedUnits: 12, downtimeMinutes: 15 },
  ]);

  // ────────────────────────────────────────────────────────── Palettes ─────
  // 6 palettes terminées sur les 40 nécessaires à la commande #5842.
  const palletSeeds = Array.from({ length: 6 }, (_, index) => ({
    code: `PAL-5842-${String(index + 1).padStart(3, '0')}`,
    productId: product['GB-2E-001'].id,
    productionOrderId: productionOrder['OF-2411'].id,
    customerOrderId: order['5842'].id,
    machineId: machine['PR-64'].id,
    operatorId: employee['E-005'].id,
    status: 'in_stock' as const,
    quantityUnits: 250,
    lotNumber: `L${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-64`,
    location: 'Zone PF-A',
    completedAt: addHours(atTime(today, 6, 0), 1.5 * (index + 1)),
  }));

  await db.insert(t.pallets).values([
    ...palletSeeds,
    {
      code: 'PAL-5842-007',
      productId: product['GB-2E-001'].id,
      productionOrderId: productionOrder['OF-2411'].id,
      customerOrderId: order['5842'].id,
      machineId: machine['PR-64'].id,
      operatorId: employee['E-005'].id,
      status: 'in_progress',
      quantityUnits: 0,
      lotNumber: null,
      location: 'Presse 64',
      completedAt: null,
    },
  ]);

  // ──────────────────────────────────────────── Événements machine ────────
  // Journée de la Presse 64, reconstituée à la minute (§30).
  const p64Events = [
    { type: 'production_start' as const, status: 'production' as const, from: atTime(today, 6, 0), to: atTime(today, 10, 42), reason: null },
    { type: 'stop' as const, status: 'stopped' as const, from: atTime(today, 10, 42), to: atTime(today, 11, 14), reason: 'Alimentation matière — trémie vide' },
    { type: 'production_start' as const, status: 'production' as const, from: atTime(today, 11, 14), to: stoppedSince, reason: null },
    { type: 'stop' as const, status: 'stopped' as const, from: stoppedSince, to: null, reason: 'Défaut alimentation matière — vis de dosage' },
  ];

  const otherEvents = [
    { machine: 'PR-04', type: 'production_start' as const, status: 'production' as const, from: atTime(today, 5, 0), to: atTime(today, 9, 12), reason: null },
    { machine: 'PR-04', type: 'setup' as const, status: 'setup' as const, from: atTime(today, 9, 12), to: atTime(today, 9, 34), reason: 'Reprise de réglage — retrait bavures' },
    { machine: 'PR-04', type: 'production_start' as const, status: 'production' as const, from: atTime(today, 9, 34), to: null, reason: null },
    { machine: 'PR-12', type: 'production_start' as const, status: 'production' as const, from: atTime(today, 5, 0), to: atTime(today, 8, 20), reason: null },
    { machine: 'PR-12', type: 'fault' as const, status: 'fault' as const, from: atTime(today, 8, 20), to: atTime(today, 8, 54), reason: 'Défaut température fourreau zone 3' },
    { machine: 'PR-12', type: 'production_start' as const, status: 'production' as const, from: atTime(today, 8, 54), to: null, reason: null },
    { machine: 'PR-65', type: 'mold_change' as const, status: 'mold_change' as const, from: atTime(today, 6, 0), to: addMinutes(now, -35), reason: 'Démontage moule MOU-112' },
    { machine: 'PR-65', type: 'setup' as const, status: 'setup' as const, from: addMinutes(now, -35), to: null, reason: 'Attente moule et régleur' },
    { machine: 'PR-67', type: 'production_start' as const, status: 'production' as const, from: atTime(today, 6, 0), to: null, reason: null },
  ];

  await db.insert(t.machineEvents).values([
    ...p64Events.map((event) => ({
      machineId: machine['PR-64'].id,
      type: event.type,
      status: event.status,
      startedAt: event.from,
      endedAt: event.to,
      durationMinutes: event.to ? Math.round((event.to.getTime() - event.from.getTime()) / 60_000) : null,
      reason: event.reason,
      productionOrderId: productionOrder['OF-2411'].id,
      source: 'simulated' as const,
    })),
    ...otherEvents.map((event) => ({
      machineId: machine[event.machine].id,
      type: event.type,
      status: event.status,
      startedAt: event.from,
      endedAt: event.to,
      durationMinutes: event.to ? Math.round((event.to.getTime() - event.from.getTime()) / 60_000) : null,
      reason: event.reason,
      source: 'simulated' as const,
    })),
  ]);

  // ──────────────────────────────────────────────────────────── Qualité ────
  await db.insert(t.qualityEvents).values([
    { productionOrderId: productionOrder['OF-2411'].id, machineId: machine['PR-64'].id, defect: 'appearance', rejectedUnits: 14, lotNumber: palletSeeds[0].lotNumber, detectedAt: atTime(today, 9, 20), comment: 'Traces de brûlure en bord de pièce', declaredBy: employee['E-008'].id },
    { productionOrderId: productionOrder['OF-2411'].id, machineId: machine['PR-64'].id, defect: 'flash', rejectedUnits: 10, lotNumber: palletSeeds[1].lotNumber, detectedAt: atTime(today, 12, 5), comment: 'Bavures après reprise de production', declaredBy: employee['E-008'].id },
    { productionOrderId: productionOrder['OF-2409'].id, machineId: machine['PR-12'].id, defect: 'dimension', rejectedUnits: 62, lotNumber: 'L-SUP-0912', detectedAt: atTime(today, 8, 40), comment: 'Cote hors tolérance après défaut de température', declaredBy: employee['E-008'].id },
    { productionOrderId: productionOrder['OF-2408'].id, machineId: machine['PR-04'].id, defect: 'appearance', rejectedUnits: 18, lotNumber: 'L-BAV-0110', detectedAt: atTime(today, 9, 15), comment: 'Rayures de manipulation', declaredBy: employee['E-003'].id },
    { productionOrderId: productionOrder['OF-2414'].id, machineId: machine['PR-67'].id, defect: 'shrinkage', rejectedUnits: 12, lotNumber: 'L-COIF-0067', detectedAt: atTime(today, 10, 30), comment: 'Retassures sur zone épaisse', declaredBy: employee['E-010'].id },
  ]);

  // ─────────────────────────────────────────── Incidents (mémoire usine) ──
  const incidentRows = await db
    .insert(t.incidents)
    .values([
      {
        reference: 'INC-2025-104',
        title: 'Presse 64 — arrêts répétés sur alimentation matière',
        severity: 'critical',
        status: 'resolved',
        machineId: machine['PR-64'].id,
        workshopId: workshopB.id,
        symptom: "La presse s'arrête en cours de série, la trémie se vide anormalement vite et la vis de dosage patine.",
        rootCause:
          "Lot de PP copolymère du fournisseur Fournisseur matière A présentant un taux de fines trop élevé, provoquant un pontage dans la trémie.",
        resolution:
          "Changement de lot matière, nettoyage complet de la trémie et pose d'un vibreur sur la descente. Réclamation ouverte auprès du fournisseur.",
        tags: ['alimentation matière', 'trémie', 'vis de dosage', 'PP copolymère', 'fournisseur'],
        downtimeMinutes: 214,
        estimatedCostCents: 812_000,
        occurredAt: addDays(today, -300),
        resolvedAt: addDays(today, -299),
      },
      {
        reference: 'INC-2026-018',
        title: 'Presse 12 — défaut température fourreau zone 3',
        severity: 'warning',
        status: 'resolved',
        machineId: machine['PR-12'].id,
        workshopId: workshopA.id,
        symptom: 'Alarme température zone 3, arrêt automatique de la presse.',
        rootCause: 'Résistance de fourreau en fin de vie.',
        resolution: 'Remplacement de la résistance, stock magasin ramené à 2 pièces.',
        tags: ['température', 'fourreau', 'résistance', 'presse C'],
        downtimeMinutes: 34,
        estimatedCostCents: 96_000,
        occurredAt: atTime(today, 8, 20),
        resolvedAt: atTime(today, 8, 54),
      },
      {
        reference: 'INC-2026-031',
        title: 'Presse 64 — arrêt sur défaut alimentation matière',
        severity: 'critical',
        status: 'investigating',
        machineId: machine['PR-64'].id,
        workshopId: workshopB.id,
        productionOrderId: productionOrder['OF-2411'].id,
        symptom: "Arrêt en cours de série sur l'OF-2411, vis de dosage en défaut, trémie partiellement pontée.",
        rootCause: null,
        resolution: null,
        tags: ['alimentation matière', 'trémie', 'vis de dosage'],
        downtimeMinutes: 72,
        estimatedCostCents: 385_000,
        declaredBy: employee['E-005'].id,
        occurredAt: stoppedSince,
      },
    ])
    .returning();
  const incident = Object.fromEntries(incidentRows.map((row) => [row.reference, row])) as Record<
    string,
    (typeof incidentRows)[number]
  >;

  // ────────────────────────────────────────────────────────── Alertes ─────
  const alertRows = await db
    .insert(t.alerts)
    .values([
      {
        severity: 'critical',
        status: 'open',
        domain: 'machine',
        title: 'Presse 64 arrêtée depuis 1 h 12',
        problem:
          "La Presse 64 est à l'arrêt depuis 1 h 12 sur un défaut d'alimentation matière. L'OF-2411 est suspendu.",
        probableCause:
          "Pontage matière dans la trémie et patinage de la vis de dosage — symptômes identiques à l'incident INC-2025-104 d'octobre.",
        consequences:
          '2 commandes concernées, dont la commande #5842 (Constructeur poids lourds 1) dont le reste à produire dépend de cette presse.',
        impactCents: 385_000,
        impactOrigin: 'estimated',
        machineId: machine['PR-64'].id,
        workshopId: workshopB.id,
        customerOrderId: order['5842'].id,
        incidentId: incident['INC-2026-031'].id,
        context: { productionOrder: 'OF-2411', downtimeMinutes: 72, ordersAffected: ['5842', '5819'] },
        detectedAt: stoppedSince,
      },
      {
        severity: 'warning',
        status: 'open',
        domain: 'stock',
        title: 'Stock de palettes insuffisant sous 48 h',
        problem:
          'Le stock de palettes Europe est de 300 unités pour une consommation moyenne de 150 par jour et un besoin prévisionnel de 430 sur la période.',
        probableCause:
          'Trois commandes de forte volumétrie sont palettisées la même semaine, sans réapprovisionnement planifié.',
        consequences:
          'Rupture probable après-demain : les palettes terminées ne pourront plus être mises en stock ni expédiées.',
        impactCents: 460_000,
        impactOrigin: 'forecast',
        context: { sku: 'PAL-EUR-1208', onHand: 300, dailyConsumption: 150, required: 430 },
        detectedAt: addHours(now, -3),
      },
      {
        severity: 'warning',
        status: 'open',
        domain: 'commande',
        title: 'Commande #5842 — risque de retard',
        problem:
          "La commande #5842 est exposée à un risque de retard : la capacité restante avant l'échéance ne couvre plus le reste à produire avec une marge confortable.",
        probableCause:
          "Capacité insuffisante sur la Presse 64 : l'arrêt en cours consomme la marge disponible avant l'échéance.",
        consequences: 'Livraison Constructeur poids lourds 1 menacée, pénalités contractuelles applicables.',
        impactCents: 1_240_000,
        impactOrigin: 'estimated',
        customerOrderId: order['5842'].id,
        machineId: machine['PR-64'].id,
        context: { remainingUnits: 6_500, machine: 'PR-64' },
        detectedAt: addHours(now, -1),
      },
      {
        severity: 'warning',
        status: 'open',
        domain: 'production',
        title: "Atelier Injection sous son objectif de production",
        problem: "L'atelier B est à 72 % de son objectif journalier.",
        probableCause:
          "Deux arrêts machine sur la Presse 64 et une Presse 65 immobilisée en changement de moule.",
        consequences: "Le retard se reporte sur les ordres de fabrication de demain.",
        impactCents: 268_000,
        impactOrigin: 'computed',
        workshopId: workshopB.id,
        context: { achievementPct: 72 },
        detectedAt: addHours(now, -2),
      },
      {
        severity: 'info',
        status: 'open',
        domain: 'personnel',
        title: 'Habilitation SST bientôt expirée',
        problem: "L'habilitation SST de Samir Richard expire dans 45 jours.",
        probableCause: 'Recyclage non planifié.',
        consequences:
          "Sans recyclage, l'atelier B passerait sous le nombre requis de sauveteurs secouristes du travail.",
        impactCents: 0,
        impactOrigin: 'measured',
        workshopId: workshopB.id,
        context: { employee: 'Samir Richard', daysRemaining: 45 },
        detectedAt: addHours(now, -20),
      },
      {
        severity: 'info',
        status: 'open',
        domain: 'planning',
        title: 'Changements de moule regroupables sur la Presse 64',
        problem:
          'La séquence planifiée sur la Presse 64 enchaîne MOU-045 → MOU-046 → MOU-045, soit deux changements de moule.',
        probableCause: "Ordres de fabrication planifiés commande par commande, sans regroupement par moule.",
        consequences: '8 heures de changement de moule au lieu de 4.',
        impactCents: 296_000,
        impactOrigin: 'computed',
        machineId: machine['PR-64'].id,
        context: { savedMinutes: 240 },
        detectedAt: addHours(now, -5),
      },
    ])
    .returning();

  const alertByTitlePrefix = (prefix: string) => alertRows.find((row) => row.title.startsWith(prefix))!;

  // ──────────────────────────────────────────────────── Recommandations ───
  const recommendationRows = await db
    .insert(t.recommendations)
    .values([
      {
        alertId: alertByTitlePrefix('Presse 64 arrêtée').id,
        status: 'simulated',
        title: "Basculer l'OF-2411 de la Presse 64 vers la Presse 65",
        rationale:
          "La Presse 65 est compatible avec le moule MOU-045 et se libère à la fin du changement de moule en cours. Le basculement coûte 4 h de changement de moule mais évite d'attendre la remise en route de la Presse 64.",
        action: {
          type: 'move_production_order',
          productionOrderNumber: 'OF-2411',
          fromMachine: 'PR-64',
          toMachine: 'PR-65',
          changeoverMinutes: 240,
        },
        expectedGainCents: 320_000,
        confidence: 0.82,
        origin: 'computed',
        requiresApproval: true,
        expiresAt: addHours(now, 8),
      },
      {
        alertId: alertByTitlePrefix('Stock de palettes').id,
        status: 'proposed',
        title: 'Commander 800 palettes Europe avant demain 12 h',
        rationale:
          "Le délai fournisseur de Fournisseur emballages B est de 2 jours. Une commande passée avant demain midi couvre la rupture projetée et reconstitue 14 jours de couverture.",
        action: {
          type: 'create_purchase_requirement',
          sku: 'PAL-EUR-1208',
          quantity: 800,
          supplier: 'FRN-PAL',
        },
        expectedGainCents: 460_000,
        confidence: 0.91,
        origin: 'forecast',
        requiresApproval: true,
        expiresAt: addHours(now, 20),
      },
      {
        alertId: alertByTitlePrefix('Commande #5842').id,
        status: 'simulated',
        title: 'Reporter la commande #5819 à lundi',
        rationale:
          "Le client Constructeur poids lourds 2 accepte une livraison lundi sur la commande #5819. Libérer son créneau sur la Presse 64 permet de produire la commande #5842 vendredi.",
        action: {
          type: 'reschedule_order',
          orderNumber: '5819',
          newStartAt: nextWorkingDay(today, 3).toISOString(),
        },
        expectedGainCents: 1_240_000,
        confidence: 0.76,
        origin: 'estimated',
        requiresApproval: true,
        expiresAt: addHours(now, 30),
      },
      {
        alertId: alertByTitlePrefix('Changements de moule').id,
        status: 'proposed',
        title: 'Regrouper les ordres utilisant le moule MOU-045',
        rationale:
          "Réordonner la séquence en OF-2411 → OF-2412 → OF-2415 ramène le nombre de changements de moule de 2 à 1, soit 4 heures regagnées et environ 120 pièces supplémentaires.",
        action: {
          type: 'reorder_sequence',
          machine: 'PR-64',
          sequence: ['OF-2411', 'OF-2412', 'OF-2415'],
        },
        expectedGainCents: 296_000,
        confidence: 0.88,
        origin: 'computed',
        requiresApproval: true,
        expiresAt: addHours(now, 48),
      },
    ])
    .returning();

  await db.insert(t.simulations).values([
    {
      recommendationId: recommendationRows[0].id,
      scenario: "Bascule de l'OF-2411 sur la Presse 65",
      successProbability: 0.94,
      baseline: { deliveryOnTimePct: 63, completionAt: addHours(now, 62).toISOString() },
      projected: { deliveryOnTimePct: 94, completionAt: addHours(now, 41).toISOString() },
      deltaCents: 320_000,
    },
    {
      recommendationId: recommendationRows[2].id,
      scenario: 'Report de la commande #5819 à lundi',
      successProbability: 0.95,
      baseline: { order5842RiskPct: 37, order5819RiskPct: 8 },
      projected: { order5842RiskPct: 5, order5819RiskPct: 12 },
      deltaCents: 1_240_000,
    },
  ]);

  // ────────────────────────────────────────────── Besoins d'achat ─────────
  await db.insert(t.purchaseRequirements).values([
    {
      itemId: item['PAL-EUR-1208'].id,
      supplierId: supPallets.id,
      severity: 'warning',
      requiredQuantity: 430,
      recommendedQuantity: 800,
      orderByAt: atTime(addDays(today, 1), 12, 0),
      projectedShortageAt: addDays(today, 2),
      reason: 'Consommation de 150 palettes/jour pour un stock de 300 et un besoin de 430.',
    },
    {
      itemId: item['MP-PP-FV30'].id,
      supplierId: supPolymers.id,
      severity: 'info',
      requiredQuantity: 1_200,
      recommendedQuantity: 4_000,
      orderByAt: atTime(addDays(today, 2), 17, 0),
      projectedShortageAt: addDays(today, 4),
      reason: 'Stock sous le point de commande, délai fournisseur de 6 jours.',
    },
  ]);

  // ───────────────────────────────────── Mouvements de stock récents ──────
  await db.insert(t.inventoryMovements).values([
    { itemId: item['PF-GB-2E-001'].id, type: 'production_output', quantity: 1_500, quantityAfter: 2_000, reference: 'OF-2411', customerOrderId: order['5842'].id, note: '6 palettes déclarées', occurredAt: addHours(now, -5) },
    { itemId: item['PAL-EUR-1208'].id, type: 'consumption', quantity: -6, quantityAfter: 300, reference: 'OF-2411', note: 'Palettisation garde-boues', occurredAt: addHours(now, -5) },
    { itemId: item['MP-PP-COPO-NOIR'].id, type: 'consumption', quantity: -3_675, quantityAfter: 12_400, reference: 'OF-2411', note: 'Consommation matière 1 500 pièces', occurredAt: addHours(now, -5) },
    { itemId: item['MP-PP-COPO-NOIR'].id, type: 'inbound', quantity: 8_000, quantityAfter: 16_075, reference: 'BL-2026-0455', note: 'Livraison Fournisseur matière A', occurredAt: addDays(now, -1) },
    { itemId: item['PF-COIF-220'].id, type: 'production_output', quantity: 1_950, quantityAfter: 9_100, reference: 'OF-2414', customerOrderId: order['5836'].id, occurredAt: addHours(now, -2) },
    { itemId: item['PF-SUP-BAT-12'].id, type: 'production_output', quantity: 3_020, quantityAfter: 5_200, reference: 'OF-2409', customerOrderId: order['5853'].id, occurredAt: addHours(now, -3) },
    { itemId: item['PDR-RESIST-C1000'].id, type: 'outbound', quantity: -1, quantityAfter: 2, reference: 'INC-2026-018', note: 'Remplacement résistance Presse 12', occurredAt: atTime(today, 8, 50) },
  ]);

  // ──────────────────────────────────────────────── Historique de santé ───
  /*
   * Les instantanés portent aussi les chiffres d'exploitation : sans eux,
   * l'accueil ne peut afficher aucune comparaison à la veille. L'histoire
   * qu'ils racontent est celle du reste du jeu de données — une usine qui
   * produisait bien il y a une semaine, et que les arrêts de la Presse 64 ont
   * progressivement dégradée.
   */
  await db.insert(t.healthSnapshots).values([
    { capturedAt: addDays(now, -7), globalScore: 91, productionScore: 96, inventoryScore: 90, machineScore: 88, planningScore: 93, qualityScore: 95, staffScore: 92, producedUnits: 9_420, targetUnits: 9_680, lateOrders: 1, downtimeMinutes: 96, downtimeCostCents: 118_000 },
    { capturedAt: addDays(now, -3), globalScore: 89, productionScore: 94, inventoryScore: 88, machineScore: 84, planningScore: 92, qualityScore: 94, staffScore: 92, producedUnits: 9_120, targetUnits: 9_680, lateOrders: 2, downtimeMinutes: 148, downtimeCostCents: 182_000 },
    { capturedAt: addDays(now, -1), globalScore: 87, productionScore: 92, inventoryScore: 84, machineScore: 78, planningScore: 91, qualityScore: 93, staffScore: 94, producedUnits: 8_870, targetUnits: 9_680, lateOrders: 3, downtimeMinutes: 214, downtimeCostCents: 264_000 },
  ]);

  // ───────────────────────────────────────────────────── Journal d'audit ──
  await db.insert(t.auditLogs).values([
    { userLabel: 'Inès Garnier', action: 'production_order.pause', entityType: 'production_order', entityId: productionOrder['OF-2411'].id, entityLabel: 'OF-2411', previousValue: { status: 'running' }, newValue: { status: 'paused' }, justification: 'Arrêt Presse 64 — défaut alimentation matière', occurredAt: stoppedSince },
    { userLabel: 'Samir Richard', action: 'incident.declare', entityType: 'incident', entityId: incident['INC-2026-031'].id, entityLabel: 'INC-2026-031', newValue: { severity: 'critical' }, occurredAt: addMinutes(stoppedSince, 4) },
    { userLabel: 'Hervé Morel', action: 'incident.resolve', entityType: 'incident', entityId: incident['INC-2026-018'].id, entityLabel: 'INC-2026-018', previousValue: { status: 'open' }, newValue: { status: 'resolved' }, justification: 'Résistance remplacée', occurredAt: atTime(today, 8, 54) },
    { userLabel: 'Jérôme Leroy', action: 'order.create', entityType: 'customer_order', entityId: order['5855'].id, entityLabel: 'Commande #5855', newValue: { quantity: 6_000, product: 'GB-2E-001' }, occurredAt: addHours(now, -7) },
  ]);

  await db.insert(t.notifications).values([
    { roleCode: 'responsable_production', severity: 'critical', title: 'Presse 64 arrêtée', body: "Arrêt depuis 1 h 12 — la commande #5842 est menacée.", href: '/alertes', createdAt: stoppedSince },
    { roleCode: 'responsable_stock', severity: 'warning', title: 'Palettes : rupture sous 48 h', body: 'Commande recommandée de 800 palettes avant demain 12 h.', href: '/stocks', createdAt: addHours(now, -3) },
    { roleCode: 'responsable_rh', severity: 'info', title: 'Habilitation SST à renouveler', body: 'Samir Richard — expiration dans 45 jours.', href: '/personnel', createdAt: addHours(now, -20) },
  ]);
}
