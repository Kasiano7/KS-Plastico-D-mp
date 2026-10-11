import { describe, expect, it } from 'vitest';
import {
  checkCodeChange,
  checkRoleDeletion,
  checkRoleUpdate,
  groupPermissionsByDomain,
  slugifyRoleCode,
  validateRoleDraft,
  type RoleGuardContext,
  type RoleSnapshot,
} from '../roles';
import { PERMISSIONS, type PermissionCode } from '../permissions';

const direction: RoleSnapshot = {
  id: 'r-direction',
  code: 'direction',
  isSystem: true,
  permissions: Object.keys(PERMISSIONS) as PermissionCode[],
  userCount: 1,
};

const production: RoleSnapshot = {
  id: 'r-production',
  code: 'responsable_production',
  isSystem: true,
  permissions: ['dashboard:read', 'orders:read', 'orders:write'],
  userCount: 1,
};

const qualite: RoleSnapshot = {
  id: 'r-qualite',
  code: 'responsable_qualite',
  isSystem: false,
  permissions: ['dashboard:read', 'quality:read', 'quality:write'],
  userCount: 0,
};

function context(overrides: Partial<RoleGuardContext> = {}): RoleGuardContext {
  return {
    editorRoleId: 'r-direction',
    roles: [direction, production, qualite],
    ...overrides,
  };
}

describe('slugifyRoleCode', () => {
  it('dérive un code technique lisible depuis un nom en clair', () => {
    expect(slugifyRoleCode('Responsable qualité')).toBe('responsable_qualite');
    expect(slugifyRoleCode("Chef d'atelier")).toBe('chef_d_atelier');
    expect(slugifyRoleCode('Méthodes & industrialisation')).toBe('methodes_industrialisation');
  });

  it('garantit un code commençant par une lettre', () => {
    expect(slugifyRoleCode('3x8 nuit')).toMatch(/^[a-z]/);
  });

  it('borne la longueur du code', () => {
    expect(slugifyRoleCode('a'.repeat(120)).length).toBeLessThanOrEqual(40);
  });

  it('ne fabrique pas de code à partir d’une saisie vide', () => {
    expect(slugifyRoleCode('')).toBe('');
    expect(slugifyRoleCode('   ')).toBe('');
  });
});

describe('validateRoleDraft', () => {
  const base = { name: 'Responsable qualité', code: 'responsable_qualite', permissions: ['quality:read'] };

  it('accepte un brouillon valide', () => {
    expect(validateRoleDraft(base, { existingCodes: ['direction'] })).toEqual([]);
  });

  it('refuse un nom trop court', () => {
    const errors = validateRoleDraft({ ...base, name: 'RQ' }, { existingCodes: [] });
    expect(errors.join(' ')).toContain('au moins 3 caractères');
  });

  it('refuse un code mal formé', () => {
    const errors = validateRoleDraft({ ...base, code: 'Responsable-Qualité' }, { existingCodes: [] });
    expect(errors.join(' ')).toContain('Le code doit commencer par une lettre');
  });

  it('refuse un code déjà pris', () => {
    const errors = validateRoleDraft(base, { existingCodes: ['responsable_qualite'] });
    expect(errors.join(' ')).toContain('déjà utilisé');
  });

  it('autorise un rôle à conserver son propre code', () => {
    const errors = validateRoleDraft(base, {
      existingCodes: ['responsable_qualite'],
      currentCode: 'responsable_qualite',
    });
    expect(errors).toEqual([]);
  });

  it('refuse une permission inconnue', () => {
    const errors = validateRoleDraft(
      { ...base, permissions: ['quality:read', 'usine:exploser'] },
      { existingCodes: [] },
    );
    expect(errors.join(' ')).toContain('Permission inconnue');
  });

  it('refuse un rôle sans aucune permission', () => {
    const errors = validateRoleDraft({ ...base, permissions: [] }, { existingCodes: [] });
    expect(errors.join(' ')).toContain('au moins une permission');
  });
});

describe('checkRoleUpdate — protection contre le verrouillage', () => {
  it('accepte une modification sans incidence sur l’administration', () => {
    expect(checkRoleUpdate('r-qualite', ['quality:read', 'machines:read'], context())).toEqual([]);
  });

  it('refuse qu’un administrateur se retire à lui-même le droit d’administrer', () => {
    const errors = checkRoleUpdate('r-direction', ['dashboard:read'], context());
    expect(errors.join(' ')).toContain('votre propre rôle');
  });

  it('refuse de supprimer le dernier droit d’administration', () => {
    const errors = checkRoleUpdate(
      'r-direction',
      ['dashboard:read'],
      context({ editorRoleId: 'r-production' }),
    );
    expect(errors.join(' ')).toContain("dernier droit d'administration");
  });

  it('accepte le retrait si un autre rôle occupé conserve l’administration', () => {
    const secondAdmin: RoleSnapshot = {
      id: 'r-admin-bis',
      code: 'administrateur_si',
      isSystem: false,
      permissions: ['admin:read', 'admin:write'],
      userCount: 1,
    };

    const errors = checkRoleUpdate('r-direction', ['dashboard:read'], {
      editorRoleId: 'r-production',
      roles: [direction, production, secondAdmin],
    });

    expect(errors).toEqual([]);
  });

  it('ne considère pas un rôle administrateur sans utilisateur comme un filet de sécurité', () => {
    const emptyAdmin: RoleSnapshot = {
      id: 'r-admin-vide',
      code: 'administrateur_si',
      isSystem: false,
      permissions: ['admin:read', 'admin:write'],
      userCount: 0,
    };

    const errors = checkRoleUpdate('r-direction', ['dashboard:read'], {
      editorRoleId: 'r-production',
      roles: [direction, production, emptyAdmin],
    });

    expect(errors.join(' ')).toContain("dernier droit d'administration");
  });

  it('signale un rôle introuvable', () => {
    expect(checkRoleUpdate('r-inconnu', ['quality:read'], context())).toEqual(['Rôle introuvable.']);
  });
});

describe('checkRoleDeletion', () => {
  it('accepte la suppression d’un rôle personnalisé inoccupé', () => {
    expect(checkRoleDeletion('r-qualite', context())).toEqual([]);
  });

  it('refuse la suppression d’un rôle livré avec l’application', () => {
    const errors = checkRoleDeletion('r-production', context());
    expect(errors.join(' ')).toContain('livré avec l’application');
  });

  it('refuse la suppression d’un rôle encore attribué', () => {
    const occupied = { ...qualite, userCount: 3 };
    const errors = checkRoleDeletion('r-qualite', {
      editorRoleId: 'r-direction',
      roles: [direction, production, occupied],
    });
    expect(errors.join(' ')).toContain('attribué à 3 utilisateur(s)');
  });

  it('refuse la suppression de son propre rôle', () => {
    const errors = checkRoleDeletion('r-qualite', context({ editorRoleId: 'r-qualite' }));
    expect(errors.join(' ')).toContain('votre propre rôle');
  });

  it('refuse la suppression du dernier rôle administrateur', () => {
    const soleAdmin: RoleSnapshot = {
      id: 'r-admin',
      code: 'administrateur_si',
      isSystem: false,
      permissions: ['admin:read', 'admin:write'],
      userCount: 0,
    };

    const errors = checkRoleDeletion('r-admin', {
      editorRoleId: 'r-production',
      roles: [production, soleAdmin],
    });

    expect(errors.join(' ')).toContain("dernier droit d'administration");
  });
});

describe('checkCodeChange', () => {
  it('fige le code technique des rôles système', () => {
    expect(checkCodeChange(direction, 'patron').join(' ')).toContain('ne peut pas être modifié');
  });

  it('laisse le code libre sur un rôle personnalisé', () => {
    expect(checkCodeChange(qualite, 'qualite_produit')).toEqual([]);
  });

  it('accepte un code inchangé sur un rôle système', () => {
    expect(checkCodeChange(direction, 'direction')).toEqual([]);
  });
});

describe('groupPermissionsByDomain', () => {
  it('couvre l’intégralité du catalogue sans doublon', () => {
    const grouped = groupPermissionsByDomain();
    const flat = grouped.flatMap((group) => group.permissions);

    expect(flat).toHaveLength(Object.keys(PERMISSIONS).length);
    expect(new Set(flat).size).toBe(flat.length);
  });
});
