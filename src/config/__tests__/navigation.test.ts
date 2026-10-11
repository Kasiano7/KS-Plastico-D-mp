import { describe, expect, it } from 'vitest';
import {
  isWorkstationUser,
  landingHrefFor,
  navItemsFor,
  NAV_GROUPS,
  NAV_ITEMS,
} from '../navigation';
import { ROLE_PERMISSIONS } from '@/server/domain/permissions';

const DIRECTION = ROLE_PERMISSIONS.direction;
const OPERATEUR = ROLE_PERMISSIONS.operateur;

describe('isWorkstationUser', () => {
  it('reconnaît un opérateur : il utilise un poste et ne pilote pas l’usine', () => {
    expect(isWorkstationUser(OPERATEUR)).toBe(true);
  });

  it('ne classe pas la direction comme utilisateur de poste, malgré tous ses droits', () => {
    expect(isWorkstationUser(DIRECTION)).toBe(false);
  });

  it('reconnaît un rôle créé sur mesure, sans jamais lire de code de rôle', () => {
    // Un « Opérateur nuit » créé depuis l'administration doit être reconnu
    // sans qu'on touche au code.
    expect(isWorkstationUser(['workstation:use', 'production:read'])).toBe(true);
  });

  it('ne classe pas comme poste un rôle sans accès au poste', () => {
    expect(isWorkstationUser(['production:read'])).toBe(false);
  });
});

describe('landingHrefFor', () => {
  it('envoie un opérateur sur son poste, pas sur un tableau de bord interdit', () => {
    expect(landingHrefFor(OPERATEUR)).toBe('/poste');
  });

  it('envoie tous les autres sur l’accueil', () => {
    expect(landingHrefFor(DIRECTION)).toBe('/');
    expect(landingHrefFor(ROLE_PERMISSIONS.responsable_maintenance)).toBe('/');
  });
});

describe('navItemsFor', () => {
  it('masque « Mon poste » à la direction, qui en a pourtant le droit', () => {
    const hrefs = navItemsFor(DIRECTION).map((item) => item.href);

    expect(hrefs).not.toContain('/poste');
    // La permission est bien présente : c'est un choix d'affichage, pas un droit.
    expect(DIRECTION).toContain('workstation:use');
  });

  it('affiche « Mon poste » à un opérateur', () => {
    expect(navItemsFor(OPERATEUR).map((item) => item.href)).toContain('/poste');
  });

  it('n’affiche que ce que les permissions autorisent', () => {
    const hrefs = navItemsFor(OPERATEUR).map((item) => item.href);

    expect(hrefs).not.toContain('/administration');
    expect(hrefs).not.toContain('/');
  });

  it('expose l’analyse à qui voit le tableau de bord', () => {
    // Tendances et rapport du jour ont fusionné derrière une entrée unique.
    const hrefs = navItemsFor(DIRECTION).map((item) => item.href);

    expect(hrefs).toContain('/analyse');
    expect(hrefs).not.toContain('/rapports');
  });
});

describe('NAV_ITEMS', () => {
  it('ne contient aucun doublon de lien', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('rattache chaque entrée à un groupe déclaré', () => {
    // Dérivé de `NAV_GROUPS` et non recopié : le test vérifie l'invariant —
    // aucune entrée orpheline — et survit à une réorganisation des groupes.
    const declared = new Set(NAV_GROUPS.map((group) => group.id));
    for (const item of NAV_ITEMS) expect(declared.has(item.group)).toBe(true);
  });

  it('ne déclare aucun groupe vide', () => {
    const used = new Set(NAV_ITEMS.map((item) => item.group));
    for (const group of NAV_GROUPS) expect(used.has(group.id)).toBe(true);
  });
});
