import { describe, expect, it } from 'vitest';
import { assertDemoDatabase } from '../reset';

/**
 * Base simulée : la 1re requête teste la présence de la table `users`, la 2e
 * compte les comptes hors `@demo.example`.
 */
function fakeDb(present: boolean, outsiders: number) {
  const answers = [{ rows: [{ present }] }, { rows: [{ outsiders }] }];
  let call = 0;
  return { execute: async () => answers[call++] } as unknown as Parameters<typeof assertDemoDatabase>[0];
}

describe('verrou de la réinitialisation nocturne', () => {
  it('accepte une base vide (aucune table users)', async () => {
    await expect(assertDemoDatabase(fakeDb(false, 0))).resolves.toBeUndefined();
  });

  it('accepte une base qui ne contient que des comptes @demo.example', async () => {
    await expect(assertDemoDatabase(fakeDb(true, 0))).resolves.toBeUndefined();
  });

  it('refuse une base réelle : un seul compte hors @demo.example suffit', async () => {
    await expect(assertDemoDatabase(fakeDb(true, 7))).rejects.toThrow(/Réinitialisation refusée : 7 compte/);
  });
});
