import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout (§ dette technique ROADMAP : « Pas de tests
 * end-to-end »). Deux serveurs de développement, deux projets :
 *
 * - `app`  : fonctionnement normal, port 3001 (le site vitrine KS occupe le
 *            3000) — mêmes tests qu'à l'origine, sur la base locale de
 *            l'application ; chaque test nettoie ce qu'il crée ;
 * - `demo` : `DEMO_MODE=true`, port 3002, base PGlite distincte (deux
 *            processus ne peuvent pas ouvrir le même fichier PGlite).
 *
 * Un serveur déjà démarré sur ces ports est réutilisé.
 */
const APP_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const DEMO_URL = process.env.E2E_DEMO_BASE_URL ?? 'http://localhost:3002';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  // Serveurs de développement : la première visite d'une page la compile.
  expect: { timeout: 15_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'app',
      testIgnore: /demo\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: APP_URL },
    },
    {
      name: 'demo',
      testMatch: /demo\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: DEMO_URL },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- -p 3001',
      url: APP_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- -p 3002',
      url: DEMO_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        DEMO_MODE: 'true',
        PGLITE_DATA_DIR: '.data/pglite-e2e-demo',
        NEXT_DIST_DIR: '.next/e2e-demo',
      },
    },
  ],
});
