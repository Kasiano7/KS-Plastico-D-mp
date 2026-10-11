import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// fileURLToPath plutôt que URL.pathname : ce dernier encode les caractères
// accentués du chemin (ex. « Démo » → « D%C3%A9mo ») et casse les alias.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
});
