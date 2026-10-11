import { describe, expect, it } from 'vitest';
import { decideSolEscalation, type TerraAssessment } from '../routing';

function assessment(overrides: Partial<TerraAssessment> = {}): TerraAssessment {
  return {
    canAnswerReliably: true,
    confidence: 0.9,
    complexity: 'medium',
    requiresSol: false,
    escalationReason: 'none',
    ...overrides,
  };
}

describe('routage Terra vers Sol', () => {
  it('garde une question simple sur Terra', () => {
    expect(decideSolEscalation(assessment())).toEqual({ escalate: false, reason: 'none' });
  });

  it('ne remplace jamais une donnée manquante par Sol', () => {
    expect(
      decideSolEscalation(
        assessment({
          canAnswerReliably: false,
          confidence: 0.2,
          complexity: 'high',
          requiresSol: true,
          escalationReason: 'missing_data',
        }),
      ),
    ).toEqual({ escalate: false, reason: 'missing_data' });
  });

  it('autorise Sol pour une optimisation complexe explicitement incertaine', () => {
    expect(
      decideSolEscalation(
        assessment({
          canAnswerReliably: false,
          confidence: 0.61,
          complexity: 'expert',
          requiresSol: true,
          escalationReason: 'complex_optimization',
        }),
      ),
    ).toEqual({ escalate: true, reason: 'complex_optimization' });
  });

  it('n’escalade pas une question seulement parce que Terra est peu confiant', () => {
    expect(
      decideSolEscalation(
        assessment({ canAnswerReliably: false, confidence: 0.4, complexity: 'medium' }),
      ).escalate,
    ).toBe(false);
  });

  it('ignore une demande Sol incohérente lorsque Terra se dit fiable', () => {
    expect(
      decideSolEscalation(
        assessment({
          canAnswerReliably: true,
          confidence: 0.91,
          complexity: 'expert',
          requiresSol: true,
          escalationReason: 'high_stakes_decision',
        }),
      ).escalate,
    ).toBe(false);
  });

  it('bloque une dérive de Sol au-delà du plafond observé', () => {
    expect(
      decideSolEscalation(
        assessment({
          canAnswerReliably: false,
          confidence: 0.5,
          complexity: 'expert',
          requiresSol: true,
          escalationReason: 'multi_scenario_analysis',
        }),
        { recentUsage: { totalRequests: 100, solRequests: 20 }, maxSolShare: 0.2 },
      ),
    ).toEqual({ escalate: false, reason: 'sol_share_guardrail' });
  });
});
