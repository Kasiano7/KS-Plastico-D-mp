import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Boxes,
  BrainCircuit,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Factory,
  HardHat,
  History,
  LayoutDashboard,
  Library,
  Layers3,
  LineChart,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import type { PermissionCode } from '@/server/domain/permissions';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission minimale pour voir l'entrée — et pour ouvrir la page. */
  permission: PermissionCode;
  group: 'pilotage' | 'production' | 'ressources' | 'referentiel' | 'systeme';
  /**
   * Entrée réservée à ceux dont c'est réellement l'écran de travail.
   *
   * « Mon poste » est conçu pour un opérateur devant sa presse. Un directeur a
   * le droit de l'ouvrir — il a tous les droits — mais l'entrée n'a rien à
   * faire dans sa navigation : elle lui affiche « Aucun ordre en cours », ce
   * qui ressemble à une panne plutôt qu'à une page hors sujet.
   */
  audience?: 'workstation';
};

export const NAV_GROUPS: { id: NavItem['group']; label: string }[] = [
  { id: 'pilotage', label: 'Pilotage' },
  { id: 'production', label: 'Production' },
  { id: 'ressources', label: 'Ressources' },
  { id: 'referentiel', label: 'Référentiel' },
  { id: 'systeme', label: 'Système' },
];

/*
 * Quatre groupes de travail plus un pied de barre, au lieu de cinq groupes.
 *
 * Le regroupement suit ce qu'on fait, pas la nature technique des données :
 * on pilote, on produit, on entretient les moyens de produire, on consulte un
 * référentiel. « Exploitation » mélangeait les trois premiers.
 *
 * « Moules » a rejoint le catalogue, dont il est une famille — il vivait dans
 * un autre groupe que « Catalogue » alors qu'un moule *est* une entrée de
 * référentiel. Son URL reste `/moules` : la page existe, seule sa place dans
 * le menu change.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Accueil', icon: LayoutDashboard, permission: 'dashboard:read', group: 'pilotage' },
  { href: '/alertes', label: 'Alertes', icon: Bell, permission: 'alerts:read', group: 'pilotage' },
  { href: '/analyse', label: 'Analyse', icon: LineChart, permission: 'dashboard:read', group: 'pilotage' },
  { href: '/poste', label: 'Mon poste', icon: HardHat, permission: 'workstation:use', group: 'pilotage', audience: 'workstation' },

  { href: '/planning', label: 'Planning', icon: CalendarRange, permission: 'planning:read', group: 'production' },
  { href: '/commandes', label: 'Commandes', icon: ClipboardList, permission: 'orders:read', group: 'production' },
  { href: '/production', label: 'Suivi de production', icon: Factory, permission: 'production:read', group: 'production' },
  { href: '/qualite', label: 'Qualité', icon: ShieldCheck, permission: 'quality:read', group: 'production' },

  { href: '/machines', label: 'Machines', icon: Wrench, permission: 'machines:read', group: 'ressources' },
  { href: '/maintenance', label: 'Maintenance', icon: CalendarClock, permission: 'maintenance:read', group: 'ressources' },
  { href: '/stocks', label: 'Stocks', icon: Boxes, permission: 'inventory:read', group: 'ressources' },
  { href: '/personnel', label: 'Personnel', icon: Users, permission: 'hr:read', group: 'ressources' },

  { href: '/catalogue', label: 'Catalogue', icon: Library, permission: 'catalog:read', group: 'referentiel' },
  { href: '/moules', label: 'Moules', icon: Layers3, permission: 'catalog:read', group: 'referentiel' },
  { href: '/fournisseurs', label: 'Fournisseurs', icon: Truck, permission: 'suppliers:read', group: 'referentiel' },

  // Détachés du flux de travail : des outils transverses, pas des destinations.
  { href: '/ia', label: 'Copilote IA', icon: BrainCircuit, permission: 'ai:ask', group: 'systeme' },
  { href: '/historique', label: 'Historique', icon: History, permission: 'history:read', group: 'systeme' },
  { href: '/administration', label: 'Administration', icon: Settings, permission: 'admin:read', group: 'systeme' },
];

/**
 * Un utilisateur « de poste » se reconnaît à ses permissions, jamais à son code
 * de rôle : il utilise un poste de travail et ne pilote pas l'usine.
 *
 * Le test porte donc sur les permissions et non sur `role === 'operateur'`,
 * conformément à la règle n° 3 du projet. Un rôle « Opérateur nuit » créé
 * demain depuis l'administration sera reconnu sans toucher à ce fichier.
 */
export function isWorkstationUser(permissions: readonly PermissionCode[]): boolean {
  return permissions.includes('workstation:use') && !permissions.includes('dashboard:read');
}

/**
 * Page d'accueil de l'utilisateur.
 * Un opérateur n'a rien à faire sur le tableau de bord d'usine — auquel il n'a
 * d'ailleurs pas accès. Son écran d'arrivée est son poste.
 */
export function landingHrefFor(permissions: readonly PermissionCode[]): string {
  return isWorkstationUser(permissions) ? '/poste' : '/';
}

/** Entrées visibles pour un jeu de permissions donné. */
export function navItemsFor(permissions: readonly PermissionCode[]): NavItem[] {
  const workstation = isWorkstationUser(permissions);
  return NAV_ITEMS.filter(
    (item) =>
      permissions.includes(item.permission) &&
      (item.audience !== 'workstation' || workstation),
  );
}
