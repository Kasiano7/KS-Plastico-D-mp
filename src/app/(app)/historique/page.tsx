import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { listAuditLogs } from '@/server/services/audit';
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { formatCents, formatDate, formatDateTime, formatDuration } from '@/lib/format';

export const metadata: Metadata = { title: 'Historique' };
export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Connexion',
  'order.create': 'Création de commande',
  'order.priority_change': 'Changement de priorité',
  'machine.status_change': 'Changement d’état machine',
  'incident.declare': 'Déclaration d’incident',
  'incident.resolve': 'Résolution d’incident',
  'maintenance.schedule': 'Planification de maintenance',
  'maintenance.complete': 'Maintenance terminée',
  'pallet.complete': 'Palette clôturée',
  'pallet.cancel': 'Palette annulée',
  'recommendation.approve': 'Recommandation approuvée',
  'recommendation.execute': 'Recommandation appliquée',
  'recommendation.reject': 'Recommandation refusée',
  'alert.acknowledge': 'Alerte prise en charge',
  'alert.resolve': 'Alerte clôturée',
  'production_order.start': 'Ordre de fabrication démarré',
  'production_order.pause': 'Ordre de fabrication suspendu',
  'production_order.resume': 'Ordre de fabrication repris',
  'production_order.complete': 'Ordre de fabrication clôturé',
  'user.create': 'Création de compte',
  'user.activate': 'Activation de compte',
  'user.deactivate': 'Désactivation de compte',
  'user.password_reset': 'Réinitialisation de mot de passe',
  'user.role_change': 'Changement de rôle',
  'role.create': 'Création de rôle',
  'role.update': 'Modification de rôle',
  'role.delete': 'Suppression de rôle',
};

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  open: 'Ouvert',
  investigating: 'En cours d’analyse',
  resolved: 'Résolu',
  closed: 'Clôturé',
};

/** Historique, traçabilité et mémoire de l'usine (§35, §36). */
export default async function HistoryPage() {
  await requirePermission('history:read');
  const db = await getDb();

  const [logs, incidents, pallets] = await Promise.all([
    listAuditLogs(60),
    db
      .select({
        incident: t.incidents,
        machineName: t.machines.name,
      })
      .from(t.incidents)
      .leftJoin(t.machines, eq(t.incidents.machineId, t.machines.id))
      .orderBy(desc(t.incidents.occurredAt))
      .limit(20),
    db
      .select({
        id: t.pallets.id,
        code: t.pallets.code,
        lotNumber: t.pallets.lotNumber,
        quantityUnits: t.pallets.quantityUnits,
        completedAt: t.pallets.completedAt,
        status: t.pallets.status,
        productName: t.products.name,
        machineName: t.machines.name,
        orderNumber: t.customerOrders.number,
      })
      .from(t.pallets)
      .innerJoin(t.products, eq(t.pallets.productId, t.products.id))
      .leftJoin(t.machines, eq(t.pallets.machineId, t.machines.id))
      .leftJoin(t.customerOrders, eq(t.pallets.customerOrderId, t.customerOrders.id))
      .orderBy(desc(t.pallets.completedAt))
      .limit(20),
  ]);

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Historique et traçabilité"
        description="Journal d’audit des décisions, mémoire des incidents et traçabilité des palettes."
      />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="Journal d’audit"
            subtitle="Utilisateur, action, valeur avant et après, justification"
          />
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Utilisateur</Th>
                <Th>Action</Th>
                <Th>Objet</Th>
                <Th>Détail</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <Tr key={log.id}>
                  <Td className="text-xs whitespace-nowrap text-fg-subtle">
                    {formatDateTime(log.occurredAt)}
                  </Td>
                  <Td className="text-fg-muted">{log.userLabel ?? 'Système'}</Td>
                  <Td className="font-medium">{ACTION_LABELS[log.action] ?? log.action}</Td>
                  <Td className="text-fg-muted">{log.entityLabel ?? log.entityType}</Td>
                  <Td className="max-w-[260px] truncate text-xs text-fg-subtle">
                    {log.justification ??
                      (log.newValue ? JSON.stringify(log.newValue) : '—')}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            title="Mémoire de l’usine"
            subtitle="Incidents, causes racines et solutions appliquées"
          />
          <ul className="space-y-3 px-5 pb-5">
            {incidents.map(({ incident, machineName }) => (
              <li key={incident.id} className="rounded-[var(--radius-control)] border border-line p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge severity={incident.severity} size="sm">
                    {incident.reference}
                  </StatusBadge>
                  <Badge>{INCIDENT_STATUS_LABELS[incident.status] ?? incident.status}</Badge>
                  <span className="ml-auto text-xs text-fg-subtle">
                    {formatDate(incident.occurredAt)}
                  </span>
                </div>
                <p className="mt-2 text-[0.875rem] font-medium text-fg">{incident.title}</p>
                {machineName ? (
                  <p className="text-xs text-fg-subtle">{machineName}</p>
                ) : null}
                <p className="mt-1.5 text-[0.8125rem] text-fg-muted">{incident.symptom}</p>
                {incident.rootCause ? (
                  <p className="mt-1.5 text-[0.8125rem] text-fg">
                    <span className="font-medium">Cause : </span>
                    {incident.rootCause}
                  </p>
                ) : null}
                {incident.resolution ? (
                  <p className="mt-1 text-[0.8125rem] text-normal">
                    <span className="font-medium">Solution : </span>
                    {incident.resolution}
                  </p>
                ) : null}
                <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                  {incident.downtimeMinutes > 0 ? (
                    <span>{formatDuration(incident.downtimeMinutes)} d’arrêt</span>
                  ) : null}
                  {incident.estimatedCostCents > 0 ? (
                    <span>impact {formatCents(incident.estimatedCostCents)}</span>
                  ) : null}
                  {incident.tags && incident.tags.length > 0 ? (
                    <span>{incident.tags.join(' · ')}</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Traçabilité des palettes"
          subtitle="Pièce, quantité, lot, machine et commande — reconstitués depuis le QR code"
        />
        <Table>
          <thead>
            <tr>
              <Th>Palette</Th>
              <Th>Pièce</Th>
              <Th>Lot</Th>
              <Th>Machine</Th>
              <Th>Commande</Th>
              <Th numeric>Quantité</Th>
              <Th>Clôturée</Th>
            </tr>
          </thead>
          <tbody>
            {pallets.map((pallet) => (
              <Tr key={pallet.id}>
                <Td className="font-mono text-xs">{pallet.code}</Td>
                <Td className="font-medium">{pallet.productName}</Td>
                <Td className="font-mono text-xs text-fg-subtle">{pallet.lotNumber ?? '—'}</Td>
                <Td className="text-fg-muted">{pallet.machineName ?? '—'}</Td>
                <Td className="text-fg-muted">
                  {pallet.orderNumber ? `#${pallet.orderNumber}` : '—'}
                </Td>
                <Td numeric>{pallet.quantityUnits}</Td>
                <Td className="text-xs text-fg-subtle">
                  {pallet.completedAt ? formatDateTime(pallet.completedAt) : 'En cours'}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
