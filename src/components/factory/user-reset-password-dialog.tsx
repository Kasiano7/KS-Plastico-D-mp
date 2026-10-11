'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { KeyRound, Loader2, X } from 'lucide-react';
import { Field, Input, buttonClass } from '@/components/ui/primitives';
import { resetUserPasswordAction, type UserActionState } from '@/server/actions/users';

export function UserResetPasswordDialog({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<UserActionState, FormData>(resetUserPasswordAction, {});

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass('ghost', 'sm', 'px-2')}
        title="Réinitialiser le mot de passe"
        aria-label="Réinitialiser le mot de passe"
      >
        <KeyRound className="size-3.5" />
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
          <h2 className="text-[0.9375rem] font-semibold text-fg">Réinitialiser le mot de passe</h2>
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
          Nouveau mot de passe pour <strong className="text-fg">{userName}</strong>.
          Ce compte devra se reconnecter.
        </p>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={userId} />
          <Field label="Nouveau mot de passe" htmlFor={`pwd-reset-${userId}`}>
            <Input
              id={`pwd-reset-${userId}`}
              type="password"
              name="password"
              placeholder="8 caractères minimum"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {state.errors?.length ? (
            <p className="text-xs text-critical">{state.errors[0]}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={buttonClass('secondary', 'sm')}
            >
              Annuler
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
    <button type="submit" disabled={pending} className={buttonClass('primary', 'sm')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Enregistrer'}
    </button>
  );
}
