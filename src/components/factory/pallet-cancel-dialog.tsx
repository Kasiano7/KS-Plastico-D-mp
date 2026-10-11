'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Undo2, X } from 'lucide-react';
import { Field, Textarea, buttonClass } from '@/components/ui/primitives';
import { cancelPalletAction, type ActionState } from '@/server/actions/pallets';

/** Annule une palette déclarée par erreur : défait le stock et l'avancement associés. */
export function PalletCancelDialog({ palletId, palletCode }: { palletId: string; palletCode: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(cancelPalletAction, {});

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass('ghost', 'sm', 'px-2 text-critical hover:bg-critical-soft')}
        title="Annuler cette palette (erreur de déclaration)"
        aria-label={`Annuler la palette ${palletCode}`}
      >
        <Undo2 className="size-3.5" />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => formRef.current?.reset()}
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xl backdrop:bg-fg/20 open:flex open:flex-col open:gap-4"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-fg">Annuler une palette</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={buttonClass('ghost', 'sm', 'px-2')}
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="text-[0.8125rem] text-fg-muted">
          Palette <strong className="font-mono text-fg">{palletCode}</strong> — le stock produit fini,
          l’avancement de l’ordre et la palette Europe consommée seront corrigés en conséquence.
        </p>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="palletId" value={palletId} />
          <Field label="Raison de l’annulation" htmlFor={`cancel-justification-${palletId}`}>
            <Textarea
              id={`cancel-justification-${palletId}`}
              name="justification"
              required
              minLength={5}
              rows={2}
              placeholder="Ex. mauvaise quantité saisie, palette déclarée deux fois…"
            />
          </Field>
          {state.message && !state.ok ? (
            <p className="text-xs text-critical">{state.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={buttonClass('secondary', 'sm')}
            >
              Retour
            </button>
            <SubmitButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('danger', 'sm')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirmer l’annulation'}
    </button>
  );
}
