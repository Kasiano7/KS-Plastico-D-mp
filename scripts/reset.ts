import { sql } from 'drizzle-orm';
import { seed } from '../src/server/db/seed';
import { connect } from './db';

/**
 * `NODE_ENV` ne suffit pas à détecter un risque : un script lancé à la main
 * avec `tsx` n'a jamais `NODE_ENV=production`, même quand `DATABASE_URL` (via
 * `.env.local`) pointe vers une vraie base distante (Neon, RDS…). C'est
 * précisément ce qui a permis à `db:reset` d'écraser une base de production
 * un jour de développement local. Le vrai signal de risque est la nature de
 * la cible : PGlite local et `localhost` ne demandent aucune confirmation,
 * tout le reste — parce que c'est joignable depuis un poste de dev, c'est
 * potentiellement une base partagée — exige `APP_ALLOW_RESET=true`
 * explicite, quel que soit `NODE_ENV`.
 */
function isRemoteDatabase(url: string | undefined): boolean {
  if (!url || !url.startsWith('post')) return false;
  const host = new URL(url).hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

/**
 * Réinitialise complètement la base puis recharge le jeu de démonstration.
 * Destructif : refuse de s'exécuter sur une base distante sans confirmation explicite.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (isRemoteDatabase(url) && process.env.APP_ALLOW_RESET !== 'true') {
    console.error(`✖ Refus : ${new URL(url!).hostname} n'est pas une base locale.`);
    console.error('  Si la réinitialisation de cette base distante est bien voulue, relancer avec :');
    console.error('  APP_ALLOW_RESET=true npm run db:reset');
    process.exit(1);
  }

  const { db, driver, close } = await connect();
  console.log(`→ Base de données : ${driver}`);
  console.log('→ Suppression du schéma public…');

  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await close();

  // Reconnexion : le migrateur recrée l'intégralité du schéma.
  const fresh = await connect();
  console.log('→ Migrations appliquées.');
  await seed(fresh.db);
  console.log('✔ Base réinitialisée et jeu de démonstration rechargé.');
  await fresh.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
