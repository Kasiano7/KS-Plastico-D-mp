import { expect, test, type Locator, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Glisser-déposer sur le Gantt du planning. Utilise le compte « Chef
 * d'atelier » : c'est le seul rôle de démonstration à porter `planning:write`
 * (voir la matrice de permissions dans /administration).
 *
 * Le HTML5 drag natif ne réagit pas de façon fiable à une séquence
 * souris bas/déplacer/haut pilotée par Playwright (limitation connue :
 * `dragstart` dépend du moteur de glisser natif du navigateur, pas
 * seulement des événements souris). On déclenche donc directement les
 * événements `DragEvent` — la même technique que la vérification manuelle
 * qui a confirmé le comportement réel de la fonctionnalité.
 */
/** Lit `left`/`width` en % depuis l'attribut `style` — le navigateur
 * resérialise ces valeurs (espaces, arrondi) après un second rendu, donc on
 * compare la position réelle plutôt que la chaîne `style` brute. */
async function readBarPosition(bar: Locator): Promise<{ left: number; width: number }> {
  const style = (await bar.getAttribute('style')) ?? '';
  const left = Number(style.match(/left:\s*([\d.]+)%/)?.[1]);
  const width = Number(style.match(/width:\s*([\d.]+)%/)?.[1]);
  return { left, width };
}

async function dropOrderOnDay(page: Page, bar: Locator, dayIndex: number, horizonDays = 7) {
  const barHandle = await bar.elementHandle();
  if (!barHandle) throw new Error('Barre introuvable.');

  await page.evaluate(
    ({ bar, dayIndex, horizonDays }) => {
      const row = bar.closest('.relative.h-11') as HTMLElement | null;
      if (!row) throw new Error('Ligne de presse introuvable.');
      const rect = row.getBoundingClientRect();

      const dt = new DataTransfer();
      bar.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));

      const clientX = rect.left + ((dayIndex + 0.5) / horizonDays) * rect.width;
      const clientY = rect.top + rect.height / 2;
      row.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      row.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    },
    { bar: barHandle, dayIndex, horizonDays },
  );
}

test.describe('Planning — glisser-déposer', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'atelier@demo.example');
    await page.goto('/planning');
  });

  test('déplacer un ordre planifié vers un autre jour, puis le restaurer', async ({ page }) => {
    const bar = page.locator('[draggable="true"]', { hasText: 'OF-2415' });
    await expect(bar).toBeVisible();
    const original = await readBarPosition(bar);

    await dropOrderOnDay(page, bar, 3);
    await expect(page.getByText(/est déjà réservée/)).toHaveCount(0);
    await expect
      .poll(async () => (await readBarPosition(page.locator('[draggable="true"]', { hasText: 'OF-2415' }))).left)
      .not.toBeCloseTo(original.left, 1);

    await dropOrderOnDay(page, page.locator('[draggable="true"]', { hasText: 'OF-2415' }), 1); // retour au jour d'origine (samedi)
    await expect
      .poll(async () => (await readBarPosition(page.locator('[draggable="true"]', { hasText: 'OF-2415' }))).left)
      .toBeCloseTo(original.left, 1);
  });

  test('déposer sur un créneau occupé de la même presse est refusé', async ({ page }) => {
    const bar = page.locator('[draggable="true"]', { hasText: 'OF-2412' });
    await expect(bar).toBeVisible();
    const original = await readBarPosition(bar);

    // Jour 1 est déjà occupé par OF-2415 sur la même presse (Presse 64).
    await dropOrderOnDay(page, bar, 1);

    await expect(page.getByText(/est déjà réservée par l’ordre OF-2415/)).toBeVisible();
    const after = await readBarPosition(bar);
    expect(after.left).toBeCloseTo(original.left, 1);
  });
});
