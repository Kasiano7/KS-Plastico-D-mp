import { describe, expect, it } from 'vitest';
import { buildDailyReport, type DailyReportInput } from '../daily-report';

const FORMAT = {
  dateLong: () => 'lundi 31 août 2026',
  number: (value: number) => String(value),
  cents: (value: number) => `${value / 100} €`,
  duration: (minutes: number) => `${minutes} min`,
};

const BASE: DailyReportInput = {
  date: new Date('2026-08-31T05:00:00Z'),
  healthScore: 87,
  producedUnits: 8_870,
  targetUnits: 9_680,
  lateOrders: 3,
  machinesDown: 1,
  machinesTotal: 24,
  downtimeMinutes: 214,
  criticalAlerts: [{ title: 'Presse 64 arrêtée', impactCents: 395_000 }],
  previous: { producedUnits: 9_120, lateOrders: 2 },
};

describe('buildDailyReport — objet du message', () => {
  it('met dans l’objet ce qui demande une décision', () => {
    // Dans une boîte de réception, l'objet doit se lire sans ouvrir.
    expect(buildDailyReport(BASE, FORMAT).subject).toBe(
      'Usine — 1 machine à l’arrêt, 3 commandes en retard (santé 87/100)',
    );
  });

  it('accorde les pluriels', () => {
    const subject = buildDailyReport(
      { ...BASE, machinesDown: 2, lateOrders: 1 },
      FORMAT,
    ).subject;

    expect(subject).toContain('2 machines à l’arrêt');
    expect(subject).toContain('1 commande en retard');
  });

  it('dit explicitement qu’il n’y a rien à signaler', () => {
    const subject = buildDailyReport(
      { ...BASE, machinesDown: 0, lateOrders: 0 },
      FORMAT,
    ).subject;

    // Une journée sans incident est une information, pas un objet vide.
    expect(subject).toBe('Usine — rien à signaler (santé 87/100)');
  });
});

describe('buildDailyReport — corps du message', () => {
  it('donne les chiffres du jour et le taux de réalisation', () => {
    const { text } = buildDailyReport(BASE, FORMAT);

    expect(text).toContain('Santé de l’usine : 87/100');
    expect(text).toContain('Production : 8870 sur 9680 pièces (92 %)');
    expect(text).toContain('Machines : 23/24 disponibles');
    expect(text).toContain('Arrêts cumulés : 214 min');
  });

  it('compare au dernier relevé, avec un signe explicite', () => {
    const { text } = buildDailyReport(BASE, FORMAT);

    expect(text).toContain('Production −250');
    expect(text).toContain('Commandes en retard +1');
  });

  it('écrit « stable » plutôt que « +0 »', () => {
    const { text } = buildDailyReport(
      { ...BASE, previous: { producedUnits: BASE.producedUnits, lateOrders: BASE.lateOrders } },
      FORMAT,
    );

    expect(text).toContain('Production stable');
  });

  it('omet la comparaison quand aucun relevé antérieur n’existe', () => {
    const { text } = buildDailyReport({ ...BASE, previous: null }, FORMAT);

    // Pas de référence, pas d'écart inventé.
    expect(text).not.toContain('Depuis le dernier relevé');
    expect(text).toContain('Production : 8870');
  });

  it('liste les alertes critiques avec leur impact', () => {
    const { text } = buildDailyReport(BASE, FORMAT);

    expect(text).toContain('À traiter en priorité :');
    expect(text).toContain('· Presse 64 arrêtée — 3950 €');
  });

  it('omet l’impact d’une alerte non chiffrée', () => {
    const { text } = buildDailyReport(
      { ...BASE, criticalAlerts: [{ title: 'Habilitation expirée', impactCents: 0 }] },
      FORMAT,
    );

    expect(text).toContain('· Habilitation expirée');
    expect(text).not.toContain('Habilitation expirée —');
  });

  it('annonce l’absence d’alerte critique', () => {
    const { text } = buildDailyReport({ ...BASE, criticalAlerts: [] }, FORMAT);

    expect(text).toContain('Aucune alerte critique ouverte.');
    expect(text).not.toContain('À traiter en priorité');
  });

  it('ne divise pas par zéro quand aucun objectif n’est fixé', () => {
    const { text } = buildDailyReport({ ...BASE, targetUnits: 0 }, FORMAT);

    expect(text).toContain('(0 %)');
    expect(text).not.toContain('NaN');
  });
});
