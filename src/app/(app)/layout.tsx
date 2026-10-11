import { AuthenticatedAppShell } from '@/components/shell/authenticated-app-shell';

/**
 * Toutes les pages applicatives passent par ce layout : la session y est
 * vérifiée une fois, et la navigation n'expose que les entrées autorisées.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
