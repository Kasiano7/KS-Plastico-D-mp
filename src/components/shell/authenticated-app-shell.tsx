import { cookies } from 'next/headers';
import { AppShell, SIDEBAR_COOKIE } from '@/components/shell/app-shell';
import { navItemsFor } from '@/config/navigation';
import { logoutAction } from '@/server/actions/auth';
import { requireUser } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getFactoryContext, getOpenAlertCount } from '@/server/services/factory-context';
import { SEVERITY_LABELS } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { DASHBOARD_AI_SUGGESTIONS } from '@/server/services/dashboard';
import { DEMO_ROLES, isDemoBlockedPath, isDemoMode } from '@/config/demo';
import { currentDemoRole, isDemoEmbed } from '@/server/demo/identity';

/**
 * Coquille authentifiée partagée par l'accueil et les pages métier.
 * La variante dashboard conserve la navigation historique tout en donnant au
 * nouveau tableau de bord son thème sombre et toute la largeur disponible.
 */
export async function AuthenticatedAppShell({
  children,
  dashboard = false,
}: {
  children: React.ReactNode;
  dashboard?: boolean;
}) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === 'true';

  const canSeeDashboard = can(user.permissions, 'dashboard:read');
  const demoMode = isDemoMode();
  const [openAlerts, context, demoRole, demoEmbed] = await Promise.all([
    can(user.permissions, 'alerts:read') ? getOpenAlertCount() : Promise.resolve(0),
    canSeeDashboard ? getFactoryContext() : Promise.resolve(null),
    demoMode ? currentDemoRole() : Promise.resolve(null),
    demoMode ? isDemoEmbed() : Promise.resolve(false),
  ]);

  // En démonstration, l'administration redirige vers /demo : ne pas la proposer.
  const allowedHrefs = navItemsFor(user.permissions)
    .map((item) => item.href)
    .filter((href) => !(demoMode && isDemoBlockedPath(href)));

  return (
    <AppShell
      user={{ fullName: user.fullName, email: user.email, roleLabel: user.roleLabel }}
      allowedHrefs={allowedHrefs}
      openAlerts={openAlerts}
      status={
        context
          ? {
              score: context.health.global,
              severity: context.healthSeverity,
              label: SEVERITY_LABELS[context.healthSeverity],
            }
          : null
      }
      canUseCopilot={can(user.permissions, 'ai:ask')}
      aiSuggestions={DASHBOARD_AI_SUGGESTIONS}
      initialNowIso={new Date().toISOString()}
      initialCollapsed={collapsed}
      onLogout={logoutAction}
      demo={
        demoRole
          ? {
              roles: DEMO_ROLES.map(({ key, label }) => ({ key, label })),
              currentRole: demoRole,
              embed: demoEmbed,
            }
          : null
      }
    >
      <div
        data-theme={dashboard ? 'dashboard' : undefined}
        className={cn(
          dashboard &&
            '-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-background p-3 text-ink lg:-mx-6 lg:-my-7 lg:p-3.5',
        )}
      >
        {children}
      </div>
    </AppShell>
  );
}
