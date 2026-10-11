import type { Severity } from '@/components/ui/severity';
import type { PermissionCode } from '@/server/domain/permissions';

/**
 * Contrat du copilote (§40).
 *
 * Le point capital est la **traçabilité des chiffres** : chaque fait renvoyé
 * porte son origine (mesuré, calculé, estimé, prévisionnel) et sa source.
 * Un modèle qui ne saurait pas justifier un nombre ne doit pas l'afficher.
 */

export type DataOrigin = 'measured' | 'computed' | 'estimated' | 'forecast';

export type AiFact = {
  label: string;
  value: string;
  origin: DataOrigin;
  severity?: Severity;
  href?: string;
};

export type AiBreakdownEntry = {
  label: string;
  pct: number;
  detail?: string;
};

export type AiSuggestedAction = {
  label: string;
  href: string;
};

export type AiAnswer = {
  question: string;
  /** Réponse en une à quatre phrases, lisible telle quelle. */
  summary: string;
  severity: Severity;
  facts: AiFact[];
  /** Ventilation « pourquoi ? » lorsque la question porte sur une cause (§15). */
  breakdown?: AiBreakdownEntry[];
  actions?: AiSuggestedAction[];
  /** Confiance de 0 à 1. */
  confidence: number;
  /** Origine des données mobilisées, affichée sous la réponse. */
  sources: string[];
  /** Identifiant du fournisseur ayant produit la réponse. */
  provider: string;
  /** Modèle exact ayant produit la réponse (ex. gpt-5.6-terra), pour la mémoire persistée. */
  model?: string;
};

/** Un tour précédent de la même conversation — juste de quoi garder le fil. */
export type AiConversationTurn = {
  question: string;
  summary: string;
};

export type AiQuestion = {
  question: string;
  /** Identifiant interne utilisé pour l'audit et le safety identifier OpenAI. */
  userId?: string;
  /** Identifiant logique du tenant en attendant un catalogue multi-entreprises. */
  companyId?: string;
  /** Périmètre obligatoire pour les profils limités à un atelier. */
  workshopId?: string | null;
  /** Libellé du rôle, à titre informatif dans les réponses. */
  role: string;
  /**
   * Permissions effectives de l'utilisateur, transmises telles quelles.
   * Elles ne sont pas redérivées du code de rôle : depuis que les rôles sont
   * administrables, seul le contenu de la session fait foi.
   */
  permissions: readonly PermissionCode[];
  /** Permet de masquer les montants aux rôles sans accès financier. */
  canSeeFinancials: boolean;
  /** Échanges précédents de la même conversation, du plus ancien au plus récent. */
  history?: readonly AiConversationTurn[];
};

/**
 * Abstraction de fournisseur. Une implémentation LLM viendra se brancher ici
 * sans modifier l'application : elle recevra le même contexte structuré.
 */
export interface AiProvider {
  readonly id: string;
  readonly label: string;
  /** Vrai si le fournisseur est réellement disponible (clé API, quota…). */
  isAvailable(): boolean;
  answer(question: AiQuestion): Promise<AiAnswer>;
}
