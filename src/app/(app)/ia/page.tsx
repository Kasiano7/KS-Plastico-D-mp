import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getAiProvider } from '@/server/ai';
import { CopilotConsole } from './copilot-console';
import { Card, CardHeader, PageHeader, ButtonLink } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Copilote IA' };
export const dynamic = 'force-dynamic';

export default async function AiPage() {
  const user = await requirePermission('ai:ask');
  const provider = getAiProvider();

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Copilote IA"
        description="Le copilote raisonne à partir des données de l’application. Il analyse, explique et propose — il ne modifie jamais l’usine sans validation humaine."
        action={
          can(user.permissions, 'catalog:write') ? (
            <ButtonLink href="/catalogue/import">Importer des références</ButtonLink>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CopilotConsole canSeeFinancials={can(user.permissions, 'finance:read')} />
        </div>

        <div className="space-y-5 lg:col-span-4">
          <Card>
            <CardHeader title="Ce que fait le copilote" />
            <ul className="space-y-2 px-5 pb-5 text-[0.8125rem] text-fg-muted">
              <li>• Analyser, comparer, détecter, rechercher</li>
              <li>• Expliquer un écart et le ventiler par cause</li>
              <li>• Calculer un impact et projeter un stock</li>
              <li>• Proposer une action et la simuler</li>
              <li>• Lire des photos, fichiers Excel et CSV pour préparer le catalogue</li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Ce qu’il ne fait pas" />
            <ul className="space-y-2 px-5 pb-5 text-[0.8125rem] text-fg-muted">
              <li>• Modifier le planning sans validation</li>
              <li>• Déplacer une commande ou affecter un opérateur</li>
              <li>• Déclencher un achat</li>
              <li>• Inventer un chiffre : chaque valeur porte son origine</li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Moteur" />
            <div className="space-y-2 px-5 pb-5 text-[0.8125rem]">
              <p className="text-fg">{provider.label}</p>
              <p className="text-fg-muted">
                {provider.id === 'demo'
                  ? "Le moteur local reste disponible. Configurez une clé OpenAI ou Azure OpenAI côté serveur pour les questions libres et la lecture de photos."
                  : "Le fournisseur distant est actif. Les appels partent uniquement du serveur et les réponses ne sont pas stockées par KS Plastico Demo."}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
