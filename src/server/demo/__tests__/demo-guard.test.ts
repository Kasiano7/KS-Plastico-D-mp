import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_WRITE_DISABLED_MESSAGE } from '@/config/demo';
import { demoWriteRefusal } from '../guard';

/**
 * Actions qui n'écrivent rien : seules exceptions admises à la garde démo.
 * Ajouter une action ici exige de vérifier qu'elle ne modifie pas la base.
 */
const READ_ONLY_ACTIONS = new Set(['searchIncidentMemoryAction']);

const ACTIONS_DIR = path.join(process.cwd(), 'src', 'server', 'actions');

function exportedActions(): { file: string; name: string; body: string }[] {
  return readdirSync(ACTIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => {
      const source = readFileSync(path.join(ACTIONS_DIR, file), 'utf8');
      const chunks = source.split(/(?=export async function )/).slice(1);
      return chunks.map((chunk) => ({
        file,
        name: /export async function (\w+)/.exec(chunk)![1],
        body: chunk,
      }));
    });
}

describe('garde démo des Server Actions', () => {
  it('chaque action mutante appelle demoWriteRefusal()', () => {
    const actions = exportedActions();
    expect(actions.length).toBeGreaterThan(40);

    const unguarded = actions
      .filter((action) => !READ_ONLY_ACTIONS.has(action.name))
      .filter((action) => !action.body.includes('demoWriteRefusal()'))
      .map((action) => `${action.file} › ${action.name}`);

    expect(unguarded).toEqual([]);
  });
});

describe('demoWriteRefusal', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ne bloque rien hors démonstration', () => {
    vi.stubEnv('DEMO_MODE', 'false');
    expect(demoWriteRefusal()).toBeNull();
  });

  it('renvoie le message de démonstration sous toutes les formes d’état', () => {
    vi.stubEnv('DEMO_MODE', 'true');
    expect(demoWriteRefusal()).toEqual({
      ok: false,
      message: DEMO_WRITE_DISABLED_MESSAGE,
      error: DEMO_WRITE_DISABLED_MESSAGE,
      errors: [DEMO_WRITE_DISABLED_MESSAGE],
    });
  });
});
