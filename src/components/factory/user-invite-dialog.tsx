'use client';

import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useActionToast } from '@/components/ui/toast';
import { inviteUserAction, type UserActionState } from '@/server/actions/users';

/**
 * Invitation d'un utilisateur.
 *
 * Créer un compte imposait de choisir un mot de passe **pour quelqu'un
 * d'autre**, puis de le lui transmettre par un canal qui n'est jamais sûr :
 * à l'oral, par message, sur un papier. Et ce mot de passe restait en place.
 *
 * Ici, l'administrateur ne connaît jamais le mot de passe : le compte naît
 * sans identifiant utilisable, et l'invité définit le sien par un lien à
 * usage unique valable sept jours.
 */
export function UserInviteDialog({ roles }: { roles: { id: string; name: string }[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState<UserActionState, FormData>(inviteUserAction, {});

  useActionToast(state, { success: 'Invitation envoyée', error: 'Invitation impossible' });

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass('secondary', 'sm')}
      >
        <Send className="size-3.5" />
        Inviter
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="invite-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        /* Tailwind neutralise le `margin: auto` par défaut de `<dialog>`. */
        className="m-auto w-[min(92vw,30rem)] max-w-none rounded-[var(--radius-card)] border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-overlay"
      >
        <form action={formAction} className="p-5">
          <h2 id="invite-title" className="text-base font-semibold text-fg">
            Inviter un utilisateur
          </h2>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-muted">
            La personne recevra un lien pour définir elle-même son mot de passe. Vous ne le
            connaîtrez jamais — c’est voulu.
          </p>

          <div className="mt-5 space-y-4">
            <Field label="Nom complet" htmlFor="invite-name">
              <Input id="invite-name" name="fullName" required autoComplete="off" />
            </Field>

            <Field label="Adresse e-mail" htmlFor="invite-email">
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="nom@entreprise.com"
              />
            </Field>

            <Field label="Rôle" htmlFor="invite-role">
              <Select id="invite-role" name="roleId" required defaultValue="">
                <option value="" disabled>
                  Choisir un rôle
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {state.errors?.length ? (
            <ul
              role="alert"
              className="mt-4 space-y-1 rounded-[var(--radius-control)] bg-critical-soft px-3.5 py-2.5 text-[0.8125rem] text-critical"
            >
              {state.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
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
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
      Envoyer l’invitation
    </button>
  );
}
