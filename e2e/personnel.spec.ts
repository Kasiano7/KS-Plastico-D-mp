import { eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import { login } from './helpers';
import { connect } from '../scripts/db';
import * as t from '../src/server/db/schema';

const TEST_MATRICULE = 'E2E-TEST-001';

async function deleteTestEmployee(): Promise<void> {
  const { db, close } = await connect();
  await db.delete(t.employees).where(eq(t.employees.matricule, TEST_MATRICULE));
  await close();
}

// Nettoyage garanti même si une assertion échoue en cours de test — placer le
// nettoyage en fin de corps de test ne suffit pas, il ne s'exécute jamais si
// une ligne précédente lève. Pas de suppression exposée dans l'interface (les
// fiches RH ne se suppriment pas, elles se désactivent) : un test ne doit pas
// pour autant laisser un salarié fictif dans la base réelle entre deux runs.
test.afterEach(async () => {
  await deleteTestEmployee();
});

test('créer une fiche salarié, vérifier ses habilitations, puis la retirer', async ({ page }) => {
  await deleteTestEmployee(); // au cas où un run précédent aurait échoué avant son propre nettoyage

  await login(page, 'direction@demo.example');
  await page.goto('/personnel');

  await page.getByRole('button', { name: 'Nouveau salarié' }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Nouveau salarié' });
  await createDialog.getByLabel('Prénom', { exact: true }).fill('Playwright');
  await createDialog.getByLabel('Nom', { exact: true }).fill('E2E');
  await createDialog.getByLabel('Matricule').fill(TEST_MATRICULE);
  await createDialog.getByLabel('Poste').fill('Test automatisé');
  await createDialog.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(createDialog).toBeHidden();

  const row = page.getByRole('row', { name: /Playwright E2E/ });
  await expect(row).toBeVisible();
  await expect(row.getByText(TEST_MATRICULE)).toBeVisible();

  // Déclare une habilitation depuis la même fiche et vérifie qu'elle apparaît.
  await row.getByRole('button', { name: /Déclarer une absence ou une habilitation/ }).click();
  const hrDialog = page.getByRole('dialog').filter({ hasText: 'Playwright E2E' });
  await hrDialog.getByLabel('Libellé').fill('HabilitationE2E test');
  await hrDialog.locator('input[name="obtainedAt"]').fill('2026-01-01');
  await hrDialog.getByRole('button', { name: 'Ajouter' }).first().click();
  await expect(hrDialog.getByText('Habilitation ajoutée.')).toBeVisible();
  await hrDialog.getByRole('button', { name: 'Fermer' }).click();

  // Le tableau n'affiche que le premier mot du libellé (badge compact) :
  // le libellé de test tient donc en un seul mot, sans espace.
  await expect(row.getByText('HabilitationE2E')).toBeVisible();
});
