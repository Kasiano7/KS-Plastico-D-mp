import { describe, expect, it } from 'vitest';
import { shouldAllowDemoFallback } from '../provider-selection';

describe('sélection du moteur de secours', () => {
  it('utilise le moteur local lorsqu’aucune IA distante n’est configurée', () => {
    expect(shouldAllowDemoFallback(false)).toBe(true);
  });

  it('ne masque pas un échec OpenAI par défaut', () => {
    expect(shouldAllowDemoFallback(true, undefined)).toBe(false);
  });

  it('autorise le repli uniquement lorsqu’il est explicitement activé', () => {
    expect(shouldAllowDemoFallback(true, 'true')).toBe(true);
  });
});
