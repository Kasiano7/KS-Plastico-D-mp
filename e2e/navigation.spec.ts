import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Navigation principale', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'direction@demo.example');
  });

  const pages: { href: string; heading: string | RegExp }[] = [
    { href: '/alertes', heading: /alertes/i },
    { href: '/production', heading: /production/i },
    { href: '/machines', heading: /machines/i },
    { href: '/commandes', heading: /commandes/i },
    { href: '/stocks', heading: /stocks/i },
    { href: '/qualite', heading: /qualité/i },
    { href: '/catalogue', heading: /catalogue/i },
    { href: '/personnel', heading: /personnel/i },
    { href: '/fournisseurs', heading: /fournisseurs/i },
    { href: '/planning', heading: /planning/i },
    { href: '/analyse', heading: /analyse/i },
    { href: '/administration', heading: /administration/i },
  ];

  for (const { href, heading } of pages) {
    test(`${href} charge sans erreur`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('pageerror', (error) => consoleErrors.push(error.message));

      const response = await page.goto(href);
      expect(response?.ok(), `${href} devrait répondre 2xx`).toBeTruthy();
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      expect(consoleErrors, `Erreurs JS sur ${href} : ${consoleErrors.join(', ')}`).toEqual([]);
    });
  }

  test('la recherche globale (Ctrl+K) trouve une machine', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /recherche globale/i }).click();
    await expect(page.getByRole('dialog', { name: 'Recherche globale' })).toBeVisible();

    await page.getByPlaceholder(/rechercher une commande/i).fill('Presse 64');
    await expect(page.getByText('Presse 64').first()).toBeVisible();
  });
});
