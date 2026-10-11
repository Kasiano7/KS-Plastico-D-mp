'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonClass } from '@/components/ui/primitives';
import { toggleUserActiveAction, type UserActionState } from '@/server/actions/users';

export function UserToggleActive({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState<UserActionState, FormData>(toggleUserActiveAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      <ToggleButton isActive={isActive} />
      {(state.message || state.errors?.length) ? (
        <span
          role="status"
          className={cn(
            'max-w-[200px] text-[0.6875rem] leading-tight',
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
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(isActive ? 'danger' : 'success', 'sm')}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isActive ? (
        'Désactiver'
      ) : (
        'Activer'
      )}
    </button>
  );
}
