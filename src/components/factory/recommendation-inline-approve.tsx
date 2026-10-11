'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';
import { buttonClass } from '@/components/ui/primitives';
import { decideRecommendationAction, type ActionState } from '@/server/actions/alerts';

/**
 * Valide directement une recommandation déjà formalisée, sans renvoyer vers
 * le centre d'alertes. Même action, même traçabilité — seulement un aller-
 * retour de moins pour le planificateur.
 */
export function RecommendationInlineApprove({ recommendationId }: { recommendationId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(decideRecommendationAction, {});

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <input type="hidden" name="decision" value="approved" />
      <SubmitButton />
      {state.message ? (
        <span className={state.ok ? 'text-xs text-normal' : 'text-xs text-critical'}>{state.message}</span>
      ) : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('secondary', 'sm')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Valider directement
    </button>
  );
}
