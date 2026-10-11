import { describe, expect, it } from 'vitest';
import {
  eventsToCsv,
  filterMachineEvents,
  formatEventDuration,
  groupCorrelatedEvents,
  paginate,
  paginationRange,
  relatedEvents,
  sortByRecency,
  summarizeBySeverity,
  topAlarms,
  totalDowntimeSeconds,
  type MachineEventRecord,
} from '../machine-events';

function event(overrides: Partial<MachineEventRecord> & Pick<MachineEventRecord, 'id'>): MachineEventRecord {
  return {
    machineId: 'M1',
    occurredAt: new Date('2026-05-21T09:31:45Z'),
    type: 'alarm',
    severity: 'critical',
    code: 'E-1024',
    title: 'Défaut robot prélèv. pièce',
    description: 'Échec de la prise de pièce au robot',
    durationSeconds: 138,
    endedAt: null,
    impact: 'machine_stop',
    operator: 'Paul Martin',
    shift: 'Équipe A (Matin)',
    status: 'resolved',
    productReference: 'SUP-BAT-12',
    readings: [],
    correctiveAction: null,
    maintenanceComment: null,
    productionImpact: { downtimeSeconds: 138, lostParts: 12, rejectedParts: 2 },
    parentEventId: null,
    source: 'simulated',
    ...overrides,
  };
}

describe('filterMachineEvents', () => {
  const events = [
    event({ id: '1', code: 'E-1024', operator: 'Paul Martin' }),
    event({
      id: '2',
      code: 'E-3007',
      type: 'incident',
      severity: 'major',
      title: 'Température huile élevée',
      operator: 'Sophie Bernard',
    }),
    event({
      id: '3',
      code: 'I-2001',
      type: 'information',
      severity: 'minor',
      title: 'Changement de production',
      operator: 'Équipe B (Soir)',
      occurredAt: new Date('2026-05-19T07:22:05Z'),
    }),
  ];

  it('filtre par type', () => {
    expect(filterMachineEvents(events, { type: 'incident' }).map((e) => e.id)).toEqual(['2']);
  });

  it('filtre par sévérité', () => {
    expect(filterMachineEvents(events, { severity: 'critical' }).map((e) => e.id)).toEqual(['1']);
  });

  it('cherche indifféremment dans le code, le titre, la description et l’opérateur', () => {
    expect(filterMachineEvents(events, { search: 'e-3007' }).map((e) => e.id)).toEqual(['2']);
    expect(filterMachineEvents(events, { search: 'huile' }).map((e) => e.id)).toEqual(['2']);
    expect(filterMachineEvents(events, { search: 'paul' }).map((e) => e.id)).toEqual(['1']);
  });

  it('borne la période demandée', () => {
    const filtered = filterMachineEvents(events, { from: new Date('2026-05-20T00:00:00Z') });
    expect(filtered.map((e) => e.id)).toEqual(['1', '2']);
  });

  it('ne filtre rien avec « all »', () => {
    expect(filterMachineEvents(events, { type: 'all', severity: 'all' })).toHaveLength(3);
  });
});

describe('sortByRecency', () => {
  it('classe du plus récent au plus ancien sans muter la source', () => {
    const source = [
      event({ id: 'ancien', occurredAt: new Date('2026-05-19T10:00:00Z') }),
      event({ id: 'recent', occurredAt: new Date('2026-05-21T10:00:00Z') }),
    ];

    expect(sortByRecency(source).map((e) => e.id)).toEqual(['recent', 'ancien']);
    expect(source[0].id).toBe('ancien');
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 124 }, (_, index) => index);

  it('décrit la tranche affichée telle qu’elle est annoncée à l’écran', () => {
    const page = paginate(items, 1, 10);
    expect(page.items).toHaveLength(10);
    expect(page.firstIndex).toBe(1);
    expect(page.lastIndex).toBe(10);
    expect(page.pageCount).toBe(13);
    expect(page.total).toBe(124);
  });

  it('ramène une page hors bornes dans les bornes', () => {
    expect(paginate(items, 99, 10).page).toBe(13);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it('reste cohérente sur une liste vide', () => {
    const page = paginate([], 1, 10);
    expect(page.firstIndex).toBe(0);
    expect(page.lastIndex).toBe(0);
    expect(page.pageCount).toBe(1);
  });
});

describe('paginationRange', () => {
  it('insère des ellipses autour de la page courante', () => {
    expect(paginationRange(1, 13)).toEqual([1, 2, null, 13]);
    expect(paginationRange(6, 13)).toEqual([1, null, 5, 6, 7, null, 13]);
    expect(paginationRange(13, 13)).toEqual([1, null, 12, 13]);
  });

  it('n’affiche pas d’ellipse quand tout tient', () => {
    expect(paginationRange(1, 3)).toEqual([1, 2, 3]);
    expect(paginationRange(1, 1)).toEqual([1]);
  });
});

describe('summarizeBySeverity', () => {
  it('compte chaque sévérité et sa part', () => {
    const events = [
      event({ id: '1', severity: 'critical' }),
      event({ id: '2', severity: 'major' }),
      event({ id: '3', severity: 'major' }),
      event({ id: '4', severity: 'minor' }),
    ];

    const summary = summarizeBySeverity(events);
    expect(summary.map((row) => row.count)).toEqual([1, 2, 1, 0]);
    expect(summary[1].sharePct).toBe(50);
  });
});

describe('totalDowntimeSeconds', () => {
  it('ne compte que les arrêts machine', () => {
    const events = [
      event({ id: '1', impact: 'machine_stop', productionImpact: { downtimeSeconds: 138, lostParts: 0, rejectedParts: 0 } }),
      event({ id: '2', impact: 'slowdown', productionImpact: { downtimeSeconds: 342, lostParts: 0, rejectedParts: 0 } }),
    ];

    expect(totalDowntimeSeconds(events)).toBe(138);
  });

  it('ne compte pas deux fois une panne ayant déclenché plusieurs alarmes', () => {
    const events = [
      event({ id: 'racine', impact: 'machine_stop', productionImpact: { downtimeSeconds: 600, lostParts: 40, rejectedParts: 0 } }),
      event({
        id: 'consequence',
        parentEventId: 'racine',
        impact: 'machine_stop',
        productionImpact: { downtimeSeconds: 600, lostParts: 40, rejectedParts: 0 },
      }),
    ];

    expect(totalDowntimeSeconds(events)).toBe(600);
  });
});

describe('topAlarms', () => {
  it('classe les codes par fréquence en ignorant les informations', () => {
    const events = [
      event({ id: '1', code: 'E-1024' }),
      event({ id: '2', code: 'E-1024' }),
      event({ id: '3', code: 'E-2011' }),
      event({ id: '4', code: 'I-2001', type: 'information' }),
    ];

    expect(topAlarms(events)).toEqual([
      { code: 'E-1024', title: 'Défaut robot prélèv. pièce', count: 2 },
      { code: 'E-2011', title: 'Défaut robot prélèv. pièce', count: 1 },
    ]);
  });
});

describe('groupCorrelatedEvents', () => {
  const events = [
    event({ id: 'racine', title: 'Défaut robot' }),
    event({ id: 'a', parentEventId: 'racine', title: 'Erreur préhenseur' }),
    event({ id: 'b', parentEventId: 'racine', title: 'Porte sécurité' }),
    event({ id: 'seul', title: 'Niveau matière bas' }),
  ];

  it('rattache les alarmes déclenchées par une même panne', () => {
    const groups = groupCorrelatedEvents(events);
    const principal = groups.find((group) => group.root.id === 'racine');

    expect(groups).toHaveLength(2);
    expect(principal?.related.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('traite un orphelin comme sa propre racine', () => {
    const orphan = [event({ id: 'x', parentEventId: 'absent' })];
    expect(groupCorrelatedEvents(orphan)).toEqual([{ root: orphan[0], related: [] }]);
  });

  it('retrouve les événements liés à une racine', () => {
    expect(relatedEvents(events, 'racine').map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
});

describe('eventsToCsv', () => {
  it('produit un CSV point-virgule protégé contre l’injection de séparateur', () => {
    const csv = eventsToCsv(
      [event({ id: '1', description: 'Valeur ; hors tolérance' })],
      (date) => date.toISOString(),
    );
    const [header, row] = csv.trimEnd().split('\r\n');

    expect(header.startsWith('﻿Date et heure;Type;Sévérité;Code')).toBe(true);
    expect(row).toContain('"Valeur ; hors tolérance"');
    expect(row).toContain('E-1024');
  });
});

describe('formatEventDuration', () => {
  it('formate comme l’écran d’historique', () => {
    expect(formatEventDuration(138)).toBe('02m 18s');
    expect(formatEventDuration(6_502)).toBe('01h 48m 22s');
  });

  it('affiche un tiret quand l’événement n’a pas de durée', () => {
    expect(formatEventDuration(null)).toBe('-');
    expect(formatEventDuration(0)).toBe('-');
  });
});
