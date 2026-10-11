'use client';

import { useActionState, useRef } from 'react';
import { assignEmployeeToMachineAction, type PlanningActionState } from '@/server/actions/planning';
import { cn } from '@/lib/cn';

/**
 * Affectation d'un opérateur à une presse, modifiable en place (§19).
 * Le select se soumet lui-même au changement : pas de bouton « Enregistrer »
 * séparé, l'action serveur revérifie tout (atelier, existence de la presse).
 */
export function AssignMachineSelect({
  employeeId,
  currentMachineId,
  machines,
}: {
  employeeId: string;
  currentMachineId: string | null;
  machines: { id: string; name: string; code: string; workshopName: string }[];
}) {
  const [state, formAction] = useActionState<PlanningActionState, FormData>(assignEmployeeToMachineAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <select
        key={currentMachineId ?? 'none'}
        name="machineId"
        defaultValue={currentMachineId ?? ''}
        onChange={() => formRef.current?.requestSubmit()}
        className={cn(
          'w-full max-w-[220px] rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-1.5 text-[0.8125rem] font-medium text-fg',
          'hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        )}
      >
        <option value="">Non affectée</option>
        {machines.map((machine) => (
          <option key={machine.id} value={machine.id}>
            {machine.workshopName} · {machine.name} ({machine.code})
          </option>
        ))}
      </select>
      {state.message ? <p role="alert" className="mt-1 text-xs text-critical">{state.message}</p> : null}
    </form>
  );
}
