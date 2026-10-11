import 'server-only';

import { desc, ilike, or } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import {
  getFactoryContext,
  type FactoryContext,
  type InventorySnapshot,
  type MachineSnapshot,
  type OrderSnapshot,
  type WorkshopSnapshot,
} from '../services/factory-context';
import { formatCents, formatDuration, formatNumber, formatPercent, formatSince } from '@/lib/format';
import type { AiAnswer, AiFact, AiProvider, AiQuestion } from './types';
import { scopeFactoryContext } from './tools';
import { can, type PermissionCode } from '../domain/permissions';

/**
 * Fournisseur de démonstration.
 *
 * Il ne s'agit PAS d'un faux chatbot : il raisonne réellement sur le contexte
 * usine construit à partir de la base de données. Aucun chiffre n'est inventé,
 * chacun provient d'une donnée mesurée ou d'un calcul du domaine.
 *
 * Quand un fournisseur LLM sera branché, il recevra exactement le même
 * contexte et devra respecter le même contrat `AiAnswer`.
 */
export class DemoAiProvider implements AiProvider {
  readonly id = 'demo';
  readonly label = 'Moteur de démonstration (hors ligne)';

  isAvailable(): boolean {
    return true;
  }

  async answer(question: AiQuestion): Promise<AiAnswer> {
    const context = scopeFactoryContext(await getFactoryContext(), question);
    const intent = detectIntent(question.question);
    const requiredPermission: Record<typeof intent, PermissionCode> = {
      overview: 'dashboard:read',
      why_workshop: 'production:read',
      orders: 'orders:read',
      inventory: 'inventory:read',
      machines: 'machines:read',
      staffing: 'hr:read',
      financial: 'finance:read',
      memory: 'history:read',
    };
    if (!can(question.permissions, requiredPermission[intent])) {
      return {
        question: question.question,
        summary: "Vous n'avez pas l'autorisation de consulter ces données dans KS Plastico Demo.",
        severity: 'info',
        facts: [],
        confidence: 1,
        sources: ['Permissions KS Plastico Demo'],
        provider: this.id,
      };
    }

    switch (intent) {
      case 'why_workshop':
        return this.explainWorkshop(question, context);
      case 'orders':
        return this.explainOrders(question, context);
      case 'inventory':
        return this.explainInventory(question, context);
      case 'machines':
        return this.explainMachines(question, context);
      case 'staffing':
        return this.explainStaffing(question, context);
      case 'financial':
        return this.explainFinancial(question, context);
      case 'memory':
        return this.searchMemory(question, context);
      default:
        return this.explainOverview(question, context);
    }
  }

  /* ───────────────────────────────────── Comment va mon usine ? ──────── */

  private explainOverview(question: AiQuestion, context: FactoryContext): AiAnswer {
    const belowTarget = context.workshops.filter((workshop) => workshop.achievementPct < 95);
    const ordersAtRisk = context.orders.filter((order) => order.riskPct >= 20);
    const shortages = context.inventory.filter(
      (item) => item.shortageInDays !== null && item.shortageInDays <= 3,
    );
    const downMachines = context.machines.filter((machine) => machine.severity === 'critical');

    const sentences = [
      `Situation générale : ${context.health.global}/100.`,
      `Production à ${formatPercent(context.production.achievementPct)} de l'objectif du jour.`,
    ];
    if (belowTarget.length > 0) {
      sentences.push(
        `${belowTarget.length} atelier${belowTarget.length > 1 ? 's sont' : ' est'} sous son objectif (${belowTarget
          .map((workshop) => `${workshop.name} à ${workshop.achievementPct} %`)
          .join(', ')}).`,
      );
    }
    if (ordersAtRisk.length > 0) {
      sentences.push(
        `${ordersAtRisk.length} commande${ordersAtRisk.length > 1 ? 's présentent' : ' présente'} un risque de retard.`,
      );
    }
    if (shortages.length > 0) {
      sentences.push(
        `Une rupture est probable sur ${shortages.map((item) => item.name.toLowerCase()).join(', ')} sous 72 heures.`,
      );
    }
    if (downMachines.length > 0) {
      const worst = downMachines[0];
      sentences.push(
        `Le principal problème concerne ${worst.workshopName.toLowerCase()} : ${worst.name} est à l'arrêt depuis ${formatSince(worst.statusSince, context.capturedAt).replace('il y a ', '')}.`,
      );
    }

    const facts: AiFact[] = [
      {
        label: "Santé de l'usine",
        value: `${context.health.global}/100`,
        origin: 'computed',
        severity: context.healthSeverity,
      },
      {
        label: 'Production du jour',
        value: `${formatNumber(context.production.producedUnits)} / ${formatNumber(context.production.targetUnits)} pièces`,
        origin: 'measured',
      },
      {
        label: 'Machines à l’arrêt',
        value: `${downMachines.length} sur ${context.machines.length}`,
        origin: 'measured',
        severity: downMachines.length > 0 ? 'critical' : 'normal',
        href: '/machines',
      },
      {
        label: 'Commandes à risque',
        value: `${ordersAtRisk.length} sur ${context.orders.length}`,
        origin: 'computed',
        severity: ordersAtRisk.length > 0 ? 'warning' : 'normal',
        href: '/commandes',
      },
    ];

    if (question.canSeeFinancials) {
      const impact = context.alerts.reduce((total, alert) => total + alert.impactCents, 0);
      facts.push({
        label: 'Impact estimé des problèmes ouverts',
        value: formatCents(impact),
        origin: 'estimated',
        severity: impact > 0 ? 'warning' : 'normal',
      });
    }

    return {
      question: question.question,
      summary: sentences.join(' '),
      severity: context.healthSeverity,
      facts,
      actions: [
        { label: 'Ouvrir le centre d’alertes', href: '/alertes' },
        { label: 'Voir la production par atelier', href: '/production' },
      ],
      confidence: resolveConfidence('aggregate'),
      sources: ['Score de santé', 'Ordres de fabrication du jour', 'Événements machine', 'Stocks'],
      provider: this.id,
    };
  }

  /* ─────────────────────────────────────────── Pourquoi 72 % ? ────────── */

  private explainWorkshop(question: AiQuestion, context: FactoryContext): AiAnswer {
    const q = question.question.toLowerCase();
    const mentioned = findMentionedWorkshop(question.question, context.workshops, question.history);

    if (!mentioned && /classement|meilleur|pire|quels? (sont les )?ateliers?/.test(q)) {
      return this.listWorkshopsRanking(question, context);
    }

    const worst = [...context.workshops].sort((a, b) => a.achievementPct - b.achievementPct)[0];
    const workshop = mentioned?.entity ?? worst;
    const guessed = mentioned ? '' : ' (aucun atelier n’était précisé — voici celui le plus en retrait)';

    const machines = context.machines.filter((machine) => machine.workshopId === workshop.id);
    const downtimeMinutes = machines.reduce((total, machine) => total + machine.downtimeMinutes, 0);
    const setupMinutes = machines
      .filter((machine) => machine.status === 'setup' || machine.status === 'mold_change')
      .reduce(
        (total, machine) =>
          total + Math.round((context.capturedAt.getTime() - machine.statusSince.getTime()) / 60_000),
        0,
      );
    const missingUnits = Math.max(workshop.targetUnits - workshop.producedUnits, 0);
    const absentInWorkshop = context.staff.absentToday.filter(
      (absence) => absence.workshopName === workshop.name,
    ).length;

    // Chaque cause est pondérée par le temps réellement perdu qu'elle représente.
    const causes = [
      { label: 'Arrêts machines', minutes: downtimeMinutes },
      { label: 'Changements de série et réglages', minutes: setupMinutes },
      { label: 'Manque de personnel', minutes: absentInWorkshop * 420 },
    ].filter((cause) => cause.minutes > 0);

    const totalCauseMinutes = causes.reduce((total, cause) => total + cause.minutes, 0);
    const breakdown = causes.map((cause) => ({
      label: cause.label,
      pct: totalCauseMinutes > 0 ? Math.round((cause.minutes / totalCauseMinutes) * 100) : 0,
      detail: formatDuration(cause.minutes),
    }));

    return {
      question: question.question,
      summary:
        workshop.achievementPct >= 95
          ? `${workshop.name} est à ${workshop.achievementPct} % de son objectif${guessed} : aucun écart significatif à expliquer.`
          : `${workshop.name} est à ${workshop.achievementPct} % de son objectif${guessed}, soit ${formatNumber(missingUnits)} pièces manquantes. ${
              causes.length > 0
                ? `L'écart s'explique principalement par ${causes[0].label.toLowerCase()} (${formatDuration(causes[0].minutes)} perdues).`
                : "Aucun événement machine n'explique l'écart : la cadence réelle est inférieure à la cadence théorique."
            }`,
      severity: workshop.severity,
      facts: [
        {
          label: 'Réalisation',
          value: `${formatNumber(workshop.producedUnits)} / ${formatNumber(workshop.targetUnits)} pièces (${workshop.achievementPct} %)`,
          origin: 'measured',
          severity: workshop.severity,
        },
        {
          label: 'Arrêts cumulés',
          value: formatDuration(downtimeMinutes),
          origin: 'measured',
          severity: downtimeMinutes > 60 ? 'warning' : 'normal',
        },
        {
          label: 'Machines de l’atelier',
          value: `${workshop.machinesTotal - workshop.machinesDown} en service sur ${workshop.machinesTotal}`,
          origin: 'measured',
          href: '/machines',
        },
      ],
      breakdown: breakdown.length > 0 ? breakdown : undefined,
      actions: [{ label: 'Voir les machines concernées', href: '/machines' }],
      confidence: resolveConfidence(mentioned?.resolution ?? 'fallback'),
      sources: ['Événements machine du jour', 'Ordres de fabrication', 'Absences'],
      provider: this.id,
    };
  }

  /** « Quel atelier a la meilleure performance ? », « classement des ateliers » */
  private listWorkshopsRanking(question: AiQuestion, context: FactoryContext): AiAnswer {
    const sorted = [...context.workshops].sort((a, b) => b.achievementPct - a.achievementPct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    return {
      question: question.question,
      summary:
        sorted.length === 0
          ? 'Aucun atelier configuré.'
          : `Classement des ateliers par réalisation du jour : ${sorted
              .map((workshop) => `${workshop.name} (${workshop.achievementPct} %)`)
              .join(', ')}.${
              worst && best && worst.id !== best.id
                ? ` ${best.name} est en tête, ${worst.name} le plus en retrait.`
                : ''
            }`,
      severity: worst && worst.achievementPct < 85 ? 'warning' : 'normal',
      facts: sorted.map<AiFact>((workshop) => ({
        label: workshop.name,
        value: `${workshop.achievementPct} %`,
        origin: 'measured',
        severity: workshop.severity,
        href: '/production',
      })),
      actions: [{ label: 'Voir la production par atelier', href: '/production' }],
      confidence: resolveConfidence('aggregate'),
      sources: ['Réalisation du jour par atelier'],
      provider: this.id,
    };
  }

  /* ──────────────────────────────────────────────── Commandes ─────────── */

  private explainOrders(question: AiQuestion, context: FactoryContext): AiAnswer {
    const q = question.question.toLowerCase();
    const mentioned = findMentionedOrder(q, context.orders, question.history);

    if (!mentioned && /quelles?|liste|combien/.test(q)) {
      return this.listOrdersAtRisk(question, context, /retard/.test(q));
    }

    const atRisk = [...context.orders].filter((order) => order.riskPct >= 10).sort((a, b) => b.riskPct - a.riskPct);
    const focus = mentioned?.entity ?? atRisk[0];

    if (!focus) {
      return {
        question: question.question,
        summary: `Les ${context.orders.length} commandes actives sont dans les délais.`,
        severity: 'normal',
        facts: [],
        confidence: resolveConfidence('aggregate'),
        sources: ['Commandes actives', 'Capacité machine'],
        provider: this.id,
      };
    }

    const guessed = mentioned
      ? ''
      : ' (aucune commande n’était précisée — voici celle qui présente le plus de risque)';

    return {
      question: question.question,
      summary: `La commande #${focus.number} (${focus.customerName}) présente un risque de retard de ${focus.riskPct} %${guessed}. ${focus.riskReasons[0]} Elle est couverte à ${focus.progressPct} % (${focus.palletsReady}/${focus.palletsRequired} palettes).`,
      severity: focus.severity,
      facts: [
        {
          label: 'Risque de retard',
          value: formatPercent(focus.riskPct),
          origin: 'estimated',
          severity: focus.severity,
        },
        {
          label: 'Avancement',
          value: `${formatNumber(focus.coveredUnits)} / ${formatNumber(focus.quantityUnits)} pièces`,
          origin: 'measured',
        },
        {
          label: 'Palettes prêtes',
          value: `${focus.palletsReady} / ${focus.palletsRequired}`,
          origin: 'measured',
        },
        {
          label: 'Reste à produire',
          value: `${formatNumber(focus.remainingUnits)} pièces`,
          origin: 'computed',
        },
      ],
      breakdown: undefined,
      actions: [
        { label: `Ouvrir la commande #${focus.number}`, href: `/commandes/${focus.id}` },
        { label: 'Voir le planning', href: '/planning' },
      ],
      confidence: resolveConfidence(mentioned?.resolution ?? 'fallback'),
      sources: ['Lignes de commande', 'Réservations de stock', 'Capacité machine restante'],
      provider: this.id,
    };
  }

  /** « Quelles commandes sont en retard / à risque ? » */
  private listOrdersAtRisk(question: AiQuestion, context: FactoryContext, lateOnly: boolean): AiAnswer {
    const matches = [...context.orders]
      .filter((order) => (lateOnly ? order.isLate || order.riskPct >= 20 : order.riskPct >= 10))
      .sort((a, b) => b.riskPct - a.riskPct);
    const label = lateOnly ? 'en retard ou fortement à risque' : 'à risque de retard';

    return {
      question: question.question,
      summary:
        matches.length === 0
          ? `Aucune commande ${label} : les ${context.orders.length} commandes actives sont dans les délais.`
          : `${matches.length} commande${matches.length > 1 ? 's sont' : ' est'} ${label} : ${matches
              .map((order) => `#${order.number} (${order.customerName}, ${order.riskPct} %)`)
              .join(', ')}.`,
      severity: matches.length > 0 ? 'warning' : 'normal',
      facts: matches.slice(0, 8).map<AiFact>((order) => ({
        label: `#${order.number}`,
        value: `${order.customerName} — ${order.riskPct} % de risque`,
        origin: 'estimated',
        severity: order.severity,
        href: `/commandes/${order.id}`,
      })),
      actions: [{ label: 'Ouvrir les commandes', href: '/commandes' }],
      confidence: resolveConfidence('aggregate'),
      sources: ['Commandes actives', 'Capacité machine restante'],
      provider: this.id,
    };
  }

  /* ────────────────────────────────────────────────── Stocks ──────────── */

  private explainInventory(question: AiQuestion, context: FactoryContext): AiAnswer {
    const q = question.question.toLowerCase();
    const mentioned = findMentionedInventoryItem(q, context.inventory, question.history);

    if (!mentioned && /quels?|liste|combien/.test(q)) {
      return this.listInventoryAtRisk(question, context);
    }

    const risky = [...context.inventory]
      .filter((item) => item.shortageInDays !== null || item.quantityOnHand <= item.reorderPoint)
      .sort((a, b) => (a.shortageInDays ?? 99) - (b.shortageInDays ?? 99));
    const mentionsPallets = /palette/.test(q);
    const pool = mentionsPallets ? risky.filter((item) => item.kind === 'pallet') : risky;
    const focus = mentioned?.entity ?? pool[0] ?? risky[0];

    if (!focus) {
      return {
        question: question.question,
        summary: 'Aucun article n’est sous son point de commande et aucune rupture n’est projetée sur 7 jours.',
        severity: 'normal',
        facts: [],
        confidence: resolveConfidence('aggregate'),
        sources: ['Stocks', 'Consommations moyennes'],
        provider: this.id,
      };
    }

    const guessed = mentioned ? '' : ' (aucun article précis n’était demandé — voici le plus critique)';

    return {
      question: question.question,
      summary:
        focus.shortageInDays !== null
          ? `${focus.name} : ${formatNumber(focus.quantityOnHand)} ${focus.unit}(s) en stock pour une consommation de ${formatNumber(focus.averageDailyConsumption)} par jour. La rupture est projetée dans ${focus.shortageInDays} jour${focus.shortageInDays > 1 ? 's' : ''}${guessed}.`
          : `${focus.name} est sous son point de commande (${formatNumber(focus.quantityOnHand)} pour un seuil de ${formatNumber(focus.reorderPoint)}), sans rupture projetée à 7 jours${guessed}.`,
      severity: focus.severity,
      facts: [
        { label: 'Stock physique', value: `${formatNumber(focus.quantityOnHand)} ${focus.unit}`, origin: 'measured' },
        { label: 'Réservé', value: `${formatNumber(focus.quantityReserved)} ${focus.unit}`, origin: 'measured' },
        { label: 'Disponible', value: `${formatNumber(focus.available)} ${focus.unit}`, origin: 'computed' },
        {
          label: 'Couverture',
          value: focus.coverageDays >= 999 ? 'illimitée' : `${focus.coverageDays} jours`,
          origin: 'forecast',
          severity: focus.severity,
        },
      ],
      actions: [{ label: 'Ouvrir les stocks', href: '/stocks' }],
      confidence: resolveConfidence(mentioned?.resolution ?? 'fallback'),
      sources: ['Stock physique', 'Réservations actives', 'Consommation moyenne journalière'],
      provider: this.id,
    };
  }

  /** « Quels articles sont sous le seuil / en rupture ? » */
  private listInventoryAtRisk(question: AiQuestion, context: FactoryContext): AiAnswer {
    const matches = [...context.inventory]
      .filter((item) => item.shortageInDays !== null || item.quantityOnHand <= item.reorderPoint)
      .sort((a, b) => (a.shortageInDays ?? 99) - (b.shortageInDays ?? 99));

    return {
      question: question.question,
      summary:
        matches.length === 0
          ? 'Aucun article n’est sous son point de commande et aucune rupture n’est projetée sur 7 jours.'
          : `${matches.length} article${matches.length > 1 ? 's sont' : ' est'} sous surveillance : ${matches
              .map((item) =>
                item.shortageInDays !== null
                  ? `${item.name} (rupture dans ${item.shortageInDays} j)`
                  : `${item.name} (sous le seuil)`,
              )
              .join(', ')}.`,
      severity: matches.length > 0 ? 'warning' : 'normal',
      facts: matches.slice(0, 8).map<AiFact>((item) => ({
        label: item.name,
        value: item.shortageInDays !== null ? `Rupture dans ${item.shortageInDays} j` : 'Sous le seuil',
        origin: 'forecast',
        severity: item.severity,
        href: '/stocks',
      })),
      actions: [{ label: 'Ouvrir les stocks', href: '/stocks' }],
      confidence: resolveConfidence('aggregate'),
      sources: ['Stocks', 'Consommations moyennes'],
      provider: this.id,
    };
  }

  /* ───────────────────────────────────────────────── Machines ─────────── */

  /**
   * Question machine : trois formes distinctes cohabitent ici — « quelles
   * machines sont en production » (liste), « que produit la presse X »
   * (référence en cours) et « changement de moule » (planning). Router
   * chacune vers son propre gabarit plutôt que de tout ramener à « décrire
   * une presse » est ce qui manquait pour répondre correctement (§40).
   */
  private explainMachines(question: AiQuestion, context: FactoryContext): AiAnswer {
    const q = question.question.toLowerCase();
    const mentioned = findMentionedMachine(q, context.machines, question.history);

    if (/moule/.test(q) && /(changement|prochain|prévu|prevu|quand)/.test(q)) {
      return this.explainMoldChange(question, context, mentioned);
    }

    if (mentioned && /produ(it|is|ction)|référence|reference|pi[eè]ce|fabrique/.test(q)) {
      return this.explainWhatMachineProduces(question, context, mentioned);
    }

    if (!mentioned) {
      const statusQuery = MACHINE_STATUS_QUERIES.find((entry) => entry.pattern.test(q));
      if (statusQuery || /quelles? (machines?|presses?)|combien de (machines?|presses?)|liste des (machines?|presses?)/.test(q)) {
        return this.listMachinesByStatus(question, context, statusQuery?.status ?? null);
      }
    }

    const problematic = [...context.machines].sort(
      (a, b) => b.downtimeMinutes - a.downtimeMinutes,
    )[0];
    const critical = context.machines.find((m) => m.severity === 'critical');
    const focus = mentioned?.entity ?? critical ?? problematic;
    // Aucune presse n'était citée : la réponse porte sur celle qui pose le
    // plus de problème actuellement — le dire évite de laisser croire que
    // « la presse dont on parle » était une évidence.
    const guessed = mentioned
      ? ''
      : ' (aucune presse n’était précisée — voici celle qui pose le plus de problème actuellement)';

    return {
      question: question.question,
      summary: `${focus.name} (${focus.workshopName}) est en état « ${statusLabel(focus.status)} » depuis ${formatSince(focus.statusSince, context.capturedAt).replace('il y a ', '')}${focus.reason ? ` — ${focus.reason}` : ''}${guessed}. Elle cumule ${formatDuration(focus.downtimeMinutes)} d'arrêt aujourd'hui pour un TRS de ${formatPercent(focus.oeePct, 1)}.`,
      severity: focus.severity,
      facts: [
        { label: 'État', value: statusLabel(focus.status), origin: 'measured', severity: focus.severity },
        { label: 'Arrêts du jour', value: formatDuration(focus.downtimeMinutes), origin: 'measured' },
        { label: 'TRS', value: formatPercent(focus.oeePct, 1), origin: 'computed' },
        {
          label: 'Production du jour',
          value: `${formatNumber(focus.producedUnits)} pièces`,
          origin: 'measured',
        },
      ],
      actions: [{ label: `Ouvrir ${focus.name}`, href: `/machines/${focus.id}` }],
      confidence: resolveConfidence(mentioned?.resolution ?? 'fallback'),
      sources: ['Événements machine', 'Ordres de fabrication du jour'],
      provider: this.id,
    };
  }

  /** « Quelles machines sont en production / à l'arrêt / disponibles… ? » */
  private listMachinesByStatus(
    question: AiQuestion,
    context: FactoryContext,
    status: string | null,
  ): AiAnswer {
    const matches = status ? context.machines.filter((machine) => machine.status === status) : context.machines;
    const label = status ? statusLabel(status) : 'toutes confondues';
    const concerning = status === 'stopped' || status === 'fault';

    return {
      question: question.question,
      summary:
        matches.length === 0
          ? `Aucune machine n'est actuellement « ${label} ».`
          : `${matches.length} machine${matches.length > 1 ? 's sont' : ' est'} actuellement « ${label} » : ${matches
              .map((machine) => machine.name)
              .join(', ')}.`,
      severity: matches.length > 0 && concerning ? 'warning' : 'normal',
      facts: matches.slice(0, 8).map<AiFact>((machine) => ({
        label: machine.name,
        value: machine.currentProductName ?? statusLabel(machine.status),
        origin: 'measured',
        severity: machine.severity,
        href: `/machines/${machine.id}`,
      })),
      actions: [{ label: 'Ouvrir le parc machines', href: '/machines' }],
      confidence: resolveConfidence('aggregate'),
      sources: ['État des machines'],
      provider: this.id,
    };
  }

  /** « Que produit la presse X ? » */
  private explainWhatMachineProduces(
    question: AiQuestion,
    context: FactoryContext,
    match: EntityMatch<MachineSnapshot>,
  ): AiAnswer {
    const machine = match.entity;
    const producing = machine.currentProductName !== null;
    // « en production » sans référence rattachée arrive quand l'état machine a
    // changé sans qu'un ordre de fabrication du jour ne lui soit associé —
    // une chose différente d'une presse réellement à l'arrêt (§40 : ne jamais
    // reformuler une absence de donnée en fait qu'elle ne dit pas).
    const runningWithoutOrder = !producing && machine.status === 'production';

    return {
      question: question.question,
      summary: producing
        ? `${machine.name} produit actuellement ${machine.currentProductName} — ordre ${machine.currentOrderNumber}.`
        : runningWithoutOrder
          ? `${machine.name} est en production, mais aucun ordre de fabrication du jour ne lui est rattaché.`
          : `${machine.name} ne produit rien actuellement (${statusLabel(machine.status)}).`,
      severity: machine.severity,
      facts: [
        {
          label: 'Référence en cours',
          value: machine.currentProductName ?? 'Aucune',
          origin: 'measured',
          severity: machine.severity,
        },
        machine.currentOrderNumber
          ? {
              label: 'Ordre de fabrication',
              value: machine.currentOrderNumber,
              origin: 'measured',
              href: `/machines/${machine.id}/production`,
            }
          : { label: 'État', value: statusLabel(machine.status), origin: 'measured', severity: machine.severity },
      ],
      actions: [{ label: `Ouvrir ${machine.name}`, href: `/machines/${machine.id}/production` }],
      confidence: resolveConfidence(match.resolution),
      sources: ['Ordres de fabrication en cours'],
      provider: this.id,
    };
  }

  /** « Dans combien de temps est prévu le changement de moule de la presse X ? » */
  private explainMoldChange(
    question: AiQuestion,
    context: FactoryContext,
    match: EntityMatch<MachineSnapshot> | null,
  ): AiAnswer {
    if (!match) {
      const upcoming = context.machines
        .filter((candidate) => candidate.nextMoldChange !== null)
        .sort((a, b) => a.nextMoldChange!.at.getTime() - b.nextMoldChange!.at.getTime())
        .slice(0, 5);

      return {
        question: question.question,
        summary:
          upcoming.length === 0
            ? "Aucun changement de moule n'est planifié sur le parc pour le moment."
            : `${upcoming.length} changement${upcoming.length > 1 ? 's de moule sont' : ' de moule est'} planifié${upcoming.length > 1 ? 's' : ''} : ${upcoming
                .map(
                  (candidate) =>
                    `${candidate.name} ${formatTimeUntil(candidate.nextMoldChange!.at, context.capturedAt)}`,
                )
                .join(', ')}.`,
        severity: 'info',
        facts: upcoming.map<AiFact>((candidate) => ({
          label: candidate.name,
          value: `${candidate.nextMoldChange!.toMoldReference} — ${formatTimeUntil(candidate.nextMoldChange!.at, context.capturedAt)}`,
          origin: 'measured',
          href: `/machines/${candidate.id}`,
        })),
        actions: [{ label: 'Ouvrir le planning', href: '/planning' }],
        confidence: resolveConfidence('aggregate'),
        sources: ['Ordres de fabrication planifiés', 'Moule monté par presse'],
        provider: this.id,
      };
    }

    const machine = match.entity;
    const change = machine.nextMoldChange;

    return {
      question: question.question,
      summary: change
        ? `Le prochain changement de moule sur ${machine.name} est prévu ${formatTimeUntil(change.at, context.capturedAt)}, pour l’ordre ${change.productionOrderNumber}${
            change.fromMoldReference
              ? ` — passage de ${change.fromMoldReference} à ${change.toMoldReference}`
              : ` — montage de ${change.toMoldReference}`
          }.`
        : `Aucun changement de moule n'est planifié sur ${machine.name} pour le moment${
            machine.currentMoldReference ? ` (moule actuellement monté : ${machine.currentMoldReference})` : ''
          }.`,
      severity: 'info',
      facts: [
        machine.currentMoldReference
          ? { label: 'Moule actuellement monté', value: machine.currentMoldReference, origin: 'measured' }
          : { label: 'Moule actuellement monté', value: 'Non renseigné', origin: 'measured' },
        change
          ? { label: 'Prochain changement', value: formatTimeUntil(change.at, context.capturedAt), origin: 'measured' }
          : { label: 'Prochain changement', value: 'Aucun planifié', origin: 'measured' },
      ],
      actions: [{ label: `Ouvrir ${machine.name}`, href: `/machines/${machine.id}` }],
      confidence: resolveConfidence(match.resolution, change !== null || machine.currentMoldReference !== null),
      sources: ['Ordres de fabrication planifiés', 'Moule monté par presse'],
      provider: this.id,
    };
  }

  /* ──────────────────────────────────────────────── Personnel ─────────── */

  private explainStaffing(question: AiQuestion, context: FactoryContext): AiAnswer {
    const q = question.question.toLowerCase();
    // Une personne précise citée par son nom complet passe avant le résumé
    // d'ensemble — « Marie Dupont est-elle présente ? » n'a jamais eu de
    // réponse directe jusqu'ici, seulement la liste globale des absences.
    const person = context.staff.roster.find((candidate) => q.includes(candidate.fullName.toLowerCase()));
    if (person) return this.explainOnePerson(question, context, person);

    const absent = context.staff.absentToday;
    const expiring = context.staff.expiringQualifications;

    return {
      question: question.question,
      summary: `${context.staff.present} personnes présentes sur ${context.staff.required}. ${
        absent.length > 0
          ? `Absences du jour : ${absent.map((p) => `${p.fullName} (${p.reason ?? 'motif non précisé'})`).join(', ')}.`
          : 'Aucune absence déclarée.'
      }${expiring.length > 0 ? ` ${expiring.length} habilitation(s) à renouveler, la plus urgente dans ${expiring[0].daysRemaining} jours.` : ''}`,
      severity: absent.length > 0 || expiring.length > 0 ? 'warning' : 'normal',
      facts: [
        {
          label: 'Effectif présent',
          value: `${context.staff.present} / ${context.staff.required}`,
          origin: 'measured',
        },
        ...expiring.slice(0, 3).map<AiFact>((qualification) => ({
          label: qualification.label,
          value: `${qualification.fullName} — ${qualification.status === 'expired' ? 'expirée' : `expire dans ${qualification.daysRemaining} jours`}`,
          origin: 'measured',
          severity: qualification.status === 'expired' ? 'critical' : 'info',
        })),
      ],
      actions: [{ label: 'Ouvrir le personnel', href: '/personnel' }],
      confidence: resolveConfidence('aggregate'),
      sources: ['Fiches salariés', 'Absences en cours', 'Habilitations'],
      provider: this.id,
    };
  }

  /** « Marie Dupont est-elle présente ? » */
  private explainOnePerson(
    question: AiQuestion,
    context: FactoryContext,
    person: FactoryContext['staff']['roster'][number],
  ): AiAnswer {
    const absence = context.staff.absentToday.find((entry) => entry.fullName === person.fullName);
    const qualification = context.staff.expiringQualifications.find(
      (entry) => entry.fullName === person.fullName,
    );

    return {
      question: question.question,
      summary: person.isAbsent
        ? `${person.fullName} est absent(e) aujourd'hui${absence?.reason ? ` — ${absence.reason}` : ''}.`
        : `${person.fullName} est présent(e) aujourd'hui${person.workshopName ? ` (${person.workshopName})` : ''}.${
            qualification
              ? ` Attention : ${qualification.label} ${qualification.status === 'expired' ? 'a expiré' : `expire dans ${qualification.daysRemaining} jours`}.`
              : ''
          }`,
      severity: person.isAbsent ? 'warning' : qualification ? 'info' : 'normal',
      facts: [
        {
          label: 'Présence du jour',
          value: person.isAbsent ? 'Absent(e)' : 'Présent(e)',
          origin: 'measured',
          severity: person.isAbsent ? 'warning' : 'normal',
        },
        ...(qualification
          ? [
              {
                label: qualification.label,
                value:
                  qualification.status === 'expired' ? 'Expirée' : `Expire dans ${qualification.daysRemaining} j`,
                origin: 'measured' as const,
                severity: (qualification.status === 'expired' ? 'critical' : 'info') as AiFact['severity'],
              },
            ]
          : []),
      ],
      actions: [{ label: 'Ouvrir le personnel', href: '/personnel' }],
      confidence: resolveConfidence('direct'),
      sources: ['Fiches salariés', 'Absences en cours', 'Habilitations'],
      provider: this.id,
    };
  }

  /* ──────────────────────────────────────── Impact financier ──────────── */

  private explainFinancial(question: AiQuestion, context: FactoryContext): AiAnswer {
    if (!question.canSeeFinancials) {
      return {
        question: question.question,
        summary:
          "Les données financières ne sont pas accessibles avec votre rôle. Rapprochez-vous de la direction ou du responsable de production.",
        severity: 'info',
        facts: [],
        confidence: 1,
        sources: ['Contrôle des permissions'],
        provider: this.id,
      };
    }

    const total = context.alerts.reduce((sum, alert) => sum + alert.impactCents, 0);
    const sorted = [...context.alerts].sort((a, b) => b.impactCents - a.impactCents);

    return {
      question: question.question,
      summary: `Les problèmes ouverts représentent un impact estimé de ${formatCents(total)}. Le poste le plus lourd est « ${sorted[0]?.title ?? 'aucun' } » pour ${formatCents(sorted[0]?.impactCents ?? 0)}.`,
      severity: total > 500_000 ? 'warning' : 'info',
      facts: sorted.slice(0, 4).map<AiFact>((alert) => ({
        label: alert.title,
        value: formatCents(alert.impactCents),
        origin: 'estimated',
        severity: alert.severity,
        href: '/alertes',
      })),
      actions: [{ label: 'Ouvrir le centre d’alertes', href: '/alertes' }],
      confidence: resolveConfidence('aggregate', sorted.length > 0),
      sources: ['Alertes ouvertes', 'Modèle de coût standard 2026'],
      provider: this.id,
    };
  }

  /* ──────────────────────────────────── Mémoire de l'usine (§35) ──────── */

  private async searchMemory(question: AiQuestion, context: FactoryContext): Promise<AiAnswer> {
    const db = await getDb();
    const keywords = extractKeywords(question.question);

    const matches =
      keywords.length > 0
        ? await db
            .select()
            .from(t.incidents)
            .where(
              or(
                ...keywords.flatMap((keyword) => [
                  ilike(t.incidents.title, `%${keyword}%`),
                  ilike(t.incidents.symptom, `%${keyword}%`),
                  ilike(t.incidents.rootCause, `%${keyword}%`),
                ]),
              ),
            )
            .orderBy(desc(t.incidents.occurredAt))
            .limit(4)
        : [];

    if (matches.length === 0) {
      return {
        question: question.question,
        summary:
          "Aucun incident comparable n'est enregistré dans la mémoire de l'usine. Déclarez cet incident pour qu'il puisse servir la prochaine fois.",
        severity: 'info',
        facts: [],
        actions: [{ label: 'Déclarer un incident', href: '/machines' }],
        confidence: 0.6,
        sources: ['Historique des incidents'],
        provider: this.id,
      };
    }

    const resolved = matches.find((incident) => incident.resolution) ?? matches[0];

    return {
      question: question.question,
      summary: `Oui. ${matches.length} incident${matches.length > 1 ? 's' : ''} comparable${matches.length > 1 ? 's ont' : ' a'} été enregistré${matches.length > 1 ? 's' : ''}. Le plus instructif est ${resolved.reference} (${formatSince(resolved.occurredAt, context.capturedAt)}) : ${resolved.rootCause ?? 'cause non documentée'}${resolved.resolution ? ` — solution appliquée : ${resolved.resolution}` : ''}`,
      severity: 'info',
      facts: matches.map<AiFact>((incident) => ({
        label: incident.reference,
        value: incident.title,
        origin: 'measured',
        severity: incident.severity as AiFact['severity'],
        href: '/historique',
      })),
      actions: [{ label: "Consulter l'historique", href: '/historique' }],
      confidence: 0.78,
      sources: ['Incidents historisés', 'Causes racines documentées'],
      provider: this.id,
    };
  }
}

/* ────────────────────────────────────────────────────── Détection ─────── */

type Intent =
  | 'overview'
  | 'why_workshop'
  | 'orders'
  | 'inventory'
  | 'machines'
  | 'staffing'
  | 'financial'
  | 'memory';

const STOP_WORDS = new Set([
  'avons',
  'nous',
  'déjà',
  'rencontré',
  'problème',
  'est-ce',
  'que',
  'cette',
  'ce',
  'la',
  'le',
  'les',
  'des',
  'une',
  'un',
  'sur',
  'dans',
  'pour',
  'avec',
  'quoi',
  'comment',
  'pourquoi',
  'combien',
  'arrive',
  'arrivé',
  'même',
  'sont',
  'était',
]);

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();

  if (/(déjà (vu|rencontré|arrivé)|incident (similaire|passé)|historiqu|par le passé|souviens)/.test(q))
    return 'memory';
  if (/pourquoi/.test(q) && /(atelier|production|objectif|%|pour cent)/.test(q)) return 'why_workshop';
  if (/(coût|cout|impact|euro|€|perte|rentab|marge)/.test(q)) return 'financial';
  if (/(palette|stock|rupture|matière|matiere|approvisionnement|caisse)/.test(q)) return 'inventory';
  if (/(commande|retard|livraison|délai|delai|#\d+)/.test(q)) return 'orders';
  if (/(presse|machine|arrêt|arret|trs|panne|défaut|defaut|moule)/.test(q)) return 'machines';
  if (/(personnel|opérateur|operateur|effectif|absence|habilitation|déplacer|deplacer|équipe|equipe)/.test(q))
    return 'staffing';
  if (/atelier|classement/.test(q)) return 'why_workshop';
  if (/pourquoi/.test(q)) return 'why_workshop';

  return 'overview';
}

function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôöùûüç0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
    .slice(0, 5);
}

function statusLabel(status: string): string {
  return (
    {
      production: 'en production',
      setup: 'en réglage',
      mold_change: 'en changement de moule',
      stopped: 'à l’arrêt',
      fault: 'en défaut',
      maintenance: 'en maintenance',
      idle: 'disponible',
    }[status] ?? status
  );
}

type EntityMatch<T> = { entity: T; resolution: 'direct' | 'history' };

/**
 * Trouve la presse citée dans la question, par nom ou par code (« PR-62 »,
 * « 62 »). À défaut, retombe sur la dernière presse citée dans la
 * conversation — sans quoi « et son TRS ? » après « que produit la presse
 * 62 ? » perdrait le fil que le panneau affiche pourtant à l'écran. Le mode
 * de résolution est renvoyé pour que la confiance affichée en tienne compte.
 */
function findMentionedMachine(
  lowercaseQuestion: string,
  machines: readonly MachineSnapshot[],
  history?: readonly { question: string }[],
): EntityMatch<MachineSnapshot> | null {
  const direct =
    machines.find((machine) => lowercaseQuestion.includes(machine.name.toLowerCase())) ??
    machines.find((machine) => lowercaseQuestion.includes(machine.code.toLowerCase()));
  if (direct) return { entity: direct, resolution: 'direct' };

  for (const turn of [...(history ?? [])].reverse()) {
    const q = turn.question.toLowerCase();
    const match =
      machines.find((machine) => q.includes(machine.name.toLowerCase())) ??
      machines.find((machine) => q.includes(machine.code.toLowerCase()));
    if (match) return { entity: match, resolution: 'history' };
  }

  return null;
}

/**
 * Trouve la commande citée dans la question — par numéro (« #5842 ») ou par
 * client (« la commande de Constructeur poids lourds 1 »). Même repli sur l'historique
 * que pour les machines.
 */
function findMentionedOrder(
  lowercaseQuestion: string,
  orders: readonly OrderSnapshot[],
  history?: readonly { question: string }[],
): EntityMatch<OrderSnapshot> | null {
  const direct =
    orders.find((order) => lowercaseQuestion.includes(order.number.toLowerCase())) ??
    orders.find((order) => lowercaseQuestion.includes(order.customerName.toLowerCase()));
  if (direct) return { entity: direct, resolution: 'direct' };

  for (const turn of [...(history ?? [])].reverse()) {
    const q = turn.question.toLowerCase();
    const match =
      orders.find((order) => q.includes(order.number.toLowerCase())) ??
      orders.find((order) => q.includes(order.customerName.toLowerCase()));
    if (match) return { entity: match, resolution: 'history' };
  }

  return null;
}

/**
 * Trouve l'article cité dans la question, par nom, ou par « palette » quand
 * un seul article de ce type existe (sinon ce n'est pas une identification
 * directe, seulement une famille — la confiance affichée le reflète).
 */
function findMentionedInventoryItem(
  lowercaseQuestion: string,
  inventory: readonly InventorySnapshot[],
  history?: readonly { question: string }[],
): EntityMatch<InventorySnapshot> | null {
  const byName = (q: string) => inventory.find((item) => q.includes(item.name.toLowerCase()));
  const byUniquePalletMention = (q: string) => {
    if (!/palette/.test(q)) return undefined;
    const pallets = inventory.filter((item) => item.kind === 'pallet');
    return pallets.length === 1 ? pallets[0] : undefined;
  };

  const direct = byName(lowercaseQuestion) ?? byUniquePalletMention(lowercaseQuestion);
  if (direct) return { entity: direct, resolution: 'direct' };

  for (const turn of [...(history ?? [])].reverse()) {
    const q = turn.question.toLowerCase();
    const match = byName(q) ?? byUniquePalletMention(q);
    if (match) return { entity: match, resolution: 'history' };
  }

  return null;
}

/**
 * Trouve l'atelier cité dans la question, par nom ou par « atelier B ».
 * Le code doit rester distinguable de la casse d'origine : un code sur une
 * seule lettre (« A ») en insensible à la casse capturerait aussi « atelier
 * a » comme dans « quel atelier a la meilleure performance » — le verbe, pas
 * l'atelier. D'où un texte original (non minuscule) pour cette vérification.
 */
function findMentionedWorkshop(
  originalQuestion: string,
  workshops: readonly WorkshopSnapshot[],
  history?: readonly { question: string }[],
): EntityMatch<WorkshopSnapshot> | null {
  const byNameOrCode = (text: string) =>
    workshops.find((workshop) => text.toLowerCase().includes(workshop.name.toLowerCase())) ??
    workshops.find((workshop) => new RegExp(`atelier\\s+${workshop.code}\\b`).test(text));

  const direct = byNameOrCode(originalQuestion);
  if (direct) return { entity: direct, resolution: 'direct' };

  for (const turn of [...(history ?? [])].reverse()) {
    const match = byNameOrCode(turn.question);
    if (match) return { entity: match, resolution: 'history' };
  }

  return null;
}

const MACHINE_STATUS_QUERIES: { status: string; pattern: RegExp }[] = [
  { status: 'production', pattern: /en production|qui produisent|qui tournent/ },
  { status: 'fault', pattern: /en (panne|défaut|defaut)/ },
  { status: 'stopped', pattern: /à l.arrêt|a l.arret|arrêtées|arretees/ },
  { status: 'setup', pattern: /en réglage|en reglage/ },
  { status: 'maintenance', pattern: /en maintenance/ },
  { status: 'mold_change', pattern: /en changement de moule/ },
  { status: 'idle', pattern: /disponibles?|libres?/ },
];

/**
 * Comment l'entité au centre de la réponse a été déterminée :
 *  - `direct`    : citée explicitement dans la question.
 *  - `history`   : retrouvée dans un tour précédent de la conversation.
 *  - `fallback`  : aucune n'était citée, une par défaut a été choisie —
 *                  la réponse doit alors le dire, pas le laisser deviner.
 *  - `aggregate` : la réponse porte sur un ensemble (liste, classement,
 *                  statistique globale), il n'y a rien à « deviner ».
 */
type EntityResolution = 'direct' | 'history' | 'fallback' | 'aggregate';

/**
 * Confiance calculée à partir de deux signaux réels — comment l'entité a été
 * choisie, et si les données mobilisées sont complètes — plutôt qu'une
 * constante choisie au gabarit. Une réponse devinée par défaut ne peut pas
 * afficher la même confiance qu'une réponse à une question précise (§40).
 */
function resolveConfidence(resolution: EntityResolution, dataComplete = true): number {
  const base: Record<EntityResolution, number> = {
    direct: 0.95,
    history: 0.87,
    fallback: 0.68,
    aggregate: 0.92,
  };
  const value = dataComplete ? base[resolution] : base[resolution] - 0.15;
  return Math.round(Math.max(value, 0.3) * 100) / 100;
}

/** « dans 6 h 30 », « dans 2 jours » — jamais un chiffre inventé, juste un écart réel formaté. */
function formatTimeUntil(at: Date, reference: Date): string {
  const ms = at.getTime() - reference.getTime();
  if (ms <= 0) return 'imminent';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 36 * 60) return `dans ${formatDuration(minutes)}`;
  const days = Math.round(minutes / 1_440);
  return `dans ${days} jour${days > 1 ? 's' : ''}`;
}
