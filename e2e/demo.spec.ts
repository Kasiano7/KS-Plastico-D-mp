import { expect, test, type Page } from '@playwright/test';

/**
 * Mode démonstration (`DEMO_MODE=true`) — projet Playwright `demo`.
 *
 * Aucun test ne se connecte : c'est précisément ce qui est vérifié.
 */

const WRITE_REFUSED = 'Action désactivée dans la démonstration';

/** Toutes les URL demandées par la page, redirections comprises. */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

/** Compte affiché en haut à droite (bouton du menu de changement d'utilisateur). */
function currentAccount(page: Page, name: RegExp) {
  return page.getByRole('button', { name });
}

/**
 * Changement d'utilisateur par le menu en haut à droite. L'ouverture du menu
 * demande React hydraté ; en développement, la première visite d'une page
 * compile et peut précéder l'hydratation : on rouvre jusqu'à voir le menu.
 */
async function openAccountMenu(page: Page) {
  const toggle = page.getByRole('button', { name: /Changer d.utilisateur/ }).first();
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(page.getByRole('menu', { name: /Changer d.utilisateur/ })).toBeVisible({ timeout: 2_000 });
  }).toPass();
}

async function switchAccount(page: Page, account: RegExp) {
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: account }).click();
}

test.describe('Mode démonstration', () => {
  test('/demo ouvre le tableau de bord sans connexion', async ({ page }) => {
    await page.goto('/demo');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('region', { name: 'Mode démonstration' })).toContainText('données fictives');
    await expect(page.getByText('Production', { exact: true }).first()).toBeVisible();
    await expect(currentAccount(page, /Anne Laurent, Direction/)).toBeVisible();
    // Ni compte personnel, ni déconnexion : il n'y a pas de session.
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0);
  });

  test('le menu en haut à droite propose chaque personne de l’usine avec sa fonction', async ({ page }) => {
    await page.goto('/demo');
    await openAccountMenu(page);

    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(7);
    await expect(page.getByRole('menuitem', { name: /Anne Laurent.*Direction/ })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('menuitem', { name: /Paul Durand.*Opérateur/ })).toBeVisible();
  });

  test('le changement d’utilisateur change réellement les droits', async ({ page }) => {
    await page.goto('/demo');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Commandes' })).toBeVisible();

    await switchAccount(page, /Paul Durand.*Opérateur/);
    await expect(page).toHaveURL(/\/poste/);
    await expect(currentAccount(page, /Paul Durand, Opérateur/)).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Commandes' })).toHaveCount(0);

    // La page elle-même revérifie les droits côté serveur.
    await page.goto('/commandes');
    await expect(page).toHaveURL(/\/acces-refuse/);

    // Sur « Accès refusé », le menu est dans le bandeau de démonstration.
    await switchAccount(page, /Anne Laurent.*Direction/);
    // Le rôle peut rester dans l'URL tant que le cookie n'est pas confirmé : c'est le repli voulu.
    await expect(page).toHaveURL(/\/(\?role=direction)?$/);
    await expect(currentAccount(page, /Anne Laurent, Direction/)).toBeVisible();
    await page.goto('/commandes');
    await expect(page).toHaveURL('/commandes');
  });

  test('une écriture est refusée avec le message de démonstration', async ({ page }) => {
    await page.goto('/demo?role=operateur');
    await expect(page).toHaveURL(/\/poste/);

    // Le clic peut précéder l'hydratation en développement : on réessaie jusqu'à l'ouverture du formulaire.
    const validate = page.getByRole('button', { name: 'Valider la palette' });
    await expect(async () => {
      await page.getByRole('button', { name: 'Terminer une palette' }).click();
      await expect(validate).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await validate.click();
    await expect(page.getByText(WRITE_REFUSED)).toBeVisible();

    // Rien n'a été écrit : la palette n'apparaît pas dans la traçabilité.
    await page.reload();
    await expect(page.getByText('Aucune palette déclarée.')).toBeVisible();
  });

  test('les routes API d’écriture sont refusées côté serveur', async ({ request }) => {
    for (const path of ['/api/catalogue/import/confirmer', '/api/passerelle/telemetrie']) {
      const response = await request.post(path, { data: {} });
      expect(response.status(), path).toBe(403);
      expect(await response.json(), path).toMatchObject({ ok: false, error: WRITE_REFUSED });
    }
  });

  test('l’administration est visible, mais grisée et inerte', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('navigation').first().getByRole('link', { name: 'Administration' }).click();

    await expect(page).toHaveURL(/\/administration/);
    await expect(page.getByRole('note')).toContainText('Désactivé en mode démo');
    // Contenu présent à l'écran mais inerte : ni focus, ni clic.
    const content = page.locator('[inert]');
    await expect(content).toHaveCount(1);
    await expect(content).toContainText('Matrice des permissions');
    await expect(content).toHaveCSS('pointer-events', 'none');
  });

  test('aucune page ne renvoie vers /connexion', async ({ page }) => {
    const requested = recordRequests(page);
    const pages = ['/connexion', '/mot-de-passe/jeton', '/mon-compte/securite', '/administration', '/machines', '/alertes', '/personnel'];

    for (const path of pages) {
      requested.length = 0;
      await page.goto(path);
      await expect(page.getByRole('region', { name: 'Mode démonstration' })).toBeVisible();
      const loginHits = requested.filter((url) => new URL(url).pathname.startsWith('/connexion'));
      // Seule la demande initiale de /connexion est permise : elle est aussitôt redirigée.
      expect(loginHits.length, `${path} → ${loginHits.join(', ')}`).toBe(path === '/connexion' ? 1 : 0);
      expect(new URL(page.url()).pathname).not.toMatch(/^\/(connexion|mot-de-passe|mon-compte)/);
    }
  });

  test('sans cookie, l’utilisateur choisi voyage dans l’URL', async ({ page, context }) => {
    await page.goto('/demo?role=maintenance');
    await context.clearCookies();
    await page.getByRole('navigation').first().getByRole('link', { name: 'Machines' }).click();

    await expect(page).toHaveURL(/\/machines\?role=maintenance/);
    await expect(currentAccount(page, /Hervé Morel, Responsable maintenance/)).toBeVisible();
  });

  test('la démonstration n’est pas indexable', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /');

    const home = await request.get('/demo', { maxRedirects: 0 });
    expect(home.headers()['x-robots-tag']).toBe('noindex, nofollow');
  });
});
