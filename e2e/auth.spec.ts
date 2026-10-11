import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Authentification', () => {
  test('une session valide ouvre le tableau de bord', async ({ page }) => {
    await login(page, 'direction@demo.example');
    await expect(page).toHaveURL('/');
    // Le libellé est en capitales à l'écran par CSS (text-transform), pas dans le DOM.
    await expect(page.getByText('Production', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Anne Laurent')).toBeVisible();
  });

  test('un mot de passe incorrect est refusé avec un message explicite', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill('direction@demo.example');
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/connexion');
  });

  test('une page authentifiée redirige vers la connexion sans session', async ({ page }) => {
    await page.goto('/personnel');
    await expect(page).toHaveURL('/connexion');
  });

  test('se déconnecter renvoie vers la connexion', async ({ page }) => {
    await login(page, 'direction@demo.example');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL('/connexion');
    await expect(page.getByLabel('Adresse e-mail')).toBeVisible();
  });
});
