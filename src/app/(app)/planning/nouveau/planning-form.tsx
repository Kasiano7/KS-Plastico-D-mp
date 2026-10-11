'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import {
  scheduleProductionOrderAction,
  type PlanningActionState,
} from '@/server/actions/planning';
import { Field, Select, Input, buttonClass } from '@/components/ui/primitives';

type OrderOption = {
  id: string;
  number: string;
  productId: string;
  productName: string;
  machineId: string | null;
  remainingUnits: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
};

type MachineOption = { id: string; name: string; code: string; workshopName: string };

/** `datetime-local` attend l'heure locale, jamais l'UTC de `toISOString()`. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PlanningForm({
  orders,
  machines,
  compatibilities,
  initialOrder,
}: {
  orders: OrderOption[];
  machines: MachineOption[];
  compatibilities: { productId: string; machineId: string }[];
  initialOrder: OrderOption | null;
}) {
  const [state, formAction] = useActionState<PlanningActionState, FormData>(
    scheduleProductionOrderAction,
    {},
  );

  // Compatibilité pièce ↔ machine (§19) : une presse choisie ne propose que
  // les ordres dont la pièce y est réellement montable (mêmes moules).
  const machinesByProduct = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of compatibilities) {
      const set = map.get(row.productId) ?? new Set<string>();
      set.add(row.machineId);
      map.set(row.productId, set);
    }
    return map;
  }, [compatibilities]);

  const [machineId, setMachineId] = useState(initialOrder?.machineId ?? '');
  const [orderId, setOrderId] = useState(initialOrder?.id ?? '');

  const compatibleOrders = machineId
    ? orders.filter((order) => machinesByProduct.get(order.productId)?.has(machineId))
    : [];
  const selectedOrder = compatibleOrders.find((order) => order.id === orderId);

  return (
    <form action={formAction} className="space-y-5 px-5 pb-5">
      <Field
        label="Presse"
        htmlFor="machineId"
        hint="Choisissez d’abord la presse : la liste des ordres compatibles s’adapte ensuite."
      >
        <Select
          id="machineId"
          name="machineId"
          required
          value={machineId}
          onChange={(event) => {
            setMachineId(event.target.value);
            setOrderId('');
          }}
        >
          <option value="" disabled>Sélectionner une presse</option>
          {machines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.workshopName} · {machine.name} ({machine.code})
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Ordre de fabrication"
        htmlFor="productionOrderId"
        hint={
          !machineId
            ? 'Sélectionnez une presse pour voir les ordres compatibles.'
            : compatibleOrders.length === 0
              ? 'Aucun ordre compatible avec cette presse.'
              : undefined
        }
      >
        <Select
          id="productionOrderId"
          name="productionOrderId"
          required
          disabled={!machineId || compatibleOrders.length === 0}
          value={selectedOrder ? orderId : ''}
          onChange={(event) => setOrderId(event.target.value)}
        >
          <option value="" disabled>Sélectionner un ordre</option>
          {compatibleOrders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.productName} · {order.number} · reste {order.remainingUnits} pièces
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Début prévu" htmlFor="plannedStartAt">
          <Input
            id="plannedStartAt"
            name="plannedStartAt"
            type="datetime-local"
            required
            defaultValue={initialOrder ? toDatetimeLocalValue(initialOrder.plannedStartAt) : undefined}
          />
        </Field>
        <Field label="Fin prévue" htmlFor="plannedEndAt">
          <Input
            id="plannedEndAt"
            name="plannedEndAt"
            type="datetime-local"
            required
            defaultValue={initialOrder ? toDatetimeLocalValue(initialOrder.plannedEndAt) : undefined}
          />
        </Field>
      </div>

      <p className="rounded-[var(--radius-control)] border border-line bg-surface-sunken px-3.5 py-2.5 text-[0.8125rem] text-fg-muted">
        La modification est enregistrée dans l’historique. Un chef d’atelier rattaché à un atelier ne peut sélectionner que ses propres presses.
      </p>

      <SubmitButton isEditing={Boolean(initialOrder)} />
      {state.message ? <p role="alert" className="text-[0.8125rem] text-critical">{state.message}</p> : null}
    </form>
  );
}

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {isEditing ? 'Mettre à jour le planning' : 'Enregistrer dans le planning'}
    </button>
  );
}
