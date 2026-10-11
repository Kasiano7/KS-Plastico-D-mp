/**
 * Traçabilité d'une recommandation.
 *
 * Un pourcentage de confiance ne se discute pas : on y croit ou on n'y croit
 * pas. Le raisonnement, lui, se vérifie. « 82 % de confiance » ne dit rien à
 * un chef d'atelier ; « la Presse 05 est libre à 14 h, elle accepte le moule
 * MOU-045, le changement coûte 40 minutes » se contrôle en trois secondes.
 *
 * Ce module ne produit **aucun fait nouveau** : il ordonne ce qui a déjà été
 * mesuré ou calculé. Chaque étape absente est omise plutôt que comblée — une
 * cause non renseignée le reste, elle ne devient pas « inconnue » déguisée.
 */

export type ExplanationStep = {
  /** Question à laquelle l'étape répond, du point de vue de l'utilisateur. */
  question: string;
  /** Le fait, tel qu'il est enregistré. */
  answer: string;
  /** Origine de la donnée, affichée avec elle (règle n° 4). */
  origin?: 'measured' | 'computed' | 'estimated' | 'forecast';
};

export type ExplanationInput = {
  problem: string;
  probableCause: string | null;
  consequences: string | null;
  impactCents: number;
  impactOrigin: 'measured' | 'computed' | 'estimated' | 'forecast';
  detectedAt: Date;
  recommendation: {
    title: string;
    rationale: string;
    expectedGainCents: number;
    confidence: number;
    origin: string;
  };
  simulation: { successProbability: number; summary?: string | null } | null;
};

export type Formatters = {
  cents: (value: number) => string;
  dateTime: (value: Date) => string;
  percent: (value: number) => string;
};

export function explainRecommendation(
  input: ExplanationInput,
  format: Formatters,
  options: { canSeeFinancials: boolean },
): ExplanationStep[] {
  const steps: ExplanationStep[] = [
    {
      question: 'Qu’est-ce qui a été constaté ?',
      answer: `${input.problem} — détecté le ${format.dateTime(input.detectedAt)}.`,
      origin: 'measured',
    },
  ];

  if (input.probableCause) {
    steps.push({
      question: 'Quelle cause a été retenue ?',
      answer: input.probableCause,
      origin: 'computed',
    });
  }

  if (input.consequences) {
    steps.push({
      question: 'Qu’est-ce que cela entraîne ?',
      answer: input.consequences,
      origin: 'computed',
    });
  }

  /*
   * L'impact financier ne s'affiche qu'à qui a le droit de le voir. Masquer un
   * chiffre n'est pas une sécurité — la page le revérifie — mais afficher un
   * montant à un opérateur n'aurait aucun sens.
   */
  if (options.canSeeFinancials && input.impactCents > 0) {
    steps.push({
      question: 'Combien cela coûte-t-il si rien n’est fait ?',
      answer: format.cents(input.impactCents),
      origin: input.impactOrigin,
    });
  }

  steps.push({
    question: 'Que propose l’application ?',
    answer: `${input.recommendation.title}. ${input.recommendation.rationale}`,
    origin: input.recommendation.origin as ExplanationStep['origin'],
  });

  if (options.canSeeFinancials && input.recommendation.expectedGainCents > 0) {
    steps.push({
      question: 'Qu’est-ce que cela rapporte ?',
      answer: `${format.cents(input.recommendation.expectedGainCents)} récupérés sur l’impact estimé.`,
      origin: 'estimated',
    });
  }

  if (input.simulation) {
    steps.push({
      question: 'La simulation confirme-t-elle ?',
      answer: [
        `${format.percent(input.simulation.successProbability * 100)} de chances de tenir l’engagement.`,
        input.simulation.summary,
      ]
        .filter(Boolean)
        .join(' '),
      origin: 'forecast',
    });
  }

  /*
   * La dernière étape dit ce que la confiance ne dit pas. C'est la seule
   * façon honnête de présenter un pourcentage sorti d'un modèle : il mesure
   * la solidité du raisonnement, pas la certitude du résultat.
   */
  steps.push({
    question: 'Quelle confiance accorder à ce raisonnement ?',
    answer: `${format.percent(input.recommendation.confidence * 100)} — cette valeur mesure la solidité de l’enchaînement ci-dessus, pas la certitude du résultat. La décision reste humaine.`,
    origin: 'computed',
  });

  return steps;
}
