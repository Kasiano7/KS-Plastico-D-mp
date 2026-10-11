import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/session';
import { getTwoFactorStatus } from '@/server/services/two-factor';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { TwoFactorSettings } from './two-factor-settings';

export const metadata: Metadata = { title: 'Sécurité du compte' };

/**
 * Accessible à tout utilisateur authentifié, sans permission particulière :
 * il s'agit toujours de SON PROPRE compte, jamais de celui d'un tiers (§
 * server/actions/two-factor.ts).
 */
export default async function AccountSecurityPage() {
  const user = await requireUser();
  const status = await getTwoFactorStatus(user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Sécurité du compte</h1>
        <p className="text-sm text-fg-muted">
          {user.fullName} — {user.email}
        </p>
      </div>

      <Panel>
        <PanelHeader title="Double authentification" />
        <div className="px-3.5 pb-4">
          <TwoFactorSettings enabled={status.enabled} remainingRecoveryCodes={status.remainingRecoveryCodes} />
        </div>
      </Panel>
    </div>
  );
}
