'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Pencil, X } from 'lucide-react';
import { Field, Input, buttonClass } from '@/components/ui/primitives';
import { updateCostModelAction, type CostModelActionState } from '@/server/actions/cost-models';

export type EditableCostModel = {
  id: string;
  name: string;
  energyCentsPerHour: number;
  laborCentsPerHour: number;
  overheadCentsPerHour: number;
  consumablesCentsPerHour: number;
};

export function CostModelEditDialog({ model }: { model: EditableCostModel }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState<CostModelActionState, FormData>(
    updateCostModelAction,
    {},
  );

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass('ghost', 'sm', 'px-2')}
        title="Modifier le modèle de coût"
        aria-label={`Modifier le modèle de coût ${model.name}`}
      >
        <Pencil className="size-3.5" />
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xl backdrop:bg-fg/20 open:flex open:flex-col open:gap-4"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-fg">Modifier le modèle de coût</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={buttonClass('ghost', 'sm', 'px-2')}
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-fg-muted">
          Ces tarifs alimentent immédiatement tous les calculs d&apos;impact financier et de
          rentabilité de l&apos;application.
        </p>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="costModelId" value={model.id} />

          <Field label="Nom du modèle" htmlFor={`cost-model-name-${model.id}`}>
            <Input id={`cost-model-name-${model.id}`} name="name" required defaultValue={model.name} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Énergie (€/h)" htmlFor={`cost-model-energy-${model.id}`}>
              <Input
                id={`cost-model-energy-${model.id}`}
                name="energyEuros"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={(model.energyCentsPerHour / 100).toFixed(2)}
              />
            </Field>
            <Field label="Main-d'œuvre (€/h)" htmlFor={`cost-model-labor-${model.id}`}>
              <Input
                id={`cost-model-labor-${model.id}`}
                name="laborEuros"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={(model.laborCentsPerHour / 100).toFixed(2)}
              />
            </Field>
            <Field label="Frais généraux (€/h)" htmlFor={`cost-model-overhead-${model.id}`}>
              <Input
                id={`cost-model-overhead-${model.id}`}
                name="overheadEuros"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={(model.overheadCentsPerHour / 100).toFixed(2)}
              />
            </Field>
            <Field label="Consommables (€/h)" htmlFor={`cost-model-consumables-${model.id}`}>
              <Input
                id={`cost-model-consumables-${model.id}`}
                name="consumablesEuros"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={(model.consumablesCentsPerHour / 100).toFixed(2)}
              />
            </Field>
          </div>

          {state.errors?.length ? (
            <ul className="space-y-0.5 text-xs text-critical">
              {state.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : state.message && !state.ok ? (
            <p className="text-xs text-critical">{state.message}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
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
