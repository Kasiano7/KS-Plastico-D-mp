import { describe, expect, it } from 'vitest';
import {
  createAliasMap,
  redactConversation,
  redactText,
  restoreText,
  scrubForbiddenFields,
  type EmployeeIdentity,
} from '../ai-privacy';

const david: EmployeeIdentity = { id: 'uuid-a72', matricule: 'E-005', firstName: 'David', lastName: 'Dupont' };
const marc: EmployeeIdentity = { id: 'uuid-b18', matricule: 'E-011', firstName: 'Marc', lastName: 'Leblanc' };
const employees = [david, marc];

/** Séquence déterministe pour des tests reproductibles (pas de vrai hasard). */
function sequence(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('couche de confidentialité IA — alias temporaires', () => {
  it('attribue un alias distinct à chaque salarié', () => {
    const aliasMap = createAliasMap(employees, sequence([0, 0]));
    expect(aliasMap.aliasFor(david.id)).toMatch(/^OPERATOR_[A-Z]+$/);
    expect(aliasMap.aliasFor(marc.id)).toMatch(/^OPERATOR_[A-Z]+$/);
    expect(aliasMap.aliasFor(david.id)).not.toBe(aliasMap.aliasFor(marc.id));
  });

  it('ne réutilise pas le même alias pour le même salarié d’un appel à l’autre', () => {
    // Deux tirages différents doivent pouvoir inverser l'ordre d'attribution :
    // ce n'est pas la stabilité qui est recherchée, c'est l'absence de corrélation.
    const first = createAliasMap(employees, sequence([0]));
    const second = createAliasMap(employees, sequence([1, 0]));
    expect(first.aliasFor(david.id)).not.toBe(second.aliasFor(david.id));
  });

  it('retrouve l’identité locale à partir d’un alias', () => {
    const aliasMap = createAliasMap(employees, sequence([0, 0]));
    const alias = aliasMap.aliasFor(david.id)!;
    expect(aliasMap.employeeIdFor(alias)).toBe(david.id);
    expect(aliasMap.fullNameFor(alias)).toBe('David Dupont');
  });
});

describe('couche de confidentialité IA — rédaction de texte', () => {
  it('remplace nom complet, prénom, nom et matricule par l’alias', () => {
    const aliasMap = createAliasMap(employees, sequence([0, 0]));
    const davidAlias = aliasMap.aliasFor(david.id)!;

    for (const mention of ['David Dupont', 'Dupont David', 'David', 'Dupont', 'E-005']) {
      const redacted = redactText(`Question sur ${mention} aujourd'hui`, employees, aliasMap);
      expect(redacted).toContain(davidAlias);
      expect(redacted).not.toContain(mention);
    }
  });

  it('pseudonymise une question comparant deux salariés sans laisser fuiter leur identité', () => {
    const aliasMap = createAliasMap(employees, sequence([0, 0]));
    const question = 'Pourquoi Marc Leblanc produit plus que David Dupont (E-005) aujourd’hui ?';
    const redacted = redactText(question, employees, aliasMap);

    expect(redacted).not.toContain('Marc');
    expect(redacted).not.toContain('Leblanc');
    expect(redacted).not.toContain('David');
    expect(redacted).not.toContain('Dupont');
    expect(redacted).not.toContain('E-005');
    expect(redacted).toContain(aliasMap.aliasFor(marc.id));
    expect(redacted).toContain(aliasMap.aliasFor(david.id));
  });

  it('pseudonymise la question courante ET l’historique reconstruit depuis la base (§11)', () => {
    const aliasMap = createAliasMap(employees, sequence([0, 0]));
    const { question, history } = redactConversation(
      'Et David, il a fait combien ?',
      [{ question: 'Pourquoi David produit moins que Marc ?', summary: 'David a subi 40 min d’arrêt de plus que Marc.' }],
      employees,
      aliasMap,
    );

    expect(question).not.toContain('David');
    expect(history[0].question).not.toContain('David');
    expect(history[0].question).not.toContain('Marc');
    expect(history[0].summary).not.toContain('David');
    expect(history[0].summary).not.toContain('Marc');
  });

  it('restaure l’identité locale à partir des alias renvoyés par l’IA', () => {
    const aliasMap = createAliasMap(employees, sequence([0, 0]));
    const davidAlias = aliasMap.aliasFor(david.id)!;
    const marcAlias = aliasMap.aliasFor(marc.id)!;

    const modelAnswer = `${marcAlias} atteint 92 % de son objectif contre 80 % pour ${davidAlias}.`;
    const restored = restoreText(modelAnswer, aliasMap);

    expect(restored).toBe('Marc Leblanc atteint 92 % de son objectif contre 80 % pour David Dupont.');
  });

  it('ne modifie pas un texte sans salarié', () => {
    const aliasMap = createAliasMap(employees, sequence([0, 0]));
    expect(redactText('Combien de palettes reste-t-il ?', employees, aliasMap)).toBe(
      'Combien de palettes reste-t-il ?',
    );
  });
});

describe('couche de confidentialité IA — filet de sécurité sur les champs interdits', () => {
  it('retire récursivement les champs interdits par défaut', () => {
    const scrubbed = scrubForbiddenFields({
      operator: 'OPERATOR_A',
      firstName: 'David',
      lastName: 'Dupont',
      matricule: 'E-005',
      employeeId: 'uuid-a72',
      email: 'david.dupont@demo.example',
      goodUnits: 400,
      nested: { password: 'secret', downtimeMinutes: 45, contacts: [{ phone: '0600000000', shift: 'morning' }] },
    });

    expect(scrubbed).toEqual({
      operator: 'OPERATOR_A',
      goodUnits: 400,
      nested: { downtimeMinutes: 45, contacts: [{ shift: 'morning' }] },
    });
  });

  it('ne mute pas l’objet d’origine', () => {
    const original = { firstName: 'David', goodUnits: 400 };
    const scrubbed = scrubForbiddenFields(original);
    expect(original).toEqual({ firstName: 'David', goodUnits: 400 });
    expect(scrubbed).toEqual({ goodUnits: 400 });
  });
});
