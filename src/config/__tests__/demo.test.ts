import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_FRAME_ANCESTORS, demoFrameAncestors, isDemoBlockedPath, parseDemoRole } from '../demo';

describe('demoFrameAncestors', () => {
  it('retient le site KS et le serveur local par défaut', () => {
    expect(demoFrameAncestors(undefined)).toEqual([...DEFAULT_DEMO_FRAME_ANCESTORS]);
    expect(demoFrameAncestors('   ')).toEqual([...DEFAULT_DEMO_FRAME_ANCESTORS]);
  });

  it('accepte virgules et espaces, normalise et dédoublonne', () => {
    expect(demoFrameAncestors('https://a.example/, http://localhost:3000  https://a.example')).toEqual([
      'https://a.example',
      'http://localhost:3000',
    ]);
  });

  it('écarte tout ce qui n’est pas une origine http(s) — aucune injection dans la CSP', () => {
    expect(
      demoFrameAncestors(
        "https://ok.example; script-src 'unsafe-inline' javascript:alert(1) https://ok.example/chemin *.example data: 'none'",
      ),
    ).toEqual([]);
    expect(demoFrameAncestors('https://ok.example ftp://ko.example')).toEqual(['https://ok.example']);
  });
});

describe('outils du mode démonstration', () => {
  it('ne reconnaît que les rôles proposés', () => {
    expect(parseDemoRole('maintenance')).toBe('maintenance');
    expect(parseDemoRole('admin')).toBeNull();
    expect(parseDemoRole(null)).toBeNull();
  });

  it('redirige les pages de compte, pas l’administration ni les pages métier', () => {
    expect(isDemoBlockedPath('/connexion')).toBe(true);
    expect(isDemoBlockedPath('/administration/roles/nouveau')).toBe(false);
    expect(isDemoBlockedPath('/mon-compte/securite')).toBe(true);
    expect(isDemoBlockedPath('/machines')).toBe(false);
    expect(isDemoBlockedPath('/connexions')).toBe(false);
  });
});
