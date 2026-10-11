import { desc, sql } from 'drizzle-orm';
import type { Database } from './client';
import * as t from './schema';
import { daysToShift, shouldShift } from '../domain/demo-clock';

/**
 * Fait glisser le jeu de démonstration jusqu'à aujourd'hui.
 *
 * Sans cela, l'application affiche une usine à l'arrêt dès le lendemain du
 * chargement : les ordres de fabrication sont datés du jour du seed, et rien
 * n'est plus « aujourd'hui ». Production 0, TRS 0 %, ateliers à 0 % — alors
 * que la lecture est juste, c'est la donnée qui a vieilli.
 *
 * Le décalage porte sur **toutes** les colonnes de date d'un coup, du même
 * nombre entier de jours. C'est ce qui préserve l'histoire : la Presse 64
 * reste arrêtée depuis la même durée, l'ordre reste bloqué, la commande reste
 * menacée. Régénérer aurait cassé ces liens ; décaler les conserve tous.
 *
 * Désactivable par `APP_ROLLING_DEMO=false` — sur une instance branchée à
 * une vraie usine, on ne touche évidemment pas aux dates.
 */

/**
 * Tables dont les dates ne doivent **jamais** bouger.
 *
 * Ce ne sont pas des données métier mais des mécanismes : décaler l'expiration
 * d'un jeton de mot de passe le prolongerait, décaler une fenêtre de
 * limitation de débit la fausserait, et déplacer les migrations appliquées
 * ferait croire à une base plus récente qu'elle ne l'est.
 */
const NEVER_SHIFTED = new Set([
  'password_tokens',
  'rate_limit_buckets',
  'push_subscriptions',
  '__drizzle_migrations',
]);

/**
 * Colonnes de date à décaler, **lues dans la base** plutôt qu'énumérées.
 *
 * Une liste écrite à la main dérive du schéma : une colonne ajoutée plus tard
 * serait oubliée, une colonne renommée ferait échouer la requête. Interroger
 * le catalogue garantit que le décalage couvre exactement ce qui existe.
 */
async function shiftableColumns(db: Database): Promise<{ table: string; columns: string[] }[]> {
  const rows = (await db.execute(
    sql`select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and data_type in ('timestamp with time zone', 'timestamp without time zone')
        order by table_name, column_name`,
  )) as unknown as { rows?: { table_name: string; column_name: string }[] };

  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  const byTable = new Map<string, string[]>();

  for (const row of list as { table_name: string; column_name: string }[]) {
    if (NEVER_SHIFTED.has(row.table_name)) continue;
    byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row.column_name]);
  }

  return [...byTable.entries()].map(([table, columns]) => ({ table, columns }));
}

/**
 * Repère temporel du jeu : l'instant que le seed considérait comme « maintenant ».
 *
 * Le choix du repère n'est pas anodin. Prendre l'ordre de fabrication le plus
 * tardif était une erreur : le jeu contient des ordres planifiés jusqu'à trois
 * jours dans l'avenir, et les caler sur aujourd'hui renvoyait ceux du jour
 * trois jours en arrière — la production restait à zéro.
 *
 * `machines.status_since` est le bon repère : le seed y écrit l'instant exact
 * du chargement pour les presses à l'arrêt, et des instants antérieurs pour
 * celles en production. Son maximum est donc le « maintenant » du seed, sans
 * aucun futur.
 */
async function lastAnchor(db: Database): Promise<Date | null> {
  const [row] = await db
    .select({ at: t.machines.statusSince })
    .from(t.machines)
    .orderBy(desc(t.machines.statusSince))
    .limit(1);

  return row?.at ?? null;
}

export async function rollDemoDataForward(db: Database): Promise<{ shiftedDays: number }> {
  if (process.env.APP_ROLLING_DEMO === 'false') return { shiftedDays: 0 };

  const anchor = await lastAnchor(db);
  const days = daysToShift(anchor, new Date());
  if (!shouldShift(days)) return { shiftedDays: 0 };

  /*
   * Un seul intervalle, appliqué partout dans la même transaction : si le
   * décalage échouait à mi-chemin, la moitié du jeu serait dans le passé et
   * l'autre dans le présent — une incohérence pire que la donnée périmée.
   */
  const targets = await shiftableColumns(db);

  await db.transaction(async (tx) => {
    for (const { table, columns } of targets) {
      const assignments = columns
        .map((column) => `"${column}" = "${column}" + make_interval(days => ${days})`)
        .join(', ');

      // Noms de table et de colonnes issus du catalogue de la base, et `days`
      // est un entier calculé : aucune valeur d'origine externe n'entre ici.
      await tx.execute(sql.raw(`UPDATE "${table}" SET ${assignments}`));
    }
  });

  console.info(
    `[démonstration] Jeu de données avancé de ${days} jour(s) : l'usine décrit à nouveau la journée en cours.`,
  );

  return { shiftedDays: days };
}
