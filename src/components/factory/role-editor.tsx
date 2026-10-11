'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  Badge,
  Card,
  CardHeader,
  Field,
  Input,
  Textarea,
  buttonClass,
} from '@/components/ui/primitives';
import { PERMISSIONS, type PermissionCode } from '@/server/domain/permissions';
import { DOMAIN_LABELS, slugifyRoleCode } from '@/server/domain/roles';
import {
  createRoleAction,
  deleteRoleAction,
  updateRoleAction,
  type RoleActionState,
} from '@/server/actions/roles';

type DomainGroup = { domain: string; permissions: PermissionCode[] };

export type RoleEditorRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionCode[];
  userCount: number;
};

/**
 * Éditeur de rôle (§8, §45).
 *
 * La matrice de permissions est le cœur de l'écran : elle affiche exactement
 * ce que le rôle pourra faire, domaine par domaine, dans le vocabulaire de
 * l'application. Les garde-fous restent serveur — cet écran ne fait que les
 * rendre lisibles.
 */
export function RoleEditor({
  role,
  groups,
  mode,
}: {
  role: RoleEditorRole | null;
  groups: DomainGroup[];
  mode: 'create' | 'edit';
}) {
  const action = mode === 'create' ? createRoleAction : updateRoleAction;
  const [state, formAction] = useActionState<RoleActionState, FormData>(action, {});

  const [name, setName] = useState(role?.name ?? '');
  const [code, setCode] = useState(role?.code ?? '');
  const [codeTouched, setCodeTouched] = useState(mode === 'edit');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role?.permissions ?? ['dashboard:read']),
  );

  const derivedCode = useMemo(
    () => (codeTouched ? code : slugifyRoleCode(name || '')),
    [code, codeTouched, name],
  );

  function toggle(permission: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  function toggleDomain(group: DomainGroup) {
    const allSelected = group.permissions.every((permission) => selected.has(permission));
    setSelected((previous) => {
      const next = new Set(previous);
      for (const permission of group.permissions) {
        if (allSelected) next.delete(permission);
        else next.add(permission);
      }
      return next;
    });
  }

  const grantsAdmin = selected.has('admin:write');

  return (
    <form action={formAction} className="space-y-5">
      {role ? <input type="hidden" name="roleId" value={role.id} /> : null}
      {[...selected].map((permission) => (
        <input key={permission} type="hidden" name="permissions" value={permission} />
      ))}

      <Card>
        <CardHeader
          title="Identité du rôle"
          subtitle={
            role?.isSystem
              ? 'Rôle livré avec l’application : le code technique est figé, les permissions restent modifiables.'
              : 'Le code technique est dérivé du nom, vous pouvez l’ajuster.'
          }
          action={
            role ? (
              <span className="text-xs text-fg-subtle">
                {role.userCount} utilisateur{role.userCount > 1 ? 's' : ''}
              </span>
            ) : null
          }
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Nom du rôle" htmlFor="name" hint="Affiché partout dans l’application.">
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Responsable qualité"
            />
          </Field>

          <Field
            label="Code technique"
            htmlFor="code"
            hint={role?.isSystem ? 'Non modifiable sur un rôle système.' : 'Minuscules, chiffres et tirets bas.'}
          >
            <Input
              id="code"
              name="code"
              value={derivedCode}
              disabled={role?.isSystem}
              onChange={(event) => {
                setCodeTouched(true);
                setCode(event.target.value);
              }}
              placeholder="responsable_qualite"
            />
          </Field>

          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={role?.description ?? ''}
              placeholder="Périmètre du rôle, en une phrase."
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Permissions"
          subtitle="Ce que ce rôle pourra consulter et modifier. Chaque case est vérifiée côté serveur."
          action={
            <span className="text-xs text-fg-subtle">
              {selected.size} / {Object.keys(PERMISSIONS).length} accordée(s)
            </span>
          }
        />

        <div className="space-y-4 px-5 pb-5">
          {grantsAdmin ? (
            <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[0.8125rem] text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              Ce rôle pourra créer, modifier et supprimer des rôles, donc modifier les droits de
              toute l’usine.
            </p>
          ) : null}

          {groups.map((group) => {
            const allSelected = group.permissions.every((permission) => selected.has(permission));
            const someSelected = group.permissions.some((permission) => selected.has(permission));

            return (
              <fieldset key={group.domain} className="rounded-[var(--radius-control)] border border-line">
                <legend className="sr-only">{DOMAIN_LABELS[group.domain] ?? group.domain}</legend>

                <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-sunken px-3.5 py-2">
                  <span className="text-[0.8125rem] font-medium text-fg">
                    {DOMAIN_LABELS[group.domain] ?? group.domain}
                    {someSelected && !allSelected ? (
                      <Badge className="ml-2">partiel</Badge>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDomain(group)}
                    className="text-[0.75rem] font-medium text-brand hover:underline"
                  >
                    {allSelected ? 'Tout retirer' : 'Tout accorder'}
                  </button>
                </div>

                <div className="grid gap-x-6 gap-y-1 p-3 sm:grid-cols-2">
                  {group.permissions.map((permission) => (
                    <label
                      key={permission}
                      className="flex cursor-pointer items-start gap-2.5 rounded px-1.5 py-1.5 hover:bg-surface-sunken"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(permission)}
                        onChange={() => toggle(permission)}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] leading-snug text-fg">
                          {PERMISSIONS[permission]}
                        </span>
                        <span className="block font-mono text-[0.6875rem] text-fg-subtle">
                          {permission}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </Card>

      {state.errors && state.errors.length > 0 ? (
        <div
          role="alert"
          className="rounded-[var(--radius-card)] border border-critical/30 bg-critical-soft px-4 py-3"
        >
          <p className="text-[0.8125rem] font-medium text-critical">Modification refusée</p>
          <ul className="mt-1.5 space-y-1 text-[0.8125rem] text-critical">
            {state.errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className={cn(
            'rounded-[var(--radius-control)] px-3.5 py-2.5 text-[0.8125rem]',
            state.ok ? 'bg-normal-soft text-normal' : 'bg-critical-soft text-critical',
          )}
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton label={mode === 'create' ? 'Créer le rôle' : 'Enregistrer les modifications'} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {label}
    </button>
  );
}

/**
 * Suppression — formulaire séparé, rendu hors de l'éditeur : imbriquer deux
 * formulaires est invalide en HTML, et une suppression ne doit pas partager le
 * bouton d'enregistrement.
 */
export function DeleteRoleForm({ roleId, roleName }: { roleId: string; roleName: string }) {
  const [state, formAction] = useActionState<RoleActionState, FormData>(deleteRoleAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="roleId" value={roleId} />

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-critical/30 bg-critical-soft px-4 py-3">
          <span className="text-[0.8125rem] text-fg">
            Supprimer définitivement le rôle « {roleName} » ?
          </span>
          <SubmitDelete />
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={buttonClass('ghost', 'sm')}
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={buttonClass('ghost', 'md', 'text-critical hover:bg-critical-soft')}
        >
          <Trash2 className="size-4" />
          Supprimer le rôle
        </button>
      )}

      {state.errors && state.errors.length > 0 ? (
        <ul role="alert" className="mt-2 space-y-1 text-[0.8125rem] text-critical">
          {state.errors.map((error, index) => (
            <li key={index}>• {error}</li>
          ))}
        </ul>
      ) : null}
      {state.message ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-critical">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function SubmitDelete() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass('danger', 'sm')}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      Confirmer la suppression
    </button>
  );
}
