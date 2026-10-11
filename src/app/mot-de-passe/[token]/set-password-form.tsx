'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import {
  setPasswordWithTokenAction,
  type SetPasswordState,
} from '@/server/actions/password-reset';
import { PASSWORD_MIN_LENGTH } from '@/server/domain/password-policy';

const FIELD =
  'flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 focus-within:border-[#2563eb]';
const INPUT =
  'min-w-0 flex-1 bg-transparent text-[0.875rem] text-white placeholder:text-white/25 focus:outline-none';

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<SetPasswordState, FormData>(
    setPasswordWithTokenAction,
    {},
  );

  if (state.ok) {
    return (
      <div className="mt-7 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#4ade80]/12 text-[#86efac]">
          <CheckCircle2 className="size-5" strokeWidth={2} />
        </span>
        <p className="mt-4 text-[0.9375rem] font-medium text-white">Mot de passe enregistré</p>
        <p className="mt-1.5 text-[0.8125rem] text-white/55">
          Connectez-vous avec votre nouveau mot de passe.
        </p>
        <Link
          href="/connexion"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#2563eb] to-[#3b82f6] px-5 text-[0.875rem] font-semibold text-white"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-7">
      <input type="hidden" name="token" value={token} />

      <label htmlFor="password" className="mb-2 block text-[0.8125rem] font-medium text-white/70">
        Nouveau mot de passe
      </label>
      <div className={FIELD}>
        <Lock aria-hidden className="size-[18px] shrink-0 text-white/35" strokeWidth={1.75} />
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoFocus
          className={INPUT}
        />
      </div>

      <label
        htmlFor="confirmation"
        className="mt-5 mb-2 block text-[0.8125rem] font-medium text-white/70"
      >
        Confirmation
      </label>
      <div className={FIELD}>
        <Lock aria-hidden className="size-[18px] shrink-0 text-white/35" strokeWidth={1.75} />
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          className={INPUT}
        />
      </div>

      {state.errors?.length ? (
        <ul
          role="alert"
          className="mt-5 space-y-1 rounded-xl border border-[#f87171]/25 bg-[#f87171]/10 px-3.5 py-2.5 text-[0.8125rem] text-[#fca5a5]"
        >
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 flex h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#3b82f6] text-[0.9375rem] font-semibold text-white disabled:opacity-70"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      Enregistrer
    </button>
  );
}
