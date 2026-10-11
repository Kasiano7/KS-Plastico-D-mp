import { inArray, desc } from 'drizzle-orm';
import { Card, CardHeader, Table, Td, Th, Tr } from '@/components/ui/primitives';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { formatDateTime } from '@/lib/format';

/**
 * Journal des changements de rôles.
 *
 * L'audit enregistrait déjà chaque création, modification et suppression de
 * rôle — personne ne pouvait le lire. Or c'est précisément la trace qu'un
 * auditeur ou un responsable sécurité vient chercher : qui a donné quel droit,
 * à quel rôle, et quand.
 *
 * Les permissions ajoutées et retirées sont calculées par différence entre
 * l'avant et l'après enregistrés : elles ne sont pas stockées comme telles, et
 * c'est cette différence qui est lisible, pas deux listes de trente lignes.
 */

const ACTION_LABELS: Record<string, string> = {
  'role.create': 'Rôle créé',
  'role.update': 'Rôle modifié',
  'role.delete': 'Rôle supprimé',
  'user.role_change': 'Rôle d’un utilisateur changé',
};

type PermissionSnapshot = { permissions?: unknown };

/** Extrait la liste de permissions d'une valeur JSON d'audit, si elle en porte une. */
function permissionsOf(value: unknown): string[] {
  const snapshot = value as PermissionSnapshot | null;
  if (!snapshot || !Array.isArray(snapshot.permissions)) return [];
  return snapshot.permissions.filter((entry): entry is string => typeof entry === 'string');
}

export async function RoleAuditTrail() {
  const db = await getDb();

  const entries = await db
    .select({
      id: t.auditLogs.id,
      action: t.auditLogs.action,
      userLabel: t.auditLogs.userLabel,
      entityLabel: t.auditLogs.entityLabel,
      previousValue: t.auditLogs.previousValue,
      newValue: t.auditLogs.newValue,
      occurredAt: t.auditLogs.occurredAt,
    })
    .from(t.auditLogs)
    .where(inArray(t.auditLogs.action, Object.keys(ACTION_LABELS)))
    .orderBy(desc(t.auditLogs.occurredAt))
    .limit(25);

  return (
    <Card className="mb-5">
      <CardHeader
        title="Journal des rôles"
        subtitle="Qui a modifié quel rôle, et ce que la modification a changé"
      />

      {entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-muted">
          Aucune modification de rôle enregistrée. Ce journal se remplira dès la première création
          ou modification.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Quand</Th>
              <Th>Qui</Th>
              <Th>Action</Th>
              <Th>Rôle</Th>
              <Th>Changement</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const before = permissionsOf(entry.previousValue);
              const after = permissionsOf(entry.newValue);
              const granted = after.filter((code) => !before.includes(code));
              const revoked = before.filter((code) => !after.includes(code));

              return (
                <Tr key={entry.id}>
                  <Td className="text-xs whitespace-nowrap text-fg-subtle">
                    {formatDateTime(entry.occurredAt)}
                  </Td>
                  <Td className="text-fg-muted">{entry.userLabel ?? '—'}</Td>
                  <Td className="whitespace-nowrap">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </Td>
                  <Td className="font-medium">{entry.entityLabel ?? '—'}</Td>
                  <Td>
                    {granted.length === 0 && revoked.length === 0 ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {granted.map((code) => (
                          <span
                            key={`+${code}`}
                            className="rounded-md bg-normal-soft px-1.5 py-0.5 font-mono text-[0.6875rem] text-normal"
                          >
                            +{code}
                          </span>
                        ))}
                        {revoked.map((code) => (
                          <span
                            key={`-${code}`}
                            className="rounded-md bg-critical-soft px-1.5 py-0.5 font-mono text-[0.6875rem] text-critical"
                          >
                            −{code}
                          </span>
                        ))}
                      </span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
