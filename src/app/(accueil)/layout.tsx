import { AuthenticatedAppShell } from '@/components/shell/authenticated-app-shell';

/**
 * Groupe de routes de l'application KS Plastico Demo nouvelle génération.
 *
 * Toutes les pages construites sur ce design system passeront par cette
 * coquille : même navigation, même thème, mêmes espacements.
 */
export default function AccueilLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedAppShell dashboard>{children}</AuthenticatedAppShell>;
}
