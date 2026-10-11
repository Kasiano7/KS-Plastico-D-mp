import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  can,
  canAny,
  permissionsForRole,
} from '../permissions';

describe('catalogue RBAC', () => {
  it('déclare une permission valide pour chaque rôle', () => {
    const known = new Set(Object.keys(PERMISSIONS));

    for (const role of ROLE_CODES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it('réserve par défaut la création du planning aux chefs d’atelier', () => {
    for (const role of ROLE_CODES) {
      expect(can(permissionsForRole(role), 'planning:write')).toBe(role === 'chef_atelier');
    }
  });
});

describe('cloisonnement des rôles', () => {
  it('réserve les données financières à la direction', () => {
    for (const role of ROLE_CODES) {
      expect(can(permissionsForRole(role), 'finance:read')).toBe(role === 'direction');
    }
  });

  it('réserve l’administration à la direction', () => {
    for (const role of ROLE_CODES) {
      expect(can(permissionsForRole(role), 'admin:write')).toBe(role === 'direction');
    }
  });

  it('n’autorise l’approbation des recommandations qu’aux décideurs production', () => {
    expect(can(permissionsForRole('direction'), 'recommendations:approve')).toBe(true);
    expect(can(permissionsForRole('responsable_production'), 'recommendations:approve')).toBe(true);
    expect(can(permissionsForRole('chef_atelier'), 'recommendations:approve')).toBe(false);
    expect(can(permissionsForRole('operateur'), 'recommendations:approve')).toBe(false);
  });

  it('limite l’opérateur à son poste de travail', () => {
    const operator = permissionsForRole('operateur');

    expect(can(operator, 'workstation:use')).toBe(true);
    expect(can(operator, 'orders:read')).toBe(false);
    expect(can(operator, 'inventory:write')).toBe(false);
    expect(can(operator, 'hr:read')).toBe(false);
  });

  it('donne au responsable stock l’écriture stock mais pas la production', () => {
    const stock = permissionsForRole('responsable_stock');

    expect(can(stock, 'inventory:write')).toBe(true);
    expect(can(stock, 'production:write')).toBe(false);
    expect(can(stock, 'planning:write')).toBe(false);
  });

  it('donne au responsable RH le personnel mais pas les stocks', () => {
    const hr = permissionsForRole('responsable_rh');

    expect(can(hr, 'hr:write')).toBe(true);
    expect(can(hr, 'inventory:read')).toBe(false);
    expect(can(hr, 'machines:write')).toBe(false);
  });

  it('donne au responsable maintenance l’écriture incident sans toucher aux commandes', () => {
    const maintenance = permissionsForRole('responsable_maintenance');

    expect(can(maintenance, 'maintenance:write')).toBe(true);
    expect(can(maintenance, 'machines:write')).toBe(true);
    expect(can(maintenance, 'orders:write')).toBe(false);
  });
});

describe('canAny', () => {
  it('accepte dès qu’une permission de la liste est accordée', () => {
    const chief = permissionsForRole('chef_atelier');

    expect(canAny(chief, ['finance:read', 'production:write'])).toBe(true);
    expect(canAny(chief, ['finance:read', 'admin:write'])).toBe(false);
  });
});
