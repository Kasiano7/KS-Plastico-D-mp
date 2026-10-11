import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { assetCriticalityEnum, assetTypeEnum } from './enums';
import { workshops } from './factory';

/**
 * Référentiel des actifs du site.
 *
 * La table `machines` ne décrit que les presses à injection. Tout le reste de
 * ce qu'on entretient — compresseurs, groupes froids, convoyeurs, portes,
 * éclairage, ventilation, bâtiments, utilités — n'existait nulle part, ce qui
 * a obligé l'écran de maintenance à fonctionner sur des valeurs écrites à la
 * main.
 *
 * `assets` porte l'**identité** d'un équipement : ce qu'il est, où il est, à
 * quel point son arrêt coûte. Une presse est un actif comme un autre, avec en
 * plus une table `machines` qui porte ce qui lui est propre — tonnage, moule
 * en cours, télémétrie. C'est la spécialisation, pas le doublon : chaque
 * presse a exactement une ligne ici.
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Identifiant lisible par l'atelier : « PR-64 », « COMP-01 », « BAT-A ». */
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    type: assetTypeEnum('type').notNull(),
    criticality: assetCriticalityEnum('criticality').notNull().default('normal'),
    /**
     * Atelier de rattachement. `null` pour ce qui sert tout le site — un
     * bâtiment, le réseau d'air comprimé, le poste de livraison électrique.
     */
    workshopId: uuid('workshop_id').references(() => workshops.id),
    /** Emplacement libre, quand l'atelier ne suffit pas à retrouver l'objet. */
    location: text('location'),
    manufacturer: text('manufacturer'),
    model: text('model'),
    serialNumber: text('serial_number'),
    commissionedAt: timestamp('commissioned_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assets_type_idx').on(t.type, t.isActive),
    index('assets_workshop_idx').on(t.workshopId),
  ],
);

export const assetsRelations = relations(assets, ({ one }) => ({
  workshop: one(workshops, { fields: [assets.workshopId], references: [workshops.id] }),
}));
