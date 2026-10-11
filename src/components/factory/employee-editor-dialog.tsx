'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import {
  createEmployeeAction,
  updateEmployeeAction,
  type EmployeeActionState,
} from '@/server/actions/employees';

const SHIFT_OPTIONS = [
  { value: 'morning', label: 'Matin' },
  { value: 'afternoon', label: 'Après-midi' },
  { value: 'night', label: 'Nuit' },
] as const;

export type EditableEmployee = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  workshopId: string | null;
  jobTitle: string;
  shift: string;
  hourlyCostCents: number;
  hiredAt: string | null;
};

/** Création et modification d'une fiche salarié — même formulaire, action serveur différente. */
export function EmployeeEditorDialog({
  employee,
  workshops,
}: {
  employee: EditableEmployee | null;
  workshops: { id: string; name: string }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const action = employee ? updateEmployeeAction : createEmployeeAction;
  const [state, formAction] = useActionState<EmployeeActionState, FormData>(action, {});
  // Toutes les instances (une par ligne + création) sont montées en même
  // temps : les id doivent être uniques pour que les <label htmlFor> ciblent
  // le bon champ.
  const uid = employee?.id ?? 'new';

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass(employee ? 'ghost' : 'primary', 'sm', employee ? 'px-2' : undefined)}
        title={employee ? 'Modifier la fiche' : 'Nouveau salarié'}
        aria-label={employee ? `Modifier la fiche de ${employee.firstName} ${employee.lastName}` : 'Nouveau salarié'}
      >
        {employee ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
        {employee ? null : 'Nouveau salarié'}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => formRef.current?.reset()}
        className="w-full max-w-lg rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xl backdrop:bg-fg/20 open:flex open:flex-col open:gap-4"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-fg">
            {employee ? 'Modifier la fiche' : 'Nouveau salarié'}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={buttonClass('ghost', 'sm', 'px-2')}
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          {employee ? <input type="hidden" name="employeeId" value={employee.id} /> : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" htmlFor={`employee-first-name-${uid}`}>
              <Input id={`employee-first-name-${uid}`} name="firstName" required defaultValue={employee?.firstName} />
            </Field>
            <Field label="Nom" htmlFor={`employee-last-name-${uid}`}>
              <Input id={`employee-last-name-${uid}`} name="lastName" required defaultValue={employee?.lastName} />
            </Field>
            <Field label="Matricule" htmlFor={`employee-matricule-${uid}`} hint="Identifiant unique.">
              <Input id={`employee-matricule-${uid}`} name="matricule" required defaultValue={employee?.matricule} />
            </Field>
            <Field label="Poste" htmlFor={`employee-job-title-${uid}`}>
              <Input id={`employee-job-title-${uid}`} name="jobTitle" required defaultValue={employee?.jobTitle} />
            </Field>
            <Field label="Atelier" htmlFor={`employee-workshop-${uid}`}>
              <Select id={`employee-workshop-${uid}`} name="workshopId" defaultValue={employee?.workshopId ?? ''}>
                <option value="">— Aucun —</option>
                {workshops.map((workshop) => (
                  <option key={workshop.id} value={workshop.id}>
                    {workshop.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Équipe" htmlFor={`employee-shift-${uid}`}>
              <Select id={`employee-shift-${uid}`} name="shift" required defaultValue={employee?.shift ?? 'morning'}>
                {SHIFT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Coût horaire chargé (€/h)" htmlFor={`employee-cost-${uid}`}>
              <Input
                id={`employee-cost-${uid}`}
                name="hourlyCostEuros"
                type="number"
                min={0}
                step="0.01"
                defaultValue={employee ? (employee.hourlyCostCents / 100).toFixed(2) : undefined}
              />
            </Field>
            <Field label="Date d'embauche" htmlFor={`employee-hired-at-${uid}`}>
              <Input
                id={`employee-hired-at-${uid}`}
                name="hiredAt"
                type="date"
                defaultValue={employee?.hiredAt?.slice(0, 10)}
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
            <SubmitButton create={!employee} />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SubmitButton({ create }: { create: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'sm')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : create ? 'Créer la fiche' : 'Enregistrer'}
    </button>
  );
}
