import type { Cookie, Page } from '@playwright/test';

/** Mot de passe commun aux comptes de démonstration (voir README/CLAUDE.md). */
export const DEMO_PASSWORD = 'Demo-9b8d8-2kx8w';

/**
 * Sessions déjà ouvertes, par compte. La connexion est limitée en débit
 * (8 tentatives par adresse et 20 par IP en dix minutes, § actions/auth.ts) :
 * se reconnecter à chaque test épuiserait ce quota. Seuls les tests qui
 * portent sur la connexion elle-même passent par le formulaire à chaque fois.
 */
const sessions = new Map<string, Cookie[]>();

export async function loginWithForm(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
}

export async function login(page: Page, email: string): Promise<void> {
  const cached = sessions.get(email);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto('/');
    if (!new URL(page.url()).pathname.startsWith('/connexion')) return;
  }

  await loginWithForm(page, email);
  sessions.set(email, await page.context().cookies());
}
