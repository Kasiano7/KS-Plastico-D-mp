'use client';

import { useActionState, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionToast } from '@/components/ui/toast';
import { cancelProductionOrderAction, type PlanningActionState } from '@/server/actions/planning';

/**
 * Retrait d'un ordre planifié par erreur (§19).
 *
 * La confirmation passe par la modale du design system : la boîte native du
 * système d'exploitation ne peut pas mettre le numéro d'ordre en évidence, et
 * son apparence rompt celle de l'application. L'action serveur revérifie tout
 * de toute façon — statut, atelier — la confirmation n'est qu'un garde-fou de
 * geste.
 */
export function CancelOrderButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, formAction] = useActionState<PlanningActionState, FormData>(
    cancelProductionOrderAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useActionToast(state, {
    success: 'Ordre retiré du planning',
    description: orderNumber,
    error: 'Retrait impossible',
  });

  return (
    <>
      <form ref={formRef} action={formAction} className="inline-flex items-center gap-2">
        <input type="hidden" name="productionOrderId" value={orderId} />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-critical hover:underline"
        >
          <X className="size-3" aria-hidden />
          Retirer
        </button>
      </form>

      <ConfirmDialog
        open={confirming}
        title="Retirer cet ordre du planning ?"
        description={
          <>
            L’ordre <span className="font-medium text-fg">{orderNumber}</span> quittera le planning.
            Le retrait est enregistré dans l’historique, avec son auteur.
          </>
        }
        confirmLabel="Retirer"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
