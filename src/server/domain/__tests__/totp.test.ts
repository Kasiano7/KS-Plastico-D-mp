import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  computeTotpCode,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
} from '../totp';

// Vecteurs officiels RFC 6238 Annexe B (SHA-1, 8 chiffres, pas de 30 s,
// secret ASCII "12345678901234567890"). Vérifier contre la RFC plutôt que
// contre soi-même est le seul moyen de garantir l'interopérabilité avec une
// vraie application d'authentification.
const RFC_SECRET_BASE32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('base32Encode / base32Decode', () => {
  it('fait un aller-retour fidèle sur des octets aléatoires', () => {
    const original = Buffer.from([0, 1, 2, 254, 255, 128, 17, 33, 200]);
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });
});

describe('computeTotpCode — vecteurs officiels RFC 6238', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('T=%i → %s', (seconds, expected) => {
    expect(computeTotpCode(RFC_SECRET_BASE32, seconds * 1000, 30, 8)).toBe(expected);
  });
});

describe('verifyTotpCode', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;

  it('accepte le code du pas courant', () => {
    const code = computeTotpCode(secret, now);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
  });

  it('accepte le pas précédent (dérive d’horloge), dans la fenêtre', () => {
    const previousStepCode = computeTotpCode(secret, now - 30_000);
    expect(verifyTotpCode(secret, previousStepCode, now)).toBe(true);
  });

  it('refuse un code hors fenêtre', () => {
    const farCode = computeTotpCode(secret, now - 5 * 30_000);
    expect(verifyTotpCode(secret, farCode, now)).toBe(false);
  });

  it('refuse un code incorrect', () => {
    expect(verifyTotpCode(secret, '000000', now)).toBe(false);
  });

  it('refuse un format invalide sans lever d’exception', () => {
    expect(verifyTotpCode(secret, 'abcdef', now)).toBe(false);
    expect(verifyTotpCode(secret, '123', now)).toBe(false);
  });
});

describe('buildOtpAuthUri', () => {
  it('produit une URI otpauth valide contenant le secret et l’émetteur', () => {
    const uri = buildOtpAuthUri({ secretBase32: 'JBSWY3DPEHPK3PXP', accountLabel: 'direction@demo.example' });
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=KS+Plastico+Demo');
  });
});

describe('generateRecoveryCodes', () => {
  it('génère le nombre demandé de codes uniques, format xxxx-xxxx', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });
});
