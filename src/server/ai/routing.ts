export const ESCALATION_REASONS = [
  'none',
  'complex_optimization',
  'multi_scenario_analysis',
  'high_stakes_decision',
  'causal_uncertainty',
  'interdependent_constraints',
  'missing_data',
] as const;

export type EscalationReason = (typeof ESCALATION_REASONS)[number];
export type AnalysisComplexity = 'low' | 'medium' | 'high' | 'expert';

export type TerraAssessment = {
  canAnswerReliably: boolean;
  confidence: number;
  complexity: AnalysisComplexity;
  requiresSol: boolean;
  escalationReason: EscalationReason;
};

export type SolUsageWindow = {
  totalRequests: number;
  solRequests: number;
};

export type EscalationDecision = {
  escalate: boolean;
  reason: EscalationReason | 'confidence_below_threshold' | 'sol_share_guardrail';
};

/**
 * Garde-fou déterministe autour du jugement structuré de Terra.
 *
 * Il ne route jamais sur des mots-clés. Une donnée absente ne peut pas être
 * compensée par un modèle plus puissant, et le plafond de Sol empêche une
 * dérive de coût silencieuse.
 */
export function decideSolEscalation(
  assessment: TerraAssessment,
  options: {
    confidenceThreshold?: number;
    maxSolShare?: number;
    recentUsage?: SolUsageWindow;
    minimumSamplesForGuardrail?: number;
  } = {},
): EscalationDecision {
  if (assessment.escalationReason === 'missing_data') {
    return { escalate: false, reason: 'missing_data' };
  }

  const threshold = options.confidenceThreshold ?? 0.7;
  const answerIsInsufficient =
    !assessment.canAnswerReliably || assessment.confidence < threshold;
  const modelRequestsEscalation =
    answerIsInsufficient &&
    (assessment.requiresSol ||
      (!assessment.canAnswerReliably && assessment.confidence < threshold));
  const complexitySupportsEscalation =
    assessment.complexity === 'high' || assessment.complexity === 'expert';

  if (!modelRequestsEscalation || !complexitySupportsEscalation) {
    return {
      escalate: false,
      reason:
        assessment.confidence < threshold
          ? 'confidence_below_threshold'
          : assessment.escalationReason,
    };
  }

  const usage = options.recentUsage;
  const minimumSamples = options.minimumSamplesForGuardrail ?? 20;
  const maxShare = options.maxSolShare ?? 0.2;
  if (
    usage &&
    usage.totalRequests >= minimumSamples &&
    usage.solRequests / usage.totalRequests >= maxShare
  ) {
    return { escalate: false, reason: 'sol_share_guardrail' };
  }

  return {
    escalate: true,
    reason:
      assessment.escalationReason === 'none'
        ? 'confidence_below_threshold'
        : assessment.escalationReason,
  };
}
