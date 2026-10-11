import { describe, expect, it } from 'vitest';
import { explainRecommendation, type ExplanationInput } from '../explanation';

const FORMAT = {
  cents: (value: number) => `${(value / 100).toFixed(0)} €`,
  dateTime: () => '31/08/2026 09:12',
  percent: (value: number) => `${Math.round(value)} %`,
};

const BASE: ExplanationInput = {
  problem: 'Presse 64 arrêtée depuis 1 h 12',
  probableCause: 'Défaut d’alimentation matière',
  consequences: '2 commandes menacées',
  impactCents: 395_000,
  impactOrigin: 'computed',
  detectedAt: new Date('2026-08-31T07:12:00Z'),
  recommendation: {
    title: 'Basculer l’OF-2411 vers la Presse 05',
    rationale: 'La Presse 05 est libre et accepte le moule MOU-045.',
    expectedGainCents: 208_000,
    confidence: 0.82,
    origin: 'computed',
  },
  simulation: { successProbability: 0.76, summary: 'Livraison tenue à J+2.' },
};

const questions = (input: ExplanationInput, canSeeFinancials = true) =>
  explainRecommendation(input, FORMAT, { canSeeFinancials }).map((step) => step.question);

describe('explainRecommendation', () => {
  it('déroule le raisonnement dans l’ordre du constat vers la décision', () => {
    expect(questions(BASE)).toEqual([
      'Qu’est-ce qui a été constaté ?',
      'Quelle cause a été retenue ?',
      'Qu’est-ce que cela entraîne ?',
      'Combien cela coûte-t-il si rien n’est fait ?',
      'Que propose l’application ?',
      'Qu’est-ce que cela rapporte ?',
      'La simulation confirme-t-elle ?',
      'Quelle confiance accorder à ce raisonnement ?',
    ]);
  });

  it('omet une étape dont le fait n’est pas enregistré, sans la combler', () => {
    const steps = questions({ ...BASE, probableCause: null, consequences: null });

    expect(steps).not.toContain('Quelle cause a été retenue ?');
    expect(steps).not.toContain('Qu’est-ce que cela entraîne ?');
    // Le constat et la proposition, eux, sont toujours présents.
    expect(steps[0]).toBe('Qu’est-ce qui a été constaté ?');
  });

  it('masque les montants à qui n’a pas accès aux données financières', () => {
    const steps = questions(BASE, false);

    expect(steps).not.toContain('Combien cela coûte-t-il si rien n’est fait ?');
    expect(steps).not.toContain('Qu’est-ce que cela rapporte ?');
    expect(steps).toContain('Que propose l’application ?');
  });

  it('n’affiche pas un impact nul comme s’il était mesuré', () => {
    expect(questions({ ...BASE, impactCents: 0 })).not.toContain(
      'Combien cela coûte-t-il si rien n’est fait ?',
    );
  });

  it('omet la simulation quand aucune n’a été jouée', () => {
    expect(questions({ ...BASE, simulation: null })).not.toContain(
      'La simulation confirme-t-elle ?',
    );
  });

  it('porte l’origine de chaque fait, jamais un chiffre nu', () => {
    const steps = explainRecommendation(BASE, FORMAT, { canSeeFinancials: true });

    expect(steps.every((step) => step.origin !== undefined)).toBe(true);
    expect(steps.find((s) => s.question.startsWith('Combien'))?.origin).toBe('computed');
    expect(steps.find((s) => s.question.startsWith('La simulation'))?.origin).toBe('forecast');
  });

  it('termine en disant ce que la confiance ne mesure pas', () => {
    const last = explainRecommendation(BASE, FORMAT, { canSeeFinancials: true }).at(-1)!;

    expect(last.answer).toContain('82 %');
    expect(last.answer).toContain('pas la certitude du résultat');
    expect(last.answer).toContain('La décision reste humaine');
  });

  it('tolère une simulation sans résumé', () => {
    const steps = explainRecommendation(
      { ...BASE, simulation: { successProbability: 0.5, summary: null } },
      FORMAT,
      { canSeeFinancials: true },
    );

    expect(steps.find((s) => s.question.startsWith('La simulation'))?.answer).toBe(
      '50 % de chances de tenir l’engagement.',
    );
  });
});
