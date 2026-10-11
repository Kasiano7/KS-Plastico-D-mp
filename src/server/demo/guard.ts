import 'server-only';

import { NextResponse } from 'next/server';
import { DEMO_WRITE_DISABLED_MESSAGE, isDemoMode } from '@/config/demo';

/**
 * Garde centrale des écritures en mode démonstration.
 *
 * Chaque Server Action qui modifie la base l'appelle EN PREMIER, avant même
 * l'autorisation : en démonstration, aucune écriture n'est possible, quel que
 * soit le rôle choisi. Le test `demo-guard.test.ts` vérifie qu'aucune action
 * mutante n'y échappe.
 *
 * Le refus porte le message sous toutes les formes d'état utilisées par les
 * formulaires (`message`, `error`, `errors`) : l'interface l'affiche à la
 * place habituelle de ses erreurs, au lieu d'échouer en silence.
 */
export type DemoRefusal = {
  ok: false;
  message: string;
  error: string;
  errors: string[];
};

const REFUSAL: DemoRefusal = {
  ok: false,
  message: DEMO_WRITE_DISABLED_MESSAGE,
  error: DEMO_WRITE_DISABLED_MESSAGE,
  errors: [DEMO_WRITE_DISABLED_MESSAGE],
};

/** `null` hors démonstration ; sinon l'état de refus à renvoyer tel quel. */
export function demoWriteRefusal(): DemoRefusal | null {
  return isDemoMode() ? { ...REFUSAL, errors: [...REFUSAL.errors] } : null;
}

/** Variante pour les route handlers qui écrivent : réponse 403 explicite. */
export function demoWriteRefusalResponse(): NextResponse | null {
  if (!isDemoMode()) return null;
  return NextResponse.json({ ok: false, error: DEMO_WRITE_DISABLED_MESSAGE }, { status: 403 });
}
