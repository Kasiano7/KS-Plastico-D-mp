import { describe, expect, it } from 'vitest';
import { REDACTED_MARKER, isRedactedKey, redactAuditValue } from '../audit-redaction';

describe('isRedactedKey', () => {
  it('reconnaît les champs de rémunération, de santé et les secrets', () => {
    expect(isRedactedKey('salaryCents')).toBe(true);
    expect(isRedactedKey('absenceReason')).toBe(true);
    expect(isRedactedKey('passwordHash')).toBe(true);
    expect(isRedactedKey('totpSecret')).toBe(true);
  });

  it('ignore la casse et le séparateur', () => {
    // `salary_cents`, `salaryCents` et `SALARY_CENTS` désignent la même chose.
    expect(isRedactedKey('salary_cents')).toBe(true);
    expect(isRedactedKey('SALARY-CENTS')).toBe(true);
  });

  it('laisse passer ce qui doit rester lisible', () => {
    expect(isRedactedKey('roleId')).toBe(false);
    expect(isRedactedKey('status')).toBe(false);
    expect(isRedactedKey('permissions')).toBe(false);
  });
});

describe('redactAuditValue', () => {
  it('masque la valeur mais conserve le nom du champ', () => {
    // Le journal doit continuer de dire QU'UN champ a changé, sans dire EN QUOI.
    expect(redactAuditValue({ salaryCents: 3_200_000, jobTitle: 'Régleur' })).toEqual({
      salaryCents: REDACTED_MARKER,
      jobTitle: 'Régleur',
    });
  });

  it('descend dans les objets imbriqués', () => {
    // Masquer le seul premier niveau donnerait une fausse impression de
    // protection : les charges d'audit sont souvent imbriquées.
    expect(
      redactAuditValue({ employee: { name: 'Samir', salary: 42_000 } }),
    ).toEqual({ employee: { name: 'Samir', salary: REDACTED_MARKER } });
  });

  it('parcourt les tableaux', () => {
    expect(redactAuditValue([{ iban: 'FR76…' }, { iban: 'FR14…' }])).toEqual([
      { iban: REDACTED_MARKER },
      { iban: REDACTED_MARKER },
    ]);
  });

  it('laisse les valeurs simples intactes', () => {
    expect(redactAuditValue('texte')).toBe('texte');
    expect(redactAuditValue(42)).toBe(42);
    expect(redactAuditValue(null)).toBeNull();
    expect(redactAuditValue(undefined)).toBeUndefined();
  });

  it('ne démonte pas une date', () => {
    const date = new Date('2026-09-01T10:00:00Z');
    expect(redactAuditValue({ occurredAt: date })).toEqual({ occurredAt: date });
  });

  it('ne touche pas à une charge sans champ sensible', () => {
    const payload = { status: 'running', machineId: 'abc', permissions: ['alerts:read'] };
    expect(redactAuditValue(payload)).toEqual(payload);
  });
});
