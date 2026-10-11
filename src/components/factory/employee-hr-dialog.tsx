'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { CalendarOff, Loader2, ShieldPlus, X } from 'lucide-react';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import {
  addQualificationAction,
  assignSkillAction,
  declareAbsenceAction,
  type EmployeeActionState,
} from '@/server/actions/employees';

const ABSENCE_OPTIONS = [
  { value: 'holiday', label: 'Congés' },
  { value: 'sick_leave', label: 'Arrêt maladie' },
  { value: 'training', label: 'Formation' },
  { value: 'unpaid', label: 'Sans solde' },
  { value: 'other', label: 'Autre' },
] as const;

const QUALIFICATION_OPTIONS = [
  { value: 'sst', label: 'SST' },
  { value: 'caces', label: 'CACES' },
  { value: 'electrical', label: 'Habilitation électrique' },
  { value: 'forklift', label: 'Chariot élévateur' },
  { value: 'machine', label: 'Machine' },
  { value: 'safety', label: 'Sécurité' },
  { value: 'other', label: 'Autre' },
] as const;

/**
 * Déclarer une absence et ajouter une habilitation ou une compétence pour un
 * salarié — trois formulaires courts plutôt qu'une page dédiée : ce sont des
 * gestes ponctuels, pas une fiche à maintenir en continu.
 */
export function EmployeeHrDialog({
  employee,
  skills,
}: {
  employee: { id: string; firstName: string; lastName: string };
  skills: { id: string; name: string }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass('ghost', 'sm', 'px-2')}
        title="Absence, habilitation, compétence"
        aria-label={`Déclarer une absence ou une habilitation pour ${employee.firstName} ${employee.lastName}`}
      >
        <CalendarOff className="size-3.5" />
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xl backdrop:bg-fg/20 open:flex open:flex-col open:gap-5"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-fg">
            {employee.firstName} {employee.lastName}
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

        <AbsenceForm employeeId={employee.id} />
        <div className="border-t border-line" />
        <QualificationForm employeeId={employee.id} />
        {skills.length > 0 ? (
          <>
            <div className="border-t border-line" />
            <SkillForm employeeId={employee.id} skills={skills} />
          </>
        ) : null}
      </dialog>
    </>
  );
}

function AbsenceForm({ employeeId }: { employeeId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<EmployeeActionState, FormData>(declareAbsenceAction, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="text-[0.8125rem] font-semibold text-fg">Déclarer une absence</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor={`absence-type-${employeeId}`}>
          <Select id={`absence-type-${employeeId}`} name="type" required defaultValue="holiday">
            {ABSENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Motif (optionnel)" htmlFor={`absence-reason-${employeeId}`}>
          <Input id={`absence-reason-${employeeId}`} name="reason" />
        </Field>
        <Field label="Début" htmlFor={`absence-start-${employeeId}`}>
          <Input id={`absence-start-${employeeId}`} name="startsAt" type="date" required />
        </Field>
        <Field label="Fin" htmlFor={`absence-end-${employeeId}`}>
          <Input id={`absence-end-${employeeId}`} name="endsAt" type="date" required />
        </Field>
      </div>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-normal' : 'text-critical'}`}>
          {state.errors?.[0] ?? state.message}
        </p>
      ) : null}
      <MiniSubmitButton label="Déclarer l'absence" />
    </form>
  );
}

function QualificationForm({ employeeId }: { employeeId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<EmployeeActionState, FormData>(addQualificationAction, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-fg">
        <ShieldPlus className="size-3.5" />
        Ajouter une habilitation
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor={`qualif-kind-${employeeId}`}>
          <Select id={`qualif-kind-${employeeId}`} name="kind" required defaultValue="sst">
            {QUALIFICATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Libellé" htmlFor={`qualif-label-${employeeId}`}>
          <Input id={`qualif-label-${employeeId}`} name="label" required placeholder="SST initiale" />
        </Field>
        <Field label="Obtenue le" htmlFor={`qualif-obtained-${employeeId}`}>
          <Input id={`qualif-obtained-${employeeId}`} name="obtainedAt" type="date" required />
        </Field>
        <Field label="Expire le (optionnel)" htmlFor={`qualif-expires-${employeeId}`}>
          <Input id={`qualif-expires-${employeeId}`} name="expiresAt" type="date" />
        </Field>
      </div>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-normal' : 'text-critical'}`}>
          {state.errors?.[0] ?? state.message}
        </p>
      ) : null}
      <MiniSubmitButton label="Ajouter" />
    </form>
  );
}

function SkillForm({ employeeId, skills }: { employeeId: string; skills: { id: string; name: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<EmployeeActionState, FormData>(assignSkillAction, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="text-[0.8125rem] font-semibold text-fg">Ajouter une compétence</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Compétence" htmlFor={`skill-id-${employeeId}`}>
          <Select id={`skill-id-${employeeId}`} name="skillId" required defaultValue="">
            <option value="" disabled>
              — Choisir —
            </option>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Niveau (1 à 4)" htmlFor={`skill-level-${employeeId}`}>
          <Input id={`skill-level-${employeeId}`} name="level" type="number" min={1} max={4} defaultValue={1} />
        </Field>
      </div>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-normal' : 'text-critical'}`}>
          {state.errors?.[0] ?? state.message}
        </p>
      ) : null}
      <MiniSubmitButton label="Ajouter" />
    </form>
  );
}

function MiniSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass('secondary', 'sm', 'self-start')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : label}
    </button>
  );
}
