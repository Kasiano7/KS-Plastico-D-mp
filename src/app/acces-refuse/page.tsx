import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { getCurrentUser } from '@/server/auth/session';
import { buttonClass } from '@/components/ui/primitives';
import { DemoBar } from '@/components/shell/demo-bar';
import { DEMO_ROLES, isDemoMode } from '@/config/demo';
import { currentDemoRole, isDemoEmbed } from '@/server/demo/identity';

export const metadata: Metadata = { title: 'Accès refusé' };

export default async function AccessDeniedPage() {
  const user = await getCurrentUser();
  // En démonstration, le bandeau reste visible ici aussi : c'est précisément
  // la page où le visiteur a besoin de changer de point de vue.
  const demo = isDemoMode()
    ? {
        roles: DEMO_ROLES.map(({ key, label }) => ({ key, label })),
        currentRole: await currentDemoRole(),
        embed: await isDemoEmbed(),
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      {demo ? <DemoBar {...demo} /> : null}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning">
            <ShieldAlert className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-fg">Accès refusé</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Cette page n’est pas accessible avec le rôle
            {user ? ` « ${user.roleLabel} »` : ''}.{' '}
            {demo
              ? 'Changez de point de vue dans le bandeau ci-dessus pour la consulter.'
              : 'Si vous avez besoin de ce périmètre, demandez une extension de droits à la direction.'}
          </p>
          <Link href="/" className={buttonClass('secondary', 'md', 'mt-6')}>
            Retour à l’accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
