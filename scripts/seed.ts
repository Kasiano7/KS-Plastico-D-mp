import { seed } from '../src/server/db/seed';
import { connect } from './db';

/** Charge le jeu de démonstration. Utiliser `npm run db:reset` pour repartir de zéro. */
async function main() {
  const { db, driver, close } = await connect();
  console.log(`→ Base de données : ${driver}`);

  const existing = await db.query.users.findMany({ limit: 1 });
  if (existing.length > 0) {
    console.log('✔ La base contient déjà des données — rien à faire.');
    console.log('  Utilisez `npm run db:reset` pour la réinitialiser.');
    await close();
    return;
  }

  console.log('→ Chargement du jeu de démonstration…');
  await seed(db);
  console.log('✔ Jeu de démonstration chargé.');
  await close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
