'use client';

import { useActionState, useState, useSyncExternalStore, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { loginAction, verifyTwoFactorLoginAction, type LoginState } from '@/server/actions/auth';
import {
  requestPasswordResetAction,
  type ResetRequestState,
} from '@/server/actions/password-reset';
import { Logo } from '@/components/shell/logo';
import { cn } from '@/lib/cn';

/**
 * Carte de connexion.
 *
 * Elle reprend les couleurs sombres de la page plutôt que les jetons de thème :
 * l'écran de connexion est identique pour tous, quel que soit le thème choisi
 * ensuite dans l'application.
 */

const FIELD_SHELL =
  'flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 transition-colors focus-within:border-[#2563eb] focus-within:bg-white/[0.05]';

const FIELD_INPUT =
  'min-w-0 flex-1 bg-transparent text-[0.875rem] text-white placeholder:text-white/25 focus:outline-none';

const LABEL = 'mb-2 block text-[0.8125rem] font-medium text-white/70';

/** Mémorise l'identifiant saisi — jamais le mot de passe, jamais la session. */
const REMEMBERED_EMAIL_KEY = 'app-remembered-email';

const DEMO_ACCOUNTS = [
  { email: 'direction@demo.example', role: 'Direction — accès complet' },
  { email: 'production@demo.example', role: 'Responsable de production' },
  { email: 'atelier@demo.example', role: "Chef d'atelier — atelier B" },
  { email: 'maintenance@demo.example', role: 'Responsable maintenance' },
  { email: 'rh@demo.example', role: 'Responsable RH' },
  { email: 'stock@demo.example', role: 'Responsable stock' },
  { email: 'operateur@demo.example', role: 'Opérateur — poste simplifié' },
];

export function LoginCard() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div className="relative w-full">
      {/*
        Contour lumineux animé.

        Une traîne claire fait lentement le tour du cadre. L'effet est porté
        par deux couches : le liseré lui-même, et une lueur floutée qui déborde
        pour que la carte semble éclairée par son propre contour.

        Toute la mécanique — masque, dégradé conique, angle animable — vit dans
        `globals.css` : c'est du design system, pas de la mise en page, et
        d'autres cartes pourront la réutiliser.

        L'animation s'arrête d'elle-même si le système demande moins de
        mouvement : la règle `prefers-reduced-motion` de `globals.css`
        neutralise toutes les animations. Le contour reste alors visible, fixe.
      */}
      <span
        aria-hidden
        className="animated-border pointer-events-none absolute -inset-px rounded-[calc(1rem+1px)]"
      />

      <span
        aria-hidden
        className="animated-border-glow pointer-events-none absolute -inset-5 -z-10 rounded-3xl blur-2xl"
      />

      <div className="relative rounded-2xl border border-white/10 bg-[#0a1120]/85 p-7 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:p-9">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-[70px] place-items-center rounded-2xl border border-[#2563eb]/40 bg-gradient-to-b from-[#16305c] to-[#0e1c34] shadow-[0_0_36px_-10px_rgb(37_99_235/0.8)]">
            <Logo compact className="scale-[1.6]" />
          </span>

          <h1 className="mt-6 text-[1.5rem] font-semibold tracking-tight text-white">Connexion</h1>
          <p className="mt-1.5 text-[0.8125rem] text-white/45">
            Accédez à votre espace KS Plastico Demo
          </p>
        </div>

        {state.requiresTwoFactor ? <TwoFactorStep /> : <CredentialsStep formAction={formAction} state={state} />}
      </div>
    </div>
  );
}

/* ── Étape 1 — identifiants ───────────────────────────────────────────────── */

/** Aucun abonnement : la valeur ne change que par nos propres écritures. */
const noSubscribe = () => () => {};

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';
  } catch {
    // Stockage indisponible (navigation privée) : on repart d'un champ vide.
    return '';
  }
}

function CredentialsStep({
  formAction,
  state,
}: {
  formAction: (formData: FormData) => void;
  state: LoginState;
}) {
  /*
   * L'identifiant mémorisé est lu via `useSyncExternalStore` plutôt que dans
   * un effet : le rendu serveur reçoit une chaîne vide, le client la remplace
   * après hydratation. Pas de divergence d'hydratation, pas de `setState`
   * dans un effet.
   */
  const rememberedEmail = useSyncExternalStore(noSubscribe, readRememberedEmail, () => '');

  // `null` = l'utilisateur n'a rien touché, on suit la valeur mémorisée.
  const [typedEmail, setTypedEmail] = useState<string | null>(null);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const email = typedEmail ?? rememberedEmail;
  const remember = choice ?? rememberedEmail !== '';

  function setEmail(value: string) {
    setTypedEmail(value);
  }

  function persistEmail() {
    try {
      if (remember && email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    } catch {
      // Sans stockage, la case reste sans effet : ce n'est pas bloquant.
    }
  }

  return (
    <form action={formAction} onSubmit={persistEmail} className="mt-8">
      <div>
        <label htmlFor="email" className={LABEL}>
          Adresse e-mail
        </label>
        <div className={FIELD_SHELL}>
          <Mail aria-hidden className="size-[18px] shrink-0 text-white/35" strokeWidth={1.75} />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nom@entreprise.com"
            className={FIELD_INPUT}
          />
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="password" className={LABEL}>
          Mot de passe
        </label>
        <div className={FIELD_SHELL}>
          <Lock aria-hidden className="size-[18px] shrink-0 text-white/35" strokeWidth={1.75} />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            className={FIELD_INPUT}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="shrink-0 rounded-md p-1 text-white/35 transition-colors hover:text-white/70"
          >
            {showPassword ? (
              <EyeOff className="size-[18px]" strokeWidth={1.75} />
            ) : (
              <Eye className="size-[18px]" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-[0.8125rem] text-white/65">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setChoice(event.target.checked)}
            className="size-4 shrink-0 rounded border-white/20 bg-white/5 accent-[#2563eb]"
          />
          Se souvenir de moi
        </label>

        <button
          type="button"
          onClick={() => setShowHelp((value) => !value)}
          aria-expanded={showHelp}
          className="text-[0.8125rem] font-medium text-[#5b9dff] transition-colors hover:text-[#82b4ff]"
        >
          Mot de passe oublié ?
        </button>
      </div>

      {showHelp ? <ForgotPassword email={email} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-[#f87171]/25 bg-[#f87171]/10 px-3.5 py-2.5 text-[0.8125rem] text-[#fca5a5]"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton label="Se connecter" pendingLabel="Connexion…" />

      <DemoAccounts onPick={setEmail} />
    </form>
  );
}

/* ── Étape 2 — double authentification ────────────────────────────────────── */

function TwoFactorStep() {
  const [state, formAction] = useActionState<LoginState, FormData>(verifyTwoFactorLoginAction, {
    requiresTwoFactor: true,
  });

  return (
    <form action={formAction} className="mt-8">
      <p className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-[#2563eb]/25 bg-[#2563eb]/10 px-3.5 py-2.5 text-[0.8125rem] text-[#9dc0ff]">
        <ShieldCheck className="size-4 shrink-0" strokeWidth={2} />
        Double authentification
      </p>

      <label htmlFor="code" className={LABEL}>
        Code à 6 chiffres, ou code de secours
      </label>
      <div className={FIELD_SHELL}>
        <Lock aria-hidden className="size-[18px] shrink-0 text-white/35" strokeWidth={1.75} />
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="123456"
          className={cn(FIELD_INPUT, 'tracking-[0.3em]')}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-[#f87171]/25 bg-[#f87171]/10 px-3.5 py-2.5 text-[0.8125rem] text-[#fca5a5]"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton label="Valider" pendingLabel="Vérification…" />
    </form>
  );
}

/* ── Éléments partagés ────────────────────────────────────────────────────── */

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 flex h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#3b82f6] text-[0.9375rem] font-semibold text-white shadow-[0_14px_36px_-14px_rgb(37_99_235/0.9)] transition-[filter,transform] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1120] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="size-[18px]" strokeWidth={2} />
        </>
      )}
    </button>
  );
}

/**
 * Comptes de démonstration — repliés par défaut.
 * Cliquer sur une ligne remplit le champ e-mail : c'est ce qui remplace
 * l'adresse pré-saisie en dur qui figurait auparavant dans le formulaire.
 */
function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  return (
    <details className="mt-7 border-t border-white/[0.07] pt-5">
      <summary className="cursor-pointer list-none text-[0.75rem] font-medium text-white/40 transition-colors hover:text-white/70">
        Comptes de démonstration
      </summary>

      <p className="mt-3 text-[0.6875rem] text-white/40">
        Mot de passe commun :{' '}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-white/70">
          Demo-9b8d8-2kx8w
        </code>
      </p>

      <ul className="mt-3 space-y-1">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => onPick(account.email)}
              className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="truncate font-mono text-[0.6875rem] text-white/70">
                {account.email}
              </span>
              <span className="shrink-0 text-[0.625rem] text-white/35">{account.role}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Demande de réinitialisation.
 *
 * Dépliée sous le formulaire plutôt que sur une page à part : celui qui a
 * oublié son mot de passe a déjà saisi son adresse juste au-dessus, il ne doit
 * pas la retaper ailleurs.
 *
 * La réponse est **toujours la même**, que le compte existe ou non : afficher
 * « aucun compte pour cette adresse » ferait de l'écran de connexion un
 * annuaire des adresses valides de l'entreprise.
 */
function ForgotPassword({ email }: { email: string }) {
  const [state, formAction] = useActionState<ResetRequestState, FormData>(
    requestPasswordResetAction,
    {},
  );
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState(email);

  if (state.message) {
    return (
      <p
        role="status"
        className="mt-3 rounded-xl border border-[#2563eb]/25 bg-[#2563eb]/10 px-3.5 py-2.5 text-[0.75rem] leading-relaxed text-[#9dc0ff]"
      >
        {state.message}
      </p>
    );
  }

  /*
   * L'action est déclenchée à la main, sans second `<form>`.
   *
   * Ce bloc vit à l'intérieur du formulaire de connexion, et imbriquer deux
   * `<form>` est invalide en HTML : le navigateur en supprime un et React
   * signale une erreur d'hydratation. Construire le `FormData` soi-même évite
   * le problème sans déplacer le bloc loin du lien qui l'ouvre.
   */
  function submit() {
    const data = new FormData();
    data.set('email', address);
    startTransition(() => formAction(data));
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <p className="text-[0.75rem] leading-relaxed text-white/55">
        Saisissez votre adresse : un lien de réinitialisation vous sera envoyé. Il est valable une
        heure et ne fonctionne qu’une fois.
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {/*
          Pré-rempli avec l'adresse déjà saisie plus haut, et modifiable : on
          peut s'être trompé de compte.
        */}
        <input
          type="email"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Sans cela, Entrée soumettrait le formulaire de connexion.
              event.preventDefault();
              submit();
            }
          }}
          placeholder="nom@entreprise.com"
          aria-label="Adresse e-mail pour la réinitialisation"
          className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[0.8125rem] text-white placeholder:text-white/25 focus:border-[#2563eb] focus:outline-none"
        />

        <button
          type="button"
          onClick={submit}
          disabled={pending || address.trim() === ''}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3.5 text-[0.8125rem] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Envoyer le lien
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-[0.75rem] text-[#fca5a5]">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

