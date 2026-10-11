# Sécurité

## Principe directeur

> Une condition d'affichage côté navigateur n'est **jamais** une autorisation.

Masquer un bouton améliore l'ergonomie. La sécurité, elle, est vérifiée sur le
serveur, à chaque page et à chaque mutation, sans exception.

## Authentification

- Cookie de session `app_session` : `httpOnly`, `sameSite=lax`,
  `secure` en production, durée de vie 12 h.
- Contenu : **uniquement l'identifiant utilisateur**, signé en HS256 (`jose`).
  Ni rôle, ni permissions : ils sont relus en base à chaque requête, donc une
  révocation prend effet immédiatement.
- Mots de passe hachés avec bcrypt (coût 10).
- La comparaison de mot de passe est exécutée même lorsque le compte n'existe
  pas : le temps de réponse ne révèle pas l'existence d'un compte.
- Message d'échec volontairement générique (« Identifiants incorrects »).
- `AUTH_SECRET` est **obligatoire en production** : l'application refuse de
  démarrer sans lui.

## Autorisation — RBAC

Permissions au format `domaine:action`. Le **catalogue** des permissions vit
dans le code (`src/server/domain/permissions.ts`) : il définit ce que
l'application sait vérifier. Les **droits effectifs**, eux, sont lus dans la
table `role_permissions` à chaque requête.

Conséquence : la direction crée et modifie les rôles depuis
`/administration/roles`, sans redéploiement, et un droit retiré prend effet à la
navigation suivante.

### Protection contre le verrouillage

Rendre les rôles modifiables crée un risque : se priver soi-même de
l'administration. Les règles suivantes sont appliquées côté serveur
(`src/server/domain/roles.ts`, testé) et non par l'interface :

| Règle | Raison |
| --- | --- |
| On ne peut pas retirer `admin:write` à son propre rôle | Perte immédiate d'accès à l'administration |
| Une modification ne peut laisser aucun rôle administrateur **occupé** | Verrouillage définitif de l'application |
| Un rôle système ne peut être ni supprimé ni renommé techniquement | D'autres écrans s'appuient sur son code |
| Un rôle encore attribué ne peut pas être supprimé | Utilisateurs orphelins |
| Un changement de rôle utilisateur suit les mêmes règles | Même verrouillage par une autre porte |

Un rôle administrateur que personne ne porte n'est pas compté comme filet de
sécurité : un droit non attribué ne protège de rien.

Gardes disponibles :

| Fonction                        | Usage                                    | Échec              |
| ------------------------------- | ---------------------------------------- | ------------------ |
| `requireUser()`                 | Toute page authentifiée                  | `/connexion`       |
| `requirePermission(p)`          | Page à permission unique                 | `/acces-refuse`    |
| `requireAnyPermission([p…])`    | Page à permissions alternatives          | `/acces-refuse`    |
| `assertPermission(p)`           | Server Action                            | Erreur levée       |
| `assertAnyPermission([p…])`     | Server Action à plusieurs profils        | Erreur levée       |

Cloisonnements notables :

- `finance:read` — direction uniquement. Les montants disparaissent réellement
  du rendu serveur pour les autres rôles ; ils ne sont pas masqués en CSS.
- `admin:write` — direction uniquement.
- `recommendations:approve` — direction et responsable de production.
- L'opérateur n'a que `workstation:use`, `production:read`, `quality:write`,
  `incidents:declare` : il ne peut ni consulter les commandes, ni toucher aux stocks.

La matrice complète est consultable dans l'application : `/administration`.

## Validation des entrées

Chaque Server Action et chaque route handler valide ses entrées avec Zod avant
toute lecture ou écriture. Un `FormData` n'est jamais utilisé directement.
Les identifiants sont validés comme UUID, les quantités bornées.

## Mutations

Toutes les écritures passent par des Server Actions. Aucune route d'écriture
publique. Le copilote IA n'a **structurellement** aucun chemin vers une
mutation : `POST /api/copilote` n'appelle que des lectures.

Séquence imposée :

```
autorisation → validation → lecture de l'état → règle de domaine
             → écriture → journal d'audit → revalidation
```

## Pseudonymisation IA

Aucun nom, prénom, matricule, email ou téléphone de salarié n'est transmis à
OpenAI. Voir [docs/AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) (section « Pseudonymisation IA »)
pour le détail : alias temporaire régénéré à chaque appel
(`server/domain/ai-privacy.ts`), filet de sécurité par liste noire de champs
sur chaque résultat d'outil, restauration des identités uniquement côté
serveur. Le matricule reste par ailleurs l'identifiant salarié normal de
l'application et de la base — cette couche ne concerne que la frontière avec
un fournisseur IA distant.

Cette pseudonymisation ne remplace pas le RBAC : l'outil IA
`get_operator_production` reste soumis à `hr:read` **et** `production:read`,
comme n'importe quelle donnée de production nommément identifiable. Un
utilisateur ne peut pas obtenir via le copilote une donnée à laquelle il n'a
pas accès directement — l'IA n'a jamais plus de droits que la session qui
l'interroge.

## Journal d'audit

`audit_logs` conserve utilisateur, date, action, entité, **ancienne valeur**,
**nouvelle valeur** et justification. Sont tracés notamment : connexions,
création et modification de commande, changement d'état machine, déclaration
d'incident, clôture de palette, approbation ou refus de recommandation, prise en
charge et clôture d'alerte.

## Secrets

- Aucun secret dans le bundle navigateur : les modules serveur sont marqués
  `import 'server-only'`, ce qui casse le build en cas d'import fautif.
- `.env*` est ignoré par git ; `.env.example` documente les variables sans valeur.
- Variables sensibles : `AUTH_SECRET`, `DATABASE_URL`, et plus tard la clé du
  fournisseur IA et le secret de la passerelle machine.

## Base de données

- Requêtes paramétrées par Drizzle : pas de concaténation SQL.
- Migrations versionnées et rejouables.
- `npm run db:reset` refuse de s'exécuter si `NODE_ENV=production`, sauf
  `APP_ALLOW_RESET=true` explicite.

## Reste à durcir avant la production

| Sujet                    | Action                                                        |
| ------------------------ | ------------------------------------------------------------- |
| Limitation de débit      | Sur la connexion et sur `/api/copilote`                       |
| Rotation des sessions    | Régénérer le jeton après connexion et changement de rôle      |
| Politique de mots de passe| Longueur minimale, blocage temporaire après échecs répétés   |
| Sauvegardes              | Sauvegarde chiffrée quotidienne + test de restauration        |
| En-têtes HTTP            | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`        |
| Chiffrement en transit   | TLS obligatoire, y compris entre le backend et PostgreSQL     |
| Double authentification  | Au minimum pour la direction et l'administration              |
| Revue d'accès            | Revue périodique des comptes et des rôles                     |
