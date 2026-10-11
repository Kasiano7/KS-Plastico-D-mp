'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { createOrderAction, type ActionState } from '@/server/actions/orders';
import { Field, Select, Textarea, buttonClass } from '@/components/ui/primitives';
import { formatNumber } from '@/lib/format';

export function CreateOrderConfirm({
  customers,
  defaultCustomerId,
  productId,
  quantityUnits,
  dueAt,
  reservable,
  toProduce,
}: {
  customers: { id: string; name: string }[];
  defaultCustomerId: string;
  productId: string;
  quantityUnits: number;
  dueAt: string;
  reservable: number;
  toProduce: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createOrderAction, {});

  return (
    <form action={formAction} className="space-y-4 px-5 pb-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantityUnits" value={quantityUnits} />
      <input type="hidden" name="dueAt" value={dueAt} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" htmlFor="customerId">
          <Select id="customerId" name="customerId" defaultValue={defaultCustomerId}>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Priorité" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="normal">
            <option value="low">Basse</option>
            <option value="normal">Normale</option>
            <option value="high">Haute</option>
            <option value="critical">Critique</option>
          </Select>
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Visibles par la production et l’expédition.">
        <Textarea id="notes" name="notes" rows={2} placeholder="Contraintes de livraison, emballage…" />
      </Field>

      <p className="rounded-[var(--radius-control)] border border-line bg-surface-sunken px-3.5 py-2.5 text-[0.8125rem] text-fg-muted">
        À la confirmation : <span className="font-medium text-normal">{formatNumber(reservable)}</span>{' '}
        pièce(s) seront réservées en stock et ne seront plus disponibles pour une autre commande.{' '}
        <span className="font-medium text-fg">{formatNumber(toProduce)}</span> pièce(s) resteront à
        produire.
      </p>

      <SubmitButton />

      {state.message ? (
        <p role="alert" className="text-[0.8125rem] text-critical">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      Créer la commande et réserver le stock
    </button>
  );
}
