'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { runAlertEngineAction, type AlertEngineActionState } from '@/server/actions/alert-engine';
import { buttonClass } from '@/components/ui/primitives';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature imposée par useActionState.
async function runAction(_state: AlertEngineActionState, _formData: FormData): Promise<AlertEngineActionState> {
  return runAlertEngineAction();
}

/** Relance immédiate du moteur de recommandations continu (§ server/services/alert-engine.ts). */
export function RunAlertEngineButton() {
  const [state, formAction] = useActionState<AlertEngineActionState, FormData>(runAction, {});

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <SubmitButton />
      {state.message ? <p className="text-xs text-fg-muted">{state.message}</p> : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('secondary', 'sm')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      Réévaluer maintenant
    </button>
  );
}
