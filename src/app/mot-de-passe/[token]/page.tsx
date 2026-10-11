import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { SetPasswordForm } from './set-password-form';
import { inspectPasswordToken } from '@/server/services/password-tokens';
import { TOKEN_STATE_MESSAGES } from '@/server/domain/password-tokens';

export const metadata: Metadata = { title: 'Définir votre mot de passe' };
export const dynamic = 'force-dynamic';

/**
 * Page publique de définition du mot de passe.
 *
 * Volontairement hors de la coquille authentifiée : celui qui arrive ici n'a
 * pas de session, et c'est le seul écran de l'application dans ce cas avec la
 * connexion.
 *
 * Le jeton est vérifié ici mais **pas consommé** : afficher le formulaire ne
 * doit pas brûler le lien. Un utilisateur qui ferme l'onglet doit pouvoir
 * revenir.
 */
export default async function SetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await inspectPasswordToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050a12] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1120]/85 p-7 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)] sm:p-9">
        {lookup.ok ? (
          <>
            <h1 className="text-[1.375rem] font-semibold tracking-tight text-white">
              {lookup.purpose === 'invitation'
                ? 'Bienvenue sur KS Plastico Demo'
                : 'Nouveau mot de passe'}
            </h1>
            <p className="mt-1.5 text-[0.8125rem] text-white/45">
              {lookup.purpose === 'invitation'
                ? `Bonjour ${lookup.fullName}, définissez le mot de passe qui ouvrira votre accès.`
                : `Bonjour ${lookup.fullName}, choisissez un nouveau mot de passe.`}
            </p>

            <SetPasswordForm token={token} />
          </>
        ) : (
          <div className="text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#f87171]/12 text-[#fca5a5]">
              <AlertTriangle className="size-5" strokeWidth={2} />
            </span>
            <h1 className="mt-4 text-[1.125rem] font-semibold text-white">Lien inutilisable</h1>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-white/55">
              {lookup.reason === 'unknown'
                ? 'Ce lien n’est pas valable. Il a peut-être été tronqué par votre messagerie.'
                : TOKEN_STATE_MESSAGES[lookup.reason]}
            </p>
            <Link
              href="/connexion"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#2563eb] to-[#3b82f6] px-5 text-[0.875rem] font-semibold text-white"
            >
              Retour à la connexion
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
