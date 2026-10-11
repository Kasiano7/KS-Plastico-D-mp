import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import type { AiAnswer, AiConversationTurn } from '../ai/types';

/**
 * Mémoire persistée du copilote — architecture « DB Europe source de vérité ».
 *
 * OpenAI est appelé avec `store: false` (voir openai-provider.ts) : ces
 * fonctions sont le SEUL endroit où une conversation devient durable. Le fil
 * transmis au modèle vient toujours d'ici, jamais d'un historique renvoyé
 * par le client (non fiable — perdu au rechargement, potentiellement falsifié).
 */

const MAX_HISTORY_TURNS = 6;
const TITLE_MAX_LENGTH = 140;

export type StoredConversation = typeof t.aiConversations.$inferSelect;

function truncateTitle(question: string): string {
  const trimmed = question.trim();
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 1)}…` : trimmed;
}

/**
 * Retrouve une conversation appartenant à l'utilisateur, ou en ouvre une
 * nouvelle. Un identifiant qui n'appartient pas à l'utilisateur (autre
 * compte, id invalide) démarre un nouveau fil plutôt que d'échouer ou de
 * fuiter la mémoire d'un autre utilisateur.
 */
export async function getOrCreateConversation(
  conversationId: string | undefined,
  userId: string,
  companyId: string,
  firstQuestion: string,
): Promise<StoredConversation> {
  const db = await getDb();

  if (conversationId) {
    const [existing] = await db
      .select()
      .from(t.aiConversations)
      .where(and(eq(t.aiConversations.id, conversationId), eq(t.aiConversations.userId, userId)))
      .limit(1);
    if (existing) return existing;
  }

  const [created] = await db
    .insert(t.aiConversations)
    .values({ userId, companyId, title: truncateTitle(firstQuestion) })
    .returning();
  return created;
}

/** Fil de discussion pertinent, reconstitué depuis la base — jamais depuis le client. */
export async function getRecentTurns(
  conversationId: string,
  maxTurns = MAX_HISTORY_TURNS,
): Promise<AiConversationTurn[]> {
  const db = await getDb();
  const rows = await db
    .select({ role: t.aiMessages.role, content: t.aiMessages.content })
    .from(t.aiMessages)
    .where(eq(t.aiMessages.conversationId, conversationId))
    .orderBy(asc(t.aiMessages.createdAt));

  const turns: AiConversationTurn[] = [];
  let pendingQuestion: string | null = null;
  for (const row of rows) {
    if (row.role === 'user') {
      pendingQuestion = row.content;
    } else if (row.role === 'assistant' && pendingQuestion !== null) {
      turns.push({ question: pendingQuestion, summary: row.content });
      pendingQuestion = null;
    }
  }
  return turns.slice(-maxTurns);
}

export async function recordUserMessage(conversationId: string, content: string): Promise<void> {
  const db = await getDb();
  await db.insert(t.aiMessages).values({ conversationId, role: 'user', content });
}

/**
 * Enregistre la réponse et met à jour le résumé courant de la conversation
 * (mémoire courte immédiate — le dernier résumé, sans appel modèle dédié).
 */
export async function recordAssistantMessage(conversationId: string, answer: AiAnswer): Promise<void> {
  const db = await getDb();
  await db.insert(t.aiMessages).values({
    conversationId,
    role: 'assistant',
    content: answer.summary,
    answer,
    model: answer.model ?? answer.provider,
  });
  await db
    .update(t.aiConversations)
    .set({ summary: answer.summary, updatedAt: new Date() })
    .where(eq(t.aiConversations.id, conversationId));
}
