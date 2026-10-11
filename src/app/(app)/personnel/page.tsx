import type { Metadata } from 'next';
import { and, eq, gte, lte } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { checkQualification, computeShiftCoverage, findTransferCandidates } from '@/server/domain/staffing';
import { EmployeeEditorDialog } from '@/components/factory/employee-editor-dialog';
import { EmployeeToggleActive } from '@/components/factory/employee-toggle-active';
import { EmployeeHrDialog } from '@/components/factory/employee-hr-dialog';
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  Progress,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { AttentionBar } from '@/components/factory/attention-bar';
import type { AttentionItem } from '@/server/domain/attention';
import { formatDate, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Personnel' };
export const dynamic = 'force-dynamic';

const SHIFT_LABELS = { morning: 'Matin', afternoon: 'Après-midi', night: 'Nuit' } as const;
const ABSENCE_LABELS: Record<string, string> = {
  holiday: 'Congés',
  sick_leave: 'Arrêt maladie',
  training: 'Formation',
  unpaid: 'Sans solde',
  other: 'Autre',
};

export default async function StaffPage() {
  const user = await requirePermission('hr:read');
  const canWrite = can(user.permissions, 'hr:write');
  const db = await getDb();
  const now = new Date();

  const [employees, skills, qualifications, absences, workshops, allSkills] = await Promise.all([
    db
      .select({
        id: t.employees.id,
        matricule: t.employees.matricule,
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
        jobTitle: t.employees.jobTitle,
        shift: t.employees.shift,
        workshopId: t.employees.workshopId,
        workshopName: t.workshops.name,
        isActive: t.employees.isActive,
        hourlyCostCents: t.employees.hourlyCostCents,
        hiredAt: t.employees.hiredAt,
      })
      .from(t.employees)
      .leftJoin(t.workshops, eq(t.employees.workshopId, t.workshops.id))
      .orderBy(t.employees.lastName),
    db
      .select({
        employeeId: t.employeeSkills.employeeId,
        level: t.employeeSkills.level,
        code: t.skills.code,
        name: t.skills.name,
      })
      .from(t.employeeSkills)
      .innerJoin(t.skills, eq(t.employeeSkills.skillId, t.skills.id)),
    db
      .select({
        employeeId: t.qualifications.employeeId,
        label: t.qualifications.label,
        kind: t.qualifications.kind,
        expiresAt: t.qualifications.expiresAt,
        alertLeadDays: t.qualifications.alertLeadDays,
      })
      .from(t.qualifications),
    db
      .select({
        employeeId: t.absences.employeeId,
        type: t.absences.type,
        startsAt: t.absences.startsAt,
        endsAt: t.absences.endsAt,
        reason: t.absences.reason,
      })
      .from(t.absences)
      .where(and(lte(t.absences.startsAt, now), gte(t.absences.endsAt, now))),
    db.select().from(t.workshops).orderBy(t.workshops.code),
    db.select({ id: t.skills.id, name: t.skills.name }).from(t.skills).orderBy(t.skills.name),
  ]);

  const absentIds = new Set(absences.map((absence) => absence.employeeId));
  const active = employees.filter((employee) => employee.isActive);

  const expiring = qualifications
    .map((qualification) => ({
      ...qualification,
      check: checkQualification(qualification.expiresAt, now, qualification.alertLeadDays),
      employee: employees.find((employee) => employee.id === qualification.employeeId),
    }))
    .filter((row) => row.check.status !== 'valid')
    .sort((a, b) => (a.check.daysRemaining ?? 0) - (b.check.daysRemaining ?? 0));

  const coverage = (['morning', 'afternoon', 'night'] as const).map((shift) => {
    const team = active.filter((employee) => employee.shift === shift);
    return computeShiftCoverage(shift, team.length, team.filter((e) => !absentIds.has(e.id)).length);
  });

  // « Qui puis-je déplacer ? » (§22) — calculé sur l'atelier le plus fourni.
  const sourceWorkshop = workshops[0];
  const targetWorkshop = workshops[1];
  const transferCandidates =
    sourceWorkshop && targetWorkshop
      ? findTransferCandidates(
          active.map((employee) => ({
            employeeId: employee.id,
            fullName: `${employee.firstName} ${employee.lastName}`,
            workshopId: employee.workshopId,
            jobTitle: employee.jobTitle,
            shift: employee.shift,
            skills: skills
              .filter((skill) => skill.employeeId === employee.id)
              .map((skill) => skill.code),
            validQualifications: qualifications
              .filter(
                (qualification) =>
                  qualification.employeeId === employee.id &&
                  checkQualification(qualification.expiresAt, now).status !== 'expired',
              )
              .map((qualification) => qualification.kind),
            isAbsent: absentIds.has(employee.id),
            availableFrom:
              employee.shift === 'morning' ? '06:00' : employee.shift === 'afternoon' ? '14:00' : '22:00',
          })),
          {
            fromWorkshopId: sourceWorkshop.id,
            toWorkshopId: targetWorkshop.id,
            requiredSkills: ['presse_1000t', 'reglage'],
            requiredQualifications: ['sst'],
            sourceHeadcount: active.filter((e) => e.workshopId === sourceWorkshop.id).length,
            sourceMinimumHeadcount: Math.max(
              active.filter((e) => e.workshopId === sourceWorkshop.id).length - 2,
              1,
            ),
          },
        )
      : [];

  /*
   * Une habilitation expirée interdit à quelqu'un de tenir son poste : c'est
   * critique. Une habilitation qui approche de son terme se planifie : c'est
   * une attention. Les deux étaient noyées en bas de page.
   */
  const attention: AttentionItem[] = expiring.map((row) => ({
    // La requête ne remonte pas l'identifiant de l'habilitation : la paire
    // employé + intitulé est unique et suffit à distinguer deux lignes.
    id: `${row.employeeId}-${row.label}`,
    severity: row.check.status === 'expired' ? 'critical' : 'warning',
    title: `${row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : 'Employé inconnu'} — ${row.label}`,
    detail:
      row.check.status === 'expired'
        ? `Habilitation expirée depuis ${Math.abs(row.check.daysRemaining ?? 0)} jour${Math.abs(row.check.daysRemaining ?? 0) > 1 ? 's' : ''}`
        : `Expire dans ${row.check.daysRemaining} jour${(row.check.daysRemaining ?? 0) > 1 ? 's' : ''}`,
  }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Personnel"
        description="Effectifs, compétences, habilitations et absences — la base de toute décision d’affectation."
      />

      <AttentionBar items={attention} className="mb-6" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Effectif actif</p>
          <p className="tabular mt-2 text-[1.75rem] leading-none font-semibold text-fg">
            {formatNumber(active.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Absents aujourd’hui</p>
          <p className="tabular mt-2 text-[1.75rem] leading-none font-semibold text-warning">
            {absences.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Habilitations à renouveler</p>
          <p className="tabular mt-2 text-[1.75rem] leading-none font-semibold text-info">
            {expiring.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.75rem] font-medium text-fg-muted">Compétences référencées</p>
          <p className="tabular mt-2 text-[1.75rem] leading-none font-semibold text-fg">
            {new Set(skills.map((skill) => skill.code)).size}
          </p>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title="Couverture des équipes" subtitle="Présents rapportés à l’effectif prévu" />
          <div className="space-y-4 px-5 pb-5">
            {coverage.map((shift) => (
              <div key={shift.shift}>
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="font-medium text-fg">{SHIFT_LABELS[shift.shift]}</span>
                  <span className="tabular text-fg-muted">
                    {shift.present} / {shift.required} · {shift.coveragePct} %
                  </span>
                </div>
                <Progress
                  value={shift.coveragePct}
                  severity={shift.severity}
                  className="mt-1.5"
                  label={`Couverture ${SHIFT_LABELS[shift.shift]}`}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Habilitations"
            subtitle="Alerte déclenchée plusieurs mois avant expiration"
          />
          {expiring.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-muted">Toutes les habilitations sont à jour.</p>
          ) : (
            <ul className="space-y-2.5 px-5 pb-5">
              {expiring.map((qualification, index) => (
                <li key={index} className="flex items-start justify-between gap-3 text-[0.8125rem]">
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">
                      {qualification.employee
                        ? `${qualification.employee.firstName} ${qualification.employee.lastName}`
                        : '—'}
                    </span>
                    <span className="block text-xs text-fg-subtle">{qualification.label}</span>
                  </span>
                  <StatusBadge
                    severity={qualification.check.status === 'expired' ? 'critical' : 'info'}
                    size="sm"
                  >
                    {qualification.check.status === 'expired'
                      ? 'Expirée'
                      : `${qualification.check.daysRemaining} j`}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Qui puis-je déplacer ?"
            subtitle={
              sourceWorkshop && targetWorkshop
                ? `De ${sourceWorkshop.name} vers ${targetWorkshop.name}, sans mettre l’atelier source en difficulté`
                : ''
            }
          />
          {transferCandidates.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-muted">Aucun transfert possible actuellement.</p>
          ) : (
            <ul className="space-y-2.5 px-5 pb-5">
              {transferCandidates.slice(0, 4).map((candidate) => (
                <li key={candidate.employeeId} className="text-[0.8125rem]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-fg">{candidate.fullName}</span>
                    <StatusBadge severity={candidate.isSafe ? 'normal' : 'warning'} size="sm">
                      {candidate.isSafe ? 'Possible' : 'Déconseillé'}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {candidate.isSafe
                      ? `Disponible à partir de ${candidate.availableFrom}. L’atelier source conserverait ${candidate.sourceCapacityAfterPct} % de sa capacité.`
                      : candidate.missingSkills.length > 0
                        ? `Compétences manquantes : ${candidate.missingSkills.join(', ')}.`
                        : 'L’atelier source passerait sous son effectif minimum.'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Fiches salariés"
          subtitle={`${employees.length} personnes`}
          action={canWrite ? <EmployeeEditorDialog employee={null} workshops={workshops} /> : undefined}
        />
        <Table>
          <thead>
            <tr>
              <Th>Salarié</Th>
              <Th>Matricule</Th>
              <Th>Atelier</Th>
              <Th>Poste</Th>
              <Th>Équipe</Th>
              <Th>Compétences</Th>
              <Th>Habilitations</Th>
              <Th>Présence</Th>
              {canWrite ? <Th>Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const employeeSkills = skills.filter((skill) => skill.employeeId === employee.id);
              const employeeQualifications = qualifications.filter(
                (qualification) => qualification.employeeId === employee.id,
              );
              const absence = absences.find((row) => row.employeeId === employee.id);

              return (
                <Tr key={employee.id}>
                  <Td className="font-medium">
                    {employee.firstName} {employee.lastName}
                  </Td>
                  <Td className="font-mono text-xs text-fg-subtle">{employee.matricule}</Td>
                  <Td className="text-fg-muted">{employee.workshopName ?? '—'}</Td>
                  <Td className="text-fg-muted">{employee.jobTitle}</Td>
                  <Td className="text-fg-muted">{SHIFT_LABELS[employee.shift]}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {employeeSkills.length === 0 ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        employeeSkills.map((skill) => (
                          <Badge key={skill.code} tone="outline">
                            {skill.name} · N{skill.level}
                          </Badge>
                        ))
                      )}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {employeeQualifications.length === 0 ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        employeeQualifications.map((qualification, index) => {
                          const check = checkQualification(
                            qualification.expiresAt,
                            now,
                            qualification.alertLeadDays,
                          );
                          return (
                            <StatusBadge
                              key={index}
                              size="sm"
                              severity={
                                check.status === 'expired'
                                  ? 'critical'
                                  : check.status === 'expiring'
                                    ? 'info'
                                    : 'normal'
                              }
                            >
                              {qualification.label.split(' ')[0]}
                              {qualification.expiresAt ? ` · ${formatDate(qualification.expiresAt)}` : ''}
                            </StatusBadge>
                          );
                        })
                      )}
                    </span>
                  </Td>
                  <Td>
                    {absence ? (
                      <StatusBadge severity="warning" size="sm">
                        {ABSENCE_LABELS[absence.type] ?? absence.type}
                      </StatusBadge>
                    ) : (
                      <StatusBadge severity="normal" size="sm">
                        Présent
                      </StatusBadge>
                    )}
                  </Td>
                  {canWrite ? (
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <EmployeeEditorDialog
                          employee={{
                            id: employee.id,
                            matricule: employee.matricule,
                            firstName: employee.firstName,
                            lastName: employee.lastName,
                            workshopId: employee.workshopId,
                            jobTitle: employee.jobTitle,
                            shift: employee.shift,
                            hourlyCostCents: employee.hourlyCostCents,
                            hiredAt: employee.hiredAt ? employee.hiredAt.toISOString() : null,
                          }}
                          workshops={workshops}
                        />
                        <EmployeeHrDialog employee={employee} skills={allSkills} />
                        <EmployeeToggleActive employeeId={employee.id} isActive={employee.isActive} />
                      </div>
                    </Td>
                  ) : null}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
