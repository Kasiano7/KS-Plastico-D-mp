import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('modifier le tarif énergie du modèle de coût, puis le restaurer', async ({ page }) => {
  await login(page, 'direction@demo.example');
  await page.goto('/administration');

  const energyValue = page.locator('dt', { hasText: 'Énergie / h' }).locator('xpath=following-sibling::dd[1]');
  const original = await energyValue.textContent();
  expect(original).toBeTruthy();

  await page.getByRole('button', { name: /modifier le modèle de coût/i }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Modifier le modèle de coût' });
  await expect(dialog).toBeVisible();

  const energyInput = dialog.getByLabel('Énergie (€/h)');
  const originalInput = await energyInput.inputValue();
  await energyInput.fill('19.99');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  await expect(energyValue).toHaveText(/19,99/);

  // Restaure la valeur d'origine — ce test s'exécute contre la base réelle.
  await page.getByRole('button', { name: /modifier le modèle de coût/i }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Énergie (€/h)').fill(originalInput);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(energyValue).toHaveText(original!);
});
