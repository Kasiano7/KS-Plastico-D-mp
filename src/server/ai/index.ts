import 'server-only';

import { DemoAiProvider } from './demo-provider';
import { OpenAiProvider } from './openai-provider';
import { shouldAllowDemoFallback } from './provider-selection';
import type { AiAnswer, AiProvider, AiQuestion } from './types';

/**
 * Point d'entrée unique du copilote.
 *
 * L'application ne connaît QUE cette fonction. Brancher un fournisseur LLM
 * consiste à ajouter une implémentation de `AiProvider` dans la liste
 * ci-dessous : aucune page, aucun composant n'a à changer.
 */

const providers: AiProvider[] = [
  new OpenAiProvider(),
  new DemoAiProvider(),
];

export function getAiProvider(): AiProvider {
  const available = providers.find((provider) => provider.isAvailable());
  if (!available) throw new Error('Aucun fournisseur IA disponible.');
  return available;
}

export async function askFactory(question: AiQuestion): Promise<AiAnswer> {
  const trimmed = question.question.trim();
  if (trimmed.length < 3) {
    return {
      question: trimmed,
      summary: 'Posez une question à votre usine — par exemple : « Comment va l’usine aujourd’hui ? »',
      severity: 'info',
      facts: [],
      confidence: 1,
      sources: [],
      provider: 'demo',
    };
  }

  if (/(import|photo|image|excel|csv).*(catalogue|référence)|(?:catalogue|référence).*(import|photo|image|excel|csv)/i.test(trimmed)) {
    return {
      question: trimmed,
      summary:
        "Je peux analyser une photo, un fichier Excel ou un CSV et préparer les références à ajouter. Ouvrez l’import assisté : je détecterai les doublons et rien ne sera enregistré avant votre validation.",
      severity: 'info',
      facts: [],
      actions: [{ label: 'Importer des références', href: '/catalogue/import' }],
      confidence: 1,
      sources: ['Fonction d’import sécurisé KS Plastico Demo'],
      provider: 'ks-plastico-demo',
    };
  }

  let lastError: unknown;
  const remoteConfigured = providers[0]?.isAvailable() ?? false;
  const allowDemoFallback = shouldAllowDemoFallback(remoteConfigured);

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;
    if (provider.id === 'demo' && !allowDemoFallback) continue;
    try {
      return await provider.answer({ ...question, question: trimmed });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Aucun fournisseur IA disponible.');
}

export const SUGGESTED_QUESTIONS = [
  "Comment va l'usine aujourd'hui ?",
  "Pourquoi l'atelier B est-il sous son objectif ?",
  'Quelles commandes risquent d’être en retard ?',
  'Ai-je assez de palettes cette semaine ?',
  'Avons-nous déjà rencontré ce problème d’alimentation matière ?',
  'Comment importer des références depuis une photo ou Excel ?',
] as const;

export type { AiAnswer, AiQuestion, AiProvider, AiConversationTurn } from './types';
