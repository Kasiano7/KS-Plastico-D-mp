'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonClass } from '@/components/ui/primitives';
import { toggleEmployeeActiveAction, type EmployeeActionState } from '@/server/actions/employees';

export function EmployeeToggleActive({ employeeId, isActive }: { employeeId: string; isActive: boolean }) {
  const [state, formAction] = useActionState<EmployeeActionState, FormData>(
    toggleEmployeeActiveAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="employeeId" value={employeeId} />
      <ToggleButton isActive={isActive} />
      {state.message || state.errors?.length ? (
        <span
          role="status"
          className={cn(
            'max-w-[160px] text-[0.6875rem] leading-tight',
            state.ok ? 'text-normal' : 'text-critical',
          )}
        >
          {state.message ?? state.errors?.[0]}
        </span>
      ) : null}
    </form>
  );
}

function ToggleButton({ isActive }: { isActive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(isActive ? 'danger' : 'success', 'sm')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : isActive ? 'Désactiver' : 'Activer'}
    </button>
  );
}
