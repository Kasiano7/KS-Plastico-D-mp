import { permanentRedirect } from 'next/navigation';

/** Ancienne adresse de la consommation — conservée en redirection. */
export default async function MachineConsumptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/machines/${id}/production?vue=energie`);
}
