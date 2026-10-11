import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout (§ dette technique ROADMAP : « Pas de tests
 * end-to-end »). Ciblent un serveur déjà démarré en développement
 * (`npm run dev`) plutôt que d'en relancer un : ces tests s'exécutent contre
 * la même base que l'application (PGlite ou PostgreSQL selon `DATABASE_URL`),
 * pas une base jetable — chaque test nettoie ce qu'il crée.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
