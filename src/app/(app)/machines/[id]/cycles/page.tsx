import { permanentRedirect } from 'next/navigation';

/**
 * Ancienne adresse des cycles — conservée en redirection.
 * Un lien mis en favori ou collé dans un compte rendu doit continuer de mener
 * quelque part ; supprimer la route casserait ces liens sans prévenir.
 */
export default async function MachineCyclesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/machines/${id}/production?vue=cycles`);
}
