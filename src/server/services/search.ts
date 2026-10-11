import 'server-only';

import { eq, ilike, or } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { can, type PermissionCode } from '../domain/permissions';

/**
 * Recherche globale (§37).
 *
 * Une seule requête utilisateur balaie toutes les entités métier. Les
 * résultats sont filtrés par permission : on ne renvoie jamais une entité que
 * l'utilisateur n'aurait pas le droit d'ouvrir.
 */

export type SearchResult = {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  subtitle: string;
  href: string;
};

const LIMIT_PER_TYPE = 5;

export async function globalSearch(
  query: string,
  permissions: readonly PermissionCode[],
): Promise<SearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const pattern = `%${term}%`;
  const db = await getDb();
  const results: SearchResult[] = [];

  if (can(permissions, 'orders:read')) {
    const rows = await db
      .select({
        id: t.customerOrders.id,
        number: t.customerOrders.number,
        status: t.customerOrders.status,
        customerName: t.customers.name,
      })
      .from(t.customerOrders)
      .innerJoin(t.customers, eq(t.customerOrders.customerId, t.customers.id))
      .where(or(ilike(t.customerOrders.number, pattern), ilike(t.customers.name, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...rows.map((row) => ({
        id: row.id,
        type: 'order',
        typeLabel: 'Commande',
        title: `Commande #${row.number}`,
        subtitle: `${row.customerName} · ${orderStatusLabel(row.status)}`,
        href: `/commandes/${row.id}`,
      })),
    );
  }

  if (can(permissions, 'catalog:read')) {
    const rows = await db
      .select({
        id: t.products.id,
        reference: t.products.reference,
        name: t.products.name,
        family: t.products.family,
      })
      .from(t.products)
      .where(or(ilike(t.products.reference, pattern), ilike(t.products.name, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...rows.map((row) => ({
        id: row.id,
        type: 'product',
        typeLabel: 'Pièce',
        title: row.name,
        subtitle: `${row.reference} · ${row.family}`,
        href: `/catalogue/${row.id}`,
      })),
    );

    const molds = await db
      .select({ id: t.molds.id, reference: t.molds.reference, name: t.molds.name, location: t.molds.location })
      .from(t.molds)
      .where(or(ilike(t.molds.reference, pattern), ilike(t.molds.name, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...molds.map((row) => ({
        id: row.id,
        type: 'mold',
        typeLabel: 'Moule',
        title: `${row.reference} — ${row.name}`,
        subtitle: row.location ?? 'Emplacement non renseigné',
        href: `/moules`,
      })),
    );
  }

  if (can(permissions, 'machines:read')) {
    const rows = await db
      .select({
        id: t.machines.id,
        code: t.machines.code,
        name: t.machines.name,
        status: t.machines.status,
        workshopName: t.workshops.name,
      })
      .from(t.machines)
      .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
      .where(or(ilike(t.machines.code, pattern), ilike(t.machines.name, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...rows.map((row) => ({
        id: row.id,
        type: 'machine',
        typeLabel: 'Machine',
        title: row.name,
        subtitle: `${row.workshopName} · ${row.code}`,
        href: `/machines/${row.id}`,
      })),
    );
  }

  if (can(permissions, 'inventory:read')) {
    const rows = await db
      .select({ id: t.inventoryItems.id, sku: t.inventoryItems.sku, name: t.inventoryItems.name, kind: t.inventoryItems.kind })
      .from(t.inventoryItems)
      .where(or(ilike(t.inventoryItems.sku, pattern), ilike(t.inventoryItems.name, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...rows.map((row) => ({
        id: row.id,
        type: 'inventory',
        typeLabel: 'Stock',
        title: row.name,
        subtitle: row.sku,
        href: `/stocks`,
      })),
    );

    const pallets = await db
      .select({ id: t.pallets.id, code: t.pallets.code, status: t.pallets.status, lotNumber: t.pallets.lotNumber })
      .from(t.pallets)
      .where(or(ilike(t.pallets.code, pattern), ilike(t.pallets.lotNumber, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...pallets.map((row) => ({
        id: row.id,
        type: 'pallet',
        typeLabel: 'Palette',
        title: row.code,
        subtitle: `Lot ${row.lotNumber ?? '—'}`,
        href: `/stocks/palettes/${row.id}`,
      })),
    );
  }

  if (can(permissions, 'hr:read')) {
    const rows = await db
      .select({
        id: t.employees.id,
        matricule: t.employees.matricule,
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
        jobTitle: t.employees.jobTitle,
      })
      .from(t.employees)
      .where(
        or(
          ilike(t.employees.firstName, pattern),
          ilike(t.employees.lastName, pattern),
          ilike(t.employees.matricule, pattern),
        ),
      )
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...rows.map((row) => ({
        id: row.id,
        type: 'employee',
        typeLabel: 'Employé',
        title: `${row.firstName} ${row.lastName}`,
        subtitle: `${row.matricule} · ${row.jobTitle}`,
        href: `/personnel`,
      })),
    );
  }

  if (can(permissions, 'suppliers:read')) {
    const rows = await db
      .select({ id: t.suppliers.id, code: t.suppliers.code, name: t.suppliers.name, category: t.suppliers.category })
      .from(t.suppliers)
      .where(or(ilike(t.suppliers.name, pattern), ilike(t.suppliers.code, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...rows.map((row) => ({
        id: row.id,
        type: 'supplier',
        typeLabel: 'Fournisseur',
        title: row.name,
        subtitle: row.category ?? row.code,
        href: `/fournisseurs`,
      })),
    );
  }

  if (can(permissions, 'history:read')) {
    const rows = await db
      .select({
        id: t.incidents.id,
        reference: t.incidents.reference,
        title: t.incidents.title,
        status: t.incidents.status,
      })
      .from(t.incidents)
      .where(or(ilike(t.incidents.reference, pattern), ilike(t.incidents.title, pattern), ilike(t.incidents.symptom, pattern)))
      .limit(LIMIT_PER_TYPE);

    results.push(
      ...rows.map((row) => ({
        id: row.id,
        type: 'incident',
        typeLabel: 'Incident',
        title: row.title,
        subtitle: `${row.reference} · ${row.status}`,
        href: `/historique`,
      })),
    );
  }

  return results;
}

function orderStatusLabel(status: string): string {
  return (
    {
      draft: 'Brouillon',
      confirmed: 'Confirmée',
      in_production: 'En production',
      ready: 'Prête',
      shipped: 'Expédiée',
      cancelled: 'Annulée',
    }[status] ?? status
  );
}
