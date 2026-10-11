import { Panel, PanelHeader, PanelLink } from '@/components/ui/panel';
import { getAssetInventory } from '@/server/services/assets';

/**
 * Vue des actifs suivis — **données réelles**.
 *
 * Ce panneau affichait des catégories écrites à la main, faute de référentiel
 * en base. Il lit désormais la table `assets`, dont les presses sont une
 * spécialisation : la maintenance de l'usine couvre tout le site, et cet écran le
 * dit maintenant avec des chiffres qui viennent de quelque part.
 *
 * La colonne « vital » n'est pas décorative : elle compte ce dont l'arrêt
 * stopperait la production. C'est elle qui distingue vingt-quatre presses d'un
 * unique compresseur central — dont la panne arrête pourtant les vingt-quatre.
 */
export async function AssetsOverview() {
  const inventory = await getAssetInventory();

  return (
    <Panel>
      <PanelHeader
        title="Vue des actifs suivis"
        action={
          <span className="tnum rounded-chip border border-edge px-1.5 py-[3px] text-[0.625rem] font-medium whitespace-nowrap text-ink-muted">
            Total : {inventory.total}
          </span>
        }
      />

      {inventory.total === 0 ? (
        <p className="px-3.5 pb-3 text-[0.6875rem] leading-relaxed text-ink-muted">
          Aucun actif enregistré. Le référentiel se remplit au premier démarrage.
        </p>
      ) : (
        <>
          <ul className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
            {inventory.categories.map((category) => (
              <li
                key={category.type}
                className="flex items-center gap-2 border-b border-edge-soft py-[7px] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-ink-muted">
                  {category.label}
                </span>

                {category.vitalCount > 0 ? (
                  <span
                    title={`${category.vitalCount} actif(s) dont l’arrêt stopperait la production`}
                    className="tnum shrink-0 rounded-chip bg-danger/12 px-1.5 py-px text-[0.5625rem] font-semibold text-danger"
                  >
                    {category.vitalCount} vital
                  </span>
                ) : null}

                <span className="tnum shrink-0 text-[0.6875rem] font-semibold text-ink">
                  {category.count}
                </span>
              </li>
            ))}
          </ul>

          <PanelLink href="/machines" align="end">
            Voir le parc machines
          </PanelLink>
        </>
      )}
    </Panel>
  );
}
