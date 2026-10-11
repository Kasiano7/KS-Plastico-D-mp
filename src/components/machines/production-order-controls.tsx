'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Loader2, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  updateProductionOrderStatusAction,
  type ProductionOrderActionState,
} from '@/server/actions/production-orders';

type Transition = 'start' | 'pause' | 'resume' | 'complete';

const TRANSITION_BUTTONS: Record<
  Transition,
  {
    label: string;
    icon: typeof Play;
    className: string;
    /** Confirmation demandée avant une transition irréversible. */
    confirm?: { title: string; description: string };
  }
> = {
  start: { label: 'Démarrer', icon: Play, className: 'text-normal hover:underline' },
  pause: { label: 'Suspendre', icon: Pause, className: 'text-warning hover:underline' },
  resume: { label: 'Reprendre', icon: Play, className: 'text-normal hover:underline' },
  complete: {
    label: 'Clôturer',
    icon: CheckCircle2,
    className: 'text-fg-muted hover:text-fg hover:underline',
    confirm: {
      title: 'Clôturer cet ordre ?',
      description: 'Un ordre clôturé ne peut plus être repris ni modifié.',
    },
  },
};

/**
 * Bascule le statut réel d'un ordre de fabrication (§19).
 *
 * Avant ce contrôle, un ordre planifié restait « planifié » indéfiniment :
 * seuls les ordres générés par le simulateur de presses avançaient tout
 * seuls. Chaque transition proposée dépend du statut actuel de l'ordre —
 * l'action serveur revérifie la même règle, ce bouton n'est qu'un raccourci.
 */
export function ProductionOrderControls({
  productionOrderId,
  status,
}: {
  productionOrderId: string;
  status: string;
}) {
  const [state, formAction] = useActionState<ProductionOrderActionState, FormData>(
    updateProductionOrderStatusAction,
    {},
  );

  const transitions: Transition[] =
    status === 'planned' || status === 'released'
      ? ['start']
      : status === 'running'
        ? ['pause', 'complete']
        : status === 'paused'
          ? ['resume', 'complete']
          : [];

  if (transitions.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {transitions.map((transition) => (
          <TransitionButton
            key={transition}
            transition={transition}
            productionOrderId={productionOrderId}
            formAction={formAction}
          />
        ))}
      </div>
      {state.message && !state.ok ? (
        <span role="alert" className="text-[0.75rem] text-critical">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

function TransitionButton({
  transition,
  productionOrderId,
  formAction,
}: {
  transition: Transition;
  productionOrderId: string;
  formAction: (formData: FormData) => void;
}) {
  const { label, icon: Icon, className, confirm } = TRANSITION_BUTTONS[transition];
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="productionOrderId" value={productionOrderId} />
        <input type="hidden" name="transition" value={transition} />

        {/*
          Sans confirmation, le bouton soumet directement : « Démarrer » ou
          « Suspendre » se défont, contrairement à « Clôturer ».
        */}
        {confirm ? (
          <SubmitButton
            label={label}
            icon={Icon}
            className={className}
            onIntercept={() => setConfirming(true)}
          />
        ) : (
          <SubmitButton label={label} icon={Icon} className={className} />
        )}
      </form>

      {confirm ? (
        <ConfirmDialog
          open={confirming}
          tone="default"
          title={confirm.title}
          description={confirm.description}
          confirmLabel={label}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            formRef.current?.requestSubmit();
          }}
        />
      ) : null}
    </>
  );
}

function SubmitButton({
  label,
  icon: Icon,
  className,
  onIntercept,
}: {
  label: string;
  icon: typeof Play;
  className: string;
  /**
   * Détourne le clic vers une confirmation au lieu de soumettre.
   * Le bouton reste de type `submit` : il conserve l'état d'attente fourni
   * par `useFormStatus` une fois la confirmation donnée.
   */
  onIntercept?: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={
        onIntercept
          ? (event) => {
              event.preventDefault();
              onIntercept();
            }
          : undefined
      }
      className={cn('inline-flex items-center gap-1 text-[0.75rem] font-medium disabled:opacity-60', className)}
    >
      {pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Icon className="size-3" aria-hidden />}
      {label}
    </button>
  );
}
