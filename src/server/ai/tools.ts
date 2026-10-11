import 'server-only';

import type { FunctionTool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { can, type PermissionCode } from '../domain/permissions';
import { computeFactoryHealth, healthSeverity } from '../domain/health-score';
import type { AliasMap } from '../domain/ai-privacy';
import { getFactoryContext, type FactoryContext } from '../services/factory-context';
import { getMachineHistory } from '../services/machine-history';
import { getOperatorProductionToday } from '../services/operator-production';
import type { AiQuestion } from './types';

type ToolName =
  | 'get_factory_overview'
  | 'get_production_status'
  | 'get_machine_status'
  | 'get_machine_history'
  | 'calculate_oee'
  | 'get_production_planning'
  | 'get_current_orders'
  | 'get_current_stocks'
  | 'get_current_alerts'
  | 'get_personnel_availability'
  | 'get_operator_production'
  | 'get_production_costs';

export type AiToolResult = {
  ok: boolean;
  data?: unknown;
  sources: { label: string; href?: string }[];
  missingData?: string[];
  error?: 'forbidden' | 'not_found' | 'invalid_arguments' | 'unknown_tool';
};

type ToolSpec = {
  definition: FunctionTool;
  permission: PermissionCode;
  execute: (args: unknown, context: FactoryContext) => Promise<AiToolResult> | AiToolResult;
};

const emptyParameters = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

const queryParameters = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Code, nom ou identifiant exact ou partiel de la machine.',
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

function defineTool(
  name: ToolName,
  description: string,
  permission: PermissionCode,
  parameters: FunctionTool['parameters'],
  execute: ToolSpec['execute'],
): ToolSpec {
  return {
    definition: { type: 'function', name, description, parameters, strict: true },
    permission,
    execute,
  };
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function findMachine(context: FactoryContext, query: string) {
  const needle = normalize(query);
  return context.machines.find((machine) =>
    [machine.id, machine.code, machine.name].some((value) => normalize(value).includes(needle)),
  );
}

export function scopeFactoryContext(context: FactoryContext, question: AiQuestion): FactoryContext {
  const workshopId = question.workshopId;
  const productionAllowed = can(question.permissions, 'production:read');
  const machinesAllowed = can(question.permissions, 'machines:read');
  const ordersAllowed = can(question.permissions, 'orders:read');
  const inventoryAllowed = can(question.permissions, 'inventory:read');
  const staffAllowed = can(question.permissions, 'hr:read');
  const alertsAllowed = can(question.permissions, 'alerts:read');

  const workshops = productionAllowed
    ? context.workshops.filter((workshop) => !workshopId || workshop.id === workshopId)
    : [];
  const machines = machinesAllowed
    ? context.machines.filter((machine) => !workshopId || machine.workshopId === workshopId)
    : [];
  const producedUnits = workshops.reduce((sum, workshop) => sum + workshop.producedUnits, 0);
  const targetUnits = workshops.reduce((sum, workshop) => sum + workshop.targetUnits, 0);
  const rejectedUnits = machines.reduce((sum, machine) => sum + machine.rejectedUnits, 0);
  const workshopName = workshopId
    ? context.workshops.find((workshop) => workshop.id === workshopId)?.name
    : undefined;
  const orders = ordersAllowed
    ? context.orders.filter((order) => !workshopId || order.workshopIds.includes(workshopId))
    : [];
  const inventory = inventoryAllowed ? context.inventory : [];
  const alerts = alertsAllowed
    ? context.alerts.filter((alert) => !workshopId || alert.workshopId === workshopId)
    : [];
  const roster = staffAllowed
    ? context.staff.roster.filter(
        (employee) => !workshopId || employee.workshopName === workshopName,
      )
    : [];
  const absentToday = staffAllowed
    ? context.staff.absentToday.filter(
        (employee) => !workshopId || employee.workshopName === workshopName,
      )
    : [];
  const expiringQualifications = staffAllowed && !workshopId
    ? context.staff.expiringQualifications
    : [];
  const healthInput = {
    production: { producedUnits, targetUnits },
    machines: {
      total: machines.length,
      down: machines.filter((machine) => machine.severity === 'critical').length,
      downtimeMinutes: machines.reduce((sum, machine) => sum + machine.downtimeMinutes, 0),
      plannedMinutes: machines.reduce((sum, machine) => sum + machine.plannedMinutes, 0),
    },
    inventory: {
      trackedItems: inventory.length,
      belowReorderPoint: inventory.filter((item) => item.quantityOnHand <= item.reorderPoint).length,
      projectedShortages: inventory.filter(
        (item) => item.shortageInDays !== null && item.shortageInDays <= 3,
      ).length,
    },
    planning: {
      activeOrders: orders.length,
      ordersAtRisk: orders.filter((order) => order.riskPct >= 20).length,
      ordersLate: orders.filter((order) => order.isLate).length,
    },
    quality: { goodUnits: producedUnits, rejectedUnits },
    staff: {
      required: roster.length,
      present: roster.filter((employee) => !employee.isAbsent).length,
      expiringQualifications: expiringQualifications.length,
    },
  };
  const health = computeFactoryHealth(healthInput);

  return {
    ...context,
    health,
    healthSeverity: healthSeverity(health.global),
    healthVariation: null,
    previousGlobalScore: null,
    production: {
      producedUnits,
      targetUnits,
      achievementPct: targetUnits > 0 ? Math.round((producedUnits / targetUnits) * 100) : 100,
      rejectedUnits,
      scrapRatePct:
        producedUnits + rejectedUnits > 0
          ? Math.round((rejectedUnits / (producedUnits + rejectedUnits)) * 1000) / 10
          : 0,
    },
    workshops,
    machines,
    planning: can(question.permissions, 'planning:read')
      ? context.planning.filter((order) => !workshopId || order.workshopId === workshopId)
      : [],
    orders,
    inventory,
    alerts,
    staff: {
      required: roster.length,
      present: roster.filter((employee) => !employee.isAbsent).length,
      roster,
      absentToday,
      // Les qualifications n'exposent pas encore leur atelier dans le contexte source.
      // On les omet plutôt que de risquer une fuite inter-ateliers.
      expiringQualifications,
    },
    healthInput,
  };
}

function buildToolSpecs(question: AiQuestion, privacy?: AliasMap): Record<ToolName, ToolSpec> {
  return {
    get_factory_overview: defineTool(
      'get_factory_overview',
      "Retourne la synthèse du périmètre autorisé : production, machines, commandes à risque, alertes et stocks critiques. Utiliser pour 'comment va l'usine/atelier'.",
      'dashboard:read',
      emptyParameters,
      (_args, context) => ({
        ok: true,
        data: {
          capturedAt: context.capturedAt,
          production: can(question.permissions, 'production:read') ? context.production : undefined,
          workshops: can(question.permissions, 'production:read') ? context.workshops : undefined,
          machines: can(question.permissions, 'machines:read')
            ? {
                total: context.machines.length,
                stopped: context.machines.filter((machine) => machine.severity === 'critical'),
              }
            : undefined,
          ordersAtRisk: can(question.permissions, 'orders:read')
            ? context.orders.filter((order) => order.riskPct >= 20)
            : undefined,
          stockRisks: can(question.permissions, 'inventory:read')
            ? context.inventory.filter(
                (item) => item.shortageInDays !== null && item.shortageInDays <= 3,
              )
            : undefined,
          alerts: can(question.permissions, 'alerts:read') ? context.alerts : undefined,
        },
        sources: [
          { label: 'Production aujourd’hui', href: '/production' },
          { label: 'Machines', href: '/machines' },
          { label: 'Commandes', href: '/commandes' },
          { label: 'Stocks', href: '/stocks' },
          { label: 'Centre d’alertes', href: '/alertes' },
        ],
      }),
    ),
    get_production_status: defineTool(
      'get_production_status',
      'Retourne la production réelle, les objectifs, les rebuts et la réalisation par atelier autorisé.',
      'production:read',
      emptyParameters,
      (_args, context) => ({
        ok: true,
        data: { capturedAt: context.capturedAt, ...context.production, workshops: context.workshops },
        sources: [{ label: 'Production aujourd’hui', href: '/production' }],
      }),
    ),
    get_machine_status: defineTool(
      'get_machine_status',
      "Retourne l'état courant, l'ordre, la cause connue du statut, les temps et indicateurs calculés d'une machine autorisée.",
      'machines:read',
      queryParameters,
      (args, context) => {
        const parsed = z.object({ query: z.string().min(1).max(120) }).safeParse(args);
        if (!parsed.success) return { ok: false, error: 'invalid_arguments', sources: [] };
        const machine = findMachine(context, parsed.data.query);
        if (!machine) {
          return {
            ok: false,
            error: 'not_found',
            sources: [{ label: 'Machines', href: '/machines' }],
            missingData: ["Aucune machine de ce nom n'existe dans le périmètre autorisé."],
          };
        }
        return {
          ok: true,
          data: {
            ...machine,
            hourlyCostCents: can(question.permissions, 'finance:read')
              ? machine.hourlyCostCents
              : undefined,
          },
          sources: [{ label: machine.name, href: `/machines/${machine.id}` }],
          missingData: machine.reason ? undefined : ["La cause de l'état courant n'est pas renseignée."],
        };
      },
    ),
    get_machine_history: defineTool(
      'get_machine_history',
      "Retourne les événements agrégés disponibles aujourd'hui pour une machine. Il ne déduit jamais une cause absente.",
      'maintenance:read',
      queryParameters,
      async (args, context) => {
        const parsed = z.object({ query: z.string().min(1).max(120) }).safeParse(args);
        if (!parsed.success) return { ok: false, error: 'invalid_arguments', sources: [] };
        const machine = findMachine(context, parsed.data.query);
        if (!machine) return { ok: false, error: 'not_found', sources: [] };
        const history = await getMachineHistory(machine.id, { pageSize: 20 });
        if (!history) return { ok: false, error: 'not_found', sources: [] };
        return {
          ok: true,
          data: {
            machineId: machine.id,
            machineCode: machine.code,
            from: history.from,
            to: history.to,
            downtimeSeconds: history.downtimeSeconds,
            previousDowntimeSeconds: history.previousDowntimeSeconds,
            downtimeVariationPct: history.downtimeVariationPct,
            topAlarms: history.topAlarms,
            sourceLabel: history.sourceLabel,
            measured: history.measured,
            events: history.filtered.slice(0, 20).map((event) => ({
              occurredAt: event.occurredAt,
              code: event.code,
              title: event.title,
              description: event.description,
              severity: event.severity,
              impact: event.impact,
              durationSeconds: event.durationSeconds,
              status: event.status,
              correctiveAction: event.correctiveAction,
              knownRootCause: event.maintenanceComment,
              source: event.source,
            })),
          },
          sources: [{ label: `Historique ${machine.name}`, href: `/machines/${machine.id}/historique` }],
          missingData:
            history.filtered.length === 0
              ? ["Aucun événement n'est enregistré sur la période."]
              : undefined,
        };
      },
    ),
    calculate_oee: defineTool(
      'calculate_oee',
      "Retourne le TRS/OEE déterministe calculé par KS Plastico Demo pour aujourd'hui, jamais par le LLM.",
      'machines:read',
      queryParameters,
      (args, context) => {
        const parsed = z.object({ query: z.string().min(1).max(120) }).safeParse(args);
        if (!parsed.success) return { ok: false, error: 'invalid_arguments', sources: [] };
        const machine = findMachine(context, parsed.data.query);
        if (!machine) return { ok: false, error: 'not_found', sources: [] };
        return {
          ok: true,
          data: {
            machineId: machine.id,
            machineCode: machine.code,
            period: 'today',
            oeePct: machine.oeePct,
            plannedMinutes: machine.plannedMinutes,
            downtimeMinutes: machine.downtimeMinutes,
            producedUnits: machine.producedUnits,
            rejectedUnits: machine.rejectedUnits,
          },
          sources: [{ label: `TRS ${machine.name}`, href: `/machines/${machine.id}` }],
        };
      },
    ),
    get_production_planning: defineTool(
      'get_production_planning',
      'Retourne les OF planifiés avec machine, atelier, moule, cadence et fenêtre. Les dates viennent du planning KS Plastico Demo.',
      'planning:read',
      {
        type: 'object',
        properties: {
          horizonDays: {
            type: 'integer',
            minimum: 1,
            maximum: 30,
            description: "Nombre de jours à partir d'aujourd'hui.",
          },
        },
        required: ['horizonDays'],
        additionalProperties: false,
      },
      (args, context) => {
        const parsed = z.object({ horizonDays: z.number().int().min(1).max(30) }).safeParse(args);
        if (!parsed.success) return { ok: false, error: 'invalid_arguments', sources: [] };
        const until = new Date(context.capturedAt.getTime() + parsed.data.horizonDays * 86_400_000);
        return {
          ok: true,
          data: context.planning.filter(
            (order) => order.plannedEndAt >= context.dayStart && order.plannedStartAt <= until,
          ),
          sources: [{ label: 'Planning de production', href: '/planning' }],
        };
      },
    ),
    get_current_orders: defineTool(
      'get_current_orders',
      'Retourne les commandes actives autorisées, leurs échéances, avancement et risques calculés. Peut limiter aux retards/risques.',
      'orders:read',
      {
        type: 'object',
        properties: { atRiskOnly: { type: 'boolean' } },
        required: ['atRiskOnly'],
        additionalProperties: false,
      },
      (args, context) => {
        const parsed = z.object({ atRiskOnly: z.boolean() }).safeParse(args);
        if (!parsed.success) return { ok: false, error: 'invalid_arguments', sources: [] };
        return {
          ok: true,
          data: context.orders.filter((order) => !parsed.data.atRiskOnly || order.riskPct >= 20),
          sources: [
            { label: 'Commandes actives', href: '/commandes' },
            { label: 'Planning', href: '/planning' },
          ],
        };
      },
    ),
    get_current_stocks: defineTool(
      'get_current_stocks',
      'Retourne les stocks, disponibilités et projections déterministes. Une recherche vide retourne les articles à risque.',
      'inventory:read',
      {
        type: 'object',
        properties: { query: { type: 'string', description: 'SKU ou nom, vide pour les risques.' } },
        required: ['query'],
        additionalProperties: false,
      },
      (args, context) => {
        const parsed = z.object({ query: z.string().max(120) }).safeParse(args);
        if (!parsed.success) return { ok: false, error: 'invalid_arguments', sources: [] };
        const needle = normalize(parsed.data.query);
        const inventory = context.inventory.filter((item) =>
          needle
            ? normalize(`${item.sku} ${item.name}`).includes(needle)
            : item.shortageInDays !== null || item.quantityOnHand <= item.reorderPoint,
        );
        return {
          ok: true,
          data: inventory,
          sources: [{ label: 'Stocks', href: '/stocks' }],
          missingData: inventory.length === 0 ? ['Aucun article correspondant dans KS Plastico Demo.'] : undefined,
        };
      },
    ),
    get_current_alerts: defineTool(
      'get_current_alerts',
      'Retourne les alertes ouvertes du périmètre autorisé, sans impact financier si le droit finance manque.',
      'alerts:read',
      emptyParameters,
      (_args, context) => ({
        ok: true,
        data: context.alerts.map((alert) => ({
          ...alert,
          impactCents: can(question.permissions, 'finance:read') ? alert.impactCents : undefined,
        })),
        sources: [{ label: 'Centre d’alertes', href: '/alertes' }],
      }),
    ),
    get_personnel_availability: defineTool(
      'get_personnel_availability',
      'Retourne uniquement des effectifs agrégés et besoins de qualification. Ne classe ni ne compare les personnes.',
      'hr:read',
      emptyParameters,
      (_args, context) => ({
        ok: true,
        data: {
          required: context.staff.required,
          present: context.staff.present,
          absentCount: context.staff.absentToday.length,
          expiringQualificationCount: context.staff.expiringQualifications.length,
        },
        sources: [{ label: 'Disponibilité du personnel', href: '/personnel' }],
      }),
    ),
    get_operator_production: defineTool(
      'get_operator_production',
      "Retourne la production, les rebuts et les arrêts machine du jour, par opérateur, dans le périmètre autorisé. Chaque opérateur est désigné par un alias temporaire (OPERATOR_A, OPERATOR_B…) : aucun nom, prénom ni matricule n'est jamais renvoyé. Utiliser pour comparer ou expliquer un écart de production entre personnes.",
      'hr:read',
      emptyParameters,
      async () => {
        if (!can(question.permissions, 'production:read')) {
          return { ok: false, error: 'forbidden', sources: [] };
        }
        // Sans correspondance d'alias (ex. fournisseur de démonstration, qui
        // n'appelle pas cet outil), on refuse plutôt que de risquer de
        // renvoyer un identifiant salarié en clair.
        if (!privacy) {
          return { ok: false, error: 'unknown_tool', sources: [] };
        }

        const summaries = await getOperatorProductionToday(question.workshopId ?? undefined);
        const data = summaries
          .map((summary) => {
            const alias = privacy.aliasFor(summary.employeeId);
            if (!alias) return null;
            return {
              operator: alias,
              workshop: summary.workshopName,
              shift: summary.shift,
              machines: summary.machineCodes,
              goodUnits: summary.goodUnits,
              rejectedUnits: summary.rejectedUnits,
              downtimeMinutes: summary.downtimeMinutes,
              scrapRatePct: summary.scrapRatePct,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        return {
          ok: true,
          data,
          sources: [{ label: 'Production par opérateur (pseudonymisée)', href: '/personnel' }],
          missingData:
            data.length === 0
              ? ["Aucune session de production n'est journalisée aujourd'hui dans ce périmètre."]
              : undefined,
        };
      },
    ),
    get_production_costs: defineTool(
      'get_production_costs',
      'Retourne les coûts horaires machines et impacts financiers ouverts disponibles. Strictement réservé à finance:read.',
      'finance:read',
      emptyParameters,
      (_args, context) => ({
        ok: true,
        data: {
          machines: context.machines.map((machine) => ({
            id: machine.id,
            code: machine.code,
            hourlyCostCents: machine.hourlyCostCents,
            downtimeMinutes: machine.downtimeMinutes,
          })),
          openAlertImpactCents: context.alerts.reduce((sum, alert) => sum + alert.impactCents, 0),
        },
        sources: [
          { label: 'Coûts de production', href: '/analyse' },
          { label: 'Centre d’alertes', href: '/alertes' },
        ],
      }),
    ),
  };
}

export type AiToolRegistry = {
  definitions: FunctionTool[];
  execute: (name: string, rawArguments: string) => Promise<AiToolResult>;
};

export function createAiToolRegistry(
  question: AiQuestion,
  loadContext: () => Promise<FactoryContext> = getFactoryContext,
  privacy?: AliasMap,
): AiToolRegistry {
  const specs = buildToolSpecs(question, privacy);
  const allowed = Object.values(specs).filter((spec) => can(question.permissions, spec.permission));
  let contextPromise: Promise<FactoryContext> | undefined;
  const getScopedContext = () => {
    contextPromise ??= loadContext().then((context) => scopeFactoryContext(context, question));
    return contextPromise;
  };

  return {
    definitions: allowed.map((spec) => spec.definition),
    async execute(name, rawArguments) {
      const spec = specs[name as ToolName];
      if (!spec) return { ok: false, error: 'unknown_tool', sources: [] };
      if (!can(question.permissions, spec.permission)) {
        return { ok: false, error: 'forbidden', sources: [] };
      }

      let args: unknown;
      try {
        args = JSON.parse(rawArguments);
      } catch {
        return { ok: false, error: 'invalid_arguments', sources: [] };
      }
      return spec.execute(args, await getScopedContext());
    },
  };
}
