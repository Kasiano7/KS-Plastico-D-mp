'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Field, Select, buttonClass } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionToast, useToast } from '@/components/ui/toast';
import {
  deleteMachineDocumentAction,
  uploadMachineDocumentAction,
  type DocumentActionState,
} from '@/server/actions/machine-documents';
import { DOCUMENT_CATEGORY_LABELS } from '@/components/maintenance/document-category';

/* Source unique des libellés — réexportée pour les pages qui la lisaient ici. */
export { DOCUMENT_CATEGORY_LABELS };

/** Dépôt d'un document — repliable comme les autres formulaires de la fiche machine. */
export function DocumentUploadForm({ machineId }: { machineId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<DocumentActionState, FormData>(
    uploadMachineDocumentAction,
    {},
  );

  // Ce formulaire, lui, reste monté après l'action : le message peut donc
  // être annoncé depuis ici.
  useActionToast(state, { success: 'Document déposé', error: 'Dépôt refusé' });

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Déposer un document
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-[var(--radius-control)] border border-line bg-surface-sunken p-3.5 sm:grid-cols-[1fr_auto_auto]"
    >
      <input type="hidden" name="machineId" value={machineId} />

      <Field label="Fichier" htmlFor="doc-file" hint="PDF, image ou document bureautique — 5 Mo maximum.">
        <input
          id="doc-file"
          name="file"
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt"
          className="w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-1.5 text-[0.8125rem] text-fg file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-2.5 file:py-1 file:text-[0.75rem] file:font-medium file:text-brand"
        />
      </Field>

      <Field label="Catégorie" htmlFor="doc-category">
        <Select id="doc-category" name="category" defaultValue="autre">
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex items-end gap-2">
        <SubmitButton />
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'md')}>
          Fermer
        </button>
      </div>

      {state.message ? (
        <p
          role="status"
          className={cn(
            'sm:col-span-3 rounded-[var(--radius-control)] px-3.5 py-2.5 text-[0.8125rem]',
            state.ok ? 'bg-normal-soft text-normal' : 'bg-critical-soft text-critical',
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Suppression d'un document.
 *
 * La confirmation passe par la modale du design system, et non plus par
 * `window.confirm` : la boîte native ne peut pas nommer le fichier autrement
 * que dans une phrase, ne dit pas que la suppression est définitive, et rompt
 * l'apparence de l'application. Le résultat est ensuite annoncé par un toast,
 * donc aussi à un lecteur d'écran.
 */
export function DeleteDocumentButton({ documentId, fileName }: { documentId: string; fileName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  /*
   * L'action est appelée directement, sans `useActionState`.
   *
   * La raison est mécanique : une suppression réussie déclenche
   * `revalidatePath`, la liste se recompose, et **cette ligne disparaît**. Un
   * composant démonté ne peut plus annoncer quoi que ce soit — le message de
   * succès était perdu à tous les coups.
   *
   * L'appel n'est pas non plus enveloppé dans `startTransition` : React
   * abandonne les mises à jour planifiées par une transition dont le composant
   * d'origine a disparu. Une simple promesse, elle, poursuit son exécution, et
   * `toast` écrit dans l'état du fournisseur, qui vit dans la coquille.
   */
  async function remove() {
    setConfirming(false);
    setPending(true);

    const formData = new FormData();
    formData.set('documentId', documentId);

    try {
      const result = await deleteMachineDocumentAction({}, formData);
      if (result.ok) {
        toast({ title: 'Document supprimé', description: fileName, tone: 'success' });
      } else {
        setPending(false);
        toast({
          title: 'Suppression impossible',
          description: result.message,
          tone: 'error',
          durationMs: 0,
        });
      }
    } catch {
      setPending(false);
      toast({
        title: 'Suppression impossible',
        description: 'La demande n’a pas abouti. Réessayez dans un instant.',
        tone: 'error',
        durationMs: 0,
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        aria-label={`Supprimer ${fileName}`}
        className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-critical hover:underline disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-3.5" aria-hidden />
        )}
        Supprimer
      </button>

      <ConfirmDialog
        open={confirming}
        title="Supprimer ce document ?"
        description={
          <>
            <span className="font-medium text-fg">{fileName}</span> sera définitivement retiré de
            la documentation de cette machine. Cette action ne peut pas être annulée.
          </>
        }
        confirmLabel="Supprimer"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      Déposer
    </button>
  );
}
