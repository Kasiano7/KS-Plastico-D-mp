import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { askFactory } from '@/server/ai';
import { consumeRateLimit } from '@/server/services/rate-limit';
import { getClientIp } from '@/server/security/client-ip';
import { isDemoMode } from '@/config/demo';
import {
  getOrCreateConversation,
  getRecentTurns,
  recordAssistantMessage,
  recordUserMessage,
} from '@/server/services/ai-conversations';

/** Par utilisateur authentifié : assez large pour une conversation active, pas pour un script. */
const COPILOTE_REQUESTS_PER_MINUTE = 20;
const COPILOTE_WINDOW_SECONDS = 60;
/** Démonstration publique : par adresse IP, plus serré qu'un compte authentifié. */
const DEMO_COPILOTE_REQUESTS_PER_MINUTE = 10;

const schema = z.object({
  question: z.string().min(1).max(500),
  // Fil à poursuivre. Absent = nouveau fil. Le contenu de l'historique n'est
  // JAMAIS accepté du client : il est relu dans notre base (§ mémoire IA
  // Europe) avant d'être transmis à OpenAI, qui n'est jamais le système de
  // stockage principal (appels avec `store: false`).
  conversationId: z.string().uuid().optional(),
});

/**
 * Copilote IA — lecture seule.
 * Aucune modification n'est possible par ce canal : toute action passe par le
 * cycle recommandation → simulation → approbation → exécution (§13).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
  if (!can(user.permissions, 'ai:ask')) {
    return NextResponse.json({ error: 'Accès au copilote non autorisé.' }, { status: 403 });
  }

  // En démonstration, tous les visiteurs partagent quelques comptes : la
  // limite par utilisateur ne protège plus rien, elle est donc posée par IP.
  const rateLimit = isDemoMode()
    ? await consumeRateLimit(
        `copilote-ip:${await getClientIp()}`,
        DEMO_COPILOTE_REQUESTS_PER_MINUTE,
        COPILOTE_WINDOW_SECONDS,
      )
    : await consumeRateLimit(`copilote:${user.id}`, COPILOTE_REQUESTS_PER_MINUTE, COPILOTE_WINDOW_SECONDS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Trop de questions en peu de temps. Patientez quelques instants.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Question invalide.' }, { status: 400 });
  }

  const companyId = process.env.APP_COMPANY_ID ?? 'demo';

  try {
    const conversation = await getOrCreateConversation(
      parsed.data.conversationId,
      user.id,
      companyId,
      parsed.data.question,
    );
    const history = await getRecentTurns(conversation.id);
    await recordUserMessage(conversation.id, parsed.data.question);

    const answer = await askFactory({
      question: parsed.data.question,
      userId: user.id,
      companyId,
      workshopId: user.workshopId,
      role: user.roleLabel,
      permissions: user.permissions,
      canSeeFinancials: can(user.permissions, 'finance:read'),
      history,
    });

    await recordAssistantMessage(conversation.id, answer);

    return NextResponse.json({ answer, conversationId: conversation.id });
  } catch (error) {
    console.error('[copilote] Échec du fournisseur IA.', error);
    return NextResponse.json(
      {
        error:
          "L'assistant IA est temporairement indisponible. Les autres fonctions de KS Plastico Demo restent accessibles.",
      },
      { status: 503 },
    );
  }
}
