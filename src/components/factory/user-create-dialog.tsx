'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { createUserAction, type UserActionState } from '@/server/actions/users';

const PASSWORD_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%&*';

function generatePassword(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length]).join('');
}

export function UserCreateDialog({
  roles,
}: {
  roles: { id: string; name: string }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<UserActionState, FormData>(createUserAction, {});
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  function handleGenerate() {
    const pwd = generatePassword();
    setPassword(pwd);
    setShowPassword(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass('primary', 'sm')}
      >
        <Plus className="size-3.5" />
        Nouvel utilisateur
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => { formRef.current?.reset(); setPassword(''); setShowPassword(false); }}
        className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xl backdrop:bg-fg/20 open:flex open:flex-col open:gap-4"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-fg">Nouvel utilisateur</h2>
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
          <Field label="Nom complet" htmlFor="new-user-name">
            <Input
              id="new-user-name"
              name="fullName"
              placeholder="Marie Dupont"
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Adresse e-mail" htmlFor="new-user-email">
            <Input
              id="new-user-email"
              type="email"
              name="email"
              placeholder="marie.dupont@demo.example"
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Mot de passe initial" htmlFor="new-user-password">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="new-user-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="········"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 flex items-center text-fg-subtle hover:text-fg"
                  aria-label={showPassword ? 'Masquer' : 'Afficher'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                className={buttonClass('secondary', 'sm', 'shrink-0')}
                title="Générer un mot de passe aléatoire"
              >
                <RefreshCw className="size-3.5" />
                Générer le MDP
              </button>
            </div>
            <p className="text-xs text-fg-subtle">8 caractères minimum.</p>
          </Field>
          <Field label="Rôle" htmlFor="new-user-role">
            <Select id="new-user-role" name="roleId" required defaultValue="">
              <option value="" disabled>
                — Choisir un rôle —
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

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
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Créer le compte'}
    </button>
  );
}
