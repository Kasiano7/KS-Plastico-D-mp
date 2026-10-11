'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { updateOrderAction, type ActionState } from '@/server/actions/orders';
import { Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      Enregistrer les modifications
    </button>
  );
}

export function EditOrderForm({
  orderId,
  defaultQuantity,
  minQuantity,
  defaultDueAt,
  defaultPriority,
  defaultNotes,
}: {
  orderId: string;
  defaultQuantity: number;
  minQuantity: number;
  defaultDueAt: string;
  defaultPriority: string;
  defaultNotes: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateOrderAction, {});

  return (
    <form action={formAction} className="space-y-4 px-5 pb-5">
      <input type="hidden" name="orderId" value={orderId} />

      <Field
        label="Quantité commandée"
        htmlFor="quantityUnits"
        hint={minQuantity > 0 ? `Minimum : ${minQuantity} pièces déjà produites.` : undefined}
      >
        <Input
          id="quantityUnits"
          name="quantityUnits"
          type="number"
          min={minQuantity || 1}
          defaultValue={defaultQuantity}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date souhaitée" htmlFor="dueAt">
          <Input id="dueAt" name="dueAt" type="date" defaultValue={defaultDueAt} required />
        </Field>

        <Field label="Priorité" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={defaultPriority}>
            <option value="low">Basse</option>
            <option value="normal">Normale</option>
            <option value="high">Haute</option>
            <option value="critical">Critique</option>
          </Select>
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Visibles par la production et l'expédition.">
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaultNotes} />
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton />
      </div>

      {state.message ? (
        <p role="alert" className="text-[0.8125rem] text-critical">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
