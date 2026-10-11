'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Select, buttonClass } from '@/components/ui/primitives';
import { assignRoleAction, type RoleActionState } from '@/server/actions/roles';

/**
 * Affectation d'un rôle à un utilisateur.
 * Sans elle, créer un rôle ne servirait à rien : c'est la contrepartie
 * indispensable de l'administration des rôles.
 */
export function UserRoleSelect({
  userId,
  currentRoleId,
  roles,
}: {
  userId: string;
  currentRoleId: string;
  roles: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<RoleActionState, FormData>(assignRoleAction, {});

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <Select
        name="roleId"
        defaultValue={currentRoleId}
        aria-label="Rôle de l’utilisateur"
        className="h-8 w-[190px] text-[0.8125rem]"
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </Select>
      <ApplyButton />
      {state.message || state.errors?.length ? (
        <span
          role="status"
          className={cn('max-w-[220px] text-[0.6875rem]', state.ok ? 'text-normal' : 'text-critical')}
        >
          {state.message ?? state.errors?.[0]}
        </span>
      ) : null}
    </form>
  );
}

function ApplyButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Appliquer le rôle"
      title="Appliquer le rôle"
      className={buttonClass('secondary', 'sm', 'px-2')}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
    </button>
  );
}
