import type { Page } from '@playwright/test';

/** Mot de passe commun aux comptes de démonstration (voir README/CLAUDE.md). */
export const DEMO_PASSWORD = 'Demo-9b8d8-2kx8w';

export async function login(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
}
