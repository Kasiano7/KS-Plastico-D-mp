'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, UserMinus } from 'lucide-react';
import { buttonClass } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionToast } from '@/components/ui/toast';
import { deactivateUsersAction, type UserActionState } from '@/server/actions/users';

/**
 * Désactivation en masse.
 *
 * Enveloppe le tableau des utilisateurs, dont les lignes restent rendues côté
 * serveur et passent par `children` : seule la sélection a besoin d'être
 * interactive, pas l'affichage.
 *
 * Le décompte est lu directement dans le DOM du formulaire plutôt que tenu
 * dans un état parallèle. Les cases sont posées par le serveur ; dupliquer
 * leur état ici créerait deux sources de vérité pour la même information.
 */
export function UserBulkDeactivate({ children }: { children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState<UserActionState, FormData>(
    deactivateUsersAction,
    {},
  );

  useActionToast(state, {
    success: 'Comptes désactivés',
    error: 'Désactivation impossible',
  });

  function refreshCount() {
    const form = formRef.current;
    if (!form) return;
    setSelected(form.querySelectorAll<HTMLInputElement>('input[name="userIds"]:checked').length);
  }

  return (
    <form ref={formRef} action={formAction} onChange={refreshCount}>
      {children}

      {/*
        La barre n'apparaît qu'une fois quelque chose sélectionné : une barre
        d'actions grisée en permanence encombre sans rien apporter.
      */}
      {selected > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-sunken px-5 py-3">
          <span className="text-[0.8125rem] text-fg-muted">
            <span className="tabular font-semibold text-fg">{selected}</span> compte
            {selected > 1 ? 's' : ''} sélectionné{selected > 1 ? 's' : ''}
          </span>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={buttonClass('secondary', 'sm', 'ml-auto')}
          >
            <UserMinus className="size-3.5" />
            Désactiver
          </button>

          <SubmitButton />
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={`Désactiver ${selected} compte${selected > 1 ? 's' : ''} ?`}
        description={
          <>
            Les personnes concernées ne pourront plus se connecter. Rien n’est supprimé : leurs
            traces restent dans le journal d’audit, et un compte peut être réactivé à tout moment.
          </>
        }
        confirmLabel="Désactiver"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}

/**
 * Bouton de soumission masqué visuellement mais accessible au clavier.
 * La confirmation passe par la modale ; ce bouton n'existe que pour que le
 * formulaire reste soumettable sans souris.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  if (!pending) return <button type="submit" className="sr-only" tabIndex={-1} aria-hidden />;

  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-fg-muted">
      <Loader2 className="size-3.5 animate-spin" />
      Désactivation…
    </span>
  );
}
