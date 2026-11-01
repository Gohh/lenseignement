import ExcelJS from 'exceljs';
import {
  BRANCHES,
  PILOT_CYCLE_LABELS,
  PILOT_PERIOD_LABELS,
  type PilotFigure,
  type PilotOverview,
  type PilotState,
  type StatsOverview,
} from '@lenseignement/types';

// Classeur Excel du tableau de pilotage : un onglet par section, couleurs d'état, barres dans les
// cellules, filtres, en-têtes figés, prêt à imprimer. Les chiffres restent des nombres (tri,
// sommes, graphiques) ; un chiffre masqué (groupe de moins de 5) s'écrit « – ».

const C = {
  primary: 'FF146B46',
  dark: 'FF10301F',
  soft: 'FFE7F2EC',
  card: 'FFF6FBF8',
  cardLine: 'FFCFE3D7',
  line: 'FFE3E6E1',
  zebra: 'FFFAFBF9',
  muted: 'FF4A5A6E',
  masked: 'FF9AA3AD',
  noteFill: 'FFFFF8E6',
  noteText: 'FF6B4A00',
  white: 'FFFFFFFF',
  up: 'FF006300',
  down: 'FFA52A32',
};

const STATES: Record<PilotState, { label: string; fill: string; text: string }> = {
  alert: { label: 'En alerte', fill: 'FFFBE6E6', text: 'FFA52A32' },
  watch: { label: 'À surveiller', fill: 'FFFFF4DC', text: 'FF6B4A00' },
  ok: { label: 'Bon', fill: 'FFE7F6E7', text: 'FF006300' },
};
const ALERT_LABELS: Record<PilotState, string> = {
  alert: 'Alerte',
  watch: 'À surveiller',
  ok: 'Bonne nouvelle',
};

const FONT = 'Calibri';
const PERCENT = '0" %"';
const INTEGER = '# ##0';
/** Évolution en points : vert et ▲ si ça monte, rouge et ▼ si ça baisse. */
const POINTS = '[Color10]"▲ +"0;[Red]"▼ −"0;"= 0"';

type Value = string | number | Date | null;
type Kind = 'text' | 'int' | 'pct' | 'points' | 'date';

interface Column {
  header: string;
  width: number;
  kind: Kind;
}

const fill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

/** Mise en page commune : A4 paysage, une page de large, pied de page numéroté. */
function setupPage(ws: ExcelJS.Worksheet, headerRow?: number) {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    ...(headerRow ? { printTitlesRow: `${headerRow}:${headerRow}` } : {}),
  };
  ws.headerFooter = {
    oddFooter: '&L&8L’Enseignement · Tableau de pilotage · Aucun nom d’élève&R&8Page &P / &N',
  };
  ws.properties.defaultRowHeight = 20;
}

/** Titre d'un onglet (« Établissements ») et, dessous, sa zone et sa période. Tableau en ligne 4. */
function sheetTitle(ws: ExcelJS.Worksheet, text: string, subtitle: string) {
  const cell = ws.getCell(1, 1);
  cell.value = text;
  cell.font = { name: FONT, size: 15, bold: true, color: { argb: C.primary } };
  ws.getRow(1).height = 28;
  const sub = ws.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { name: FONT, size: 10, color: { argb: C.muted } };
}

/** Bandeau vert de section, sur toute la largeur. */
function band(ws: ExcelJS.Worksheet, row: number, text: string, span: number) {
  ws.mergeCells(row, 1, row, span);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: FONT, bold: true, color: { argb: C.white } };
  cell.fill = fill(C.primary);
  cell.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 22;
}

/**
 * Tableau : en-tête vert pâle souligné, lignes zébrées, formats de nombre, chiffres masqués
 * en gris. Renvoie la première et la dernière ligne de données.
 */
function table(
  ws: ExcelJS.Worksheet,
  start: number,
  columns: Column[],
  rows: Value[][],
  options: { filter?: boolean } = {},
): { first: number; last: number } {
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(col.width ?? 0, c.width);
    const cell = ws.getCell(start, i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true, color: { argb: C.dark } };
    cell.fill = fill(C.soft);
    cell.border = { bottom: { style: 'medium', color: { argb: C.primary } } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: c.kind === 'text' ? 'left' : 'right',
      wrapText: true,
    };
  });
  ws.getRow(start).height = 30;
  rows.forEach((values, r) => {
    const rowNumber = start + 1 + r;
    values.forEach((value, i) => {
      const kind = columns[i]?.kind ?? 'text';
      const cell = ws.getCell(rowNumber, i + 1);
      cell.border = { bottom: { style: 'thin', color: { argb: C.line } } };
      if (r % 2 === 1) cell.fill = fill(C.zebra);
      if (value === null && kind !== 'text') {
        cell.value = '–';
        cell.font = { name: FONT, color: { argb: C.masked } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        return;
      }
      cell.value = value;
      cell.font = { name: FONT };
      cell.alignment = { vertical: 'middle', wrapText: kind === 'text' };
      if (kind === 'int') cell.numFmt = INTEGER;
      if (kind === 'pct') cell.numFmt = PERCENT;
      if (kind === 'points') cell.numFmt = POINTS;
      if (kind === 'date') cell.numFmt = 'd mmm yyyy';
    });
  });
  const last = start + Math.max(rows.length, 1);
  if (options.filter && rows.length > 0) {
    ws.autoFilter = { from: { row: start, column: 1 }, to: { row: last, column: columns.length } };
  }
  return { first: start + 1, last };
}

/** Barre de progression dans les cellules d'une colonne (0 à `max`). */
function dataBar(ws: ExcelJS.Worksheet, column: number, first: number, last: number, max?: number) {
  if (last < first) return;
  const letter = ws.getColumn(column).letter;
  ws.addConditionalFormatting({
    ref: `${letter}${first}:${letter}${last}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        gradient: true,
        cfvo: [
          { type: 'num', value: 0 },
          max === undefined ? { type: 'max' } : { type: 'num', value: max },
        ],
        color: { argb: 'FF4EA476' },
      } as ExcelJS.DataBarRuleType,
    ],
  });
}

/** Pastille d'état dans une cellule : fond et texte de la couleur de l'état. */
function stateCell(cell: ExcelJS.Cell, state: PilotState | null, threshold: number) {
  if (!state) {
    cell.value = `Moins de ${threshold} apprenants`;
    cell.font = { name: FONT, color: { argb: C.masked } };
    return;
  }
  const s = STATES[state];
  cell.value = s.label;
  cell.font = { name: FONT, bold: true, color: { argb: s.text } };
  cell.fill = fill(s.fill);
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

/** Évolution d'un chiffre clé, en texte : « ▲ +6 % vs période d’avant ». */
function evolution(figure: PilotFigure, unit: 'count' | 'points'): { text: string; color: string } {
  const { value, previous } = figure;
  if (value === null || previous === null) return { text: 'Pas de comparaison', color: C.muted };
  const diff =
    unit === 'points'
      ? value - previous
      : previous === 0
        ? null
        : Math.round(((value - previous) / previous) * 100);
  if (diff === null) return { text: 'Nouveau sur la période', color: C.muted };
  const sign = diff > 0 ? '▲ +' : diff < 0 ? '▼ −' : '= ';
  const n = Math.abs(diff);
  const text =
    unit === 'points'
      ? `${sign}${n} point${n > 1 ? 's' : ''} vs période d’avant`
      : `${sign}${n} % vs période d’avant`;
  return { text, color: diff > 0 ? C.up : diff < 0 ? C.down : C.muted };
}

const minus = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

export async function pilotWorkbook(
  d: PilotOverview,
  s: StatsOverview,
  meta: { editor: string | null; generatedAt: string },
): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'L’Enseignement';
  wb.created = new Date(d.generatedAt);
  const period = PILOT_PERIOD_LABELS[d.period];
  const cycle = d.cycle ? PILOT_CYCLE_LABELS[d.cycle] : 'tous les cycles';
  const run = `${d.zone.name} · ${period}`;
  const zoneWord = d.rows.some((r) => r.type === 'authority') ? 'DRENA' : 'Établissement';

  // Lignes des sous-zones, communes à la synthèse et à l'onglet détaillé.
  const zoneColumns: Column[] = [
    { header: zoneWord, width: 36, kind: 'text' },
    { header: 'Apprenants', width: 13, kind: 'int' },
    { header: 'Actifs (%)', width: 22, kind: 'pct' },
    { header: 'Cours terminés (%)', width: 16, kind: 'pct' },
    { header: 'Devoirs rendus (%)', width: 16, kind: 'pct' },
    { header: 'État', width: 22, kind: 'text' },
    { header: 'Évolution des actifs (points)', width: 16, kind: 'points' },
  ];
  const zoneRows: Value[][] = d.rows.map((r) => [
    r.name,
    r.learners,
    r.activeRate,
    r.completionRate,
    r.assignmentsRate,
    null,
    minus(r.activeRate, r.previousActiveRate),
  ]);

  // ——— Synthèse ———
  const ws = wb.addWorksheet('Synthèse', { views: [{ showGridLines: false }] });
  setupPage(ws);
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = `Tableau de pilotage · ${d.zone.name}`;
  ws.getCell('A1').font = { name: FONT, size: 20, bold: true, color: { argb: C.primary } };
  ws.getRow(1).height = 34;
  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = {
    richText: [
      { text: 'Période : ', font: { name: FONT, bold: true } },
      { text: `${period}   ·   `, font: { name: FONT, color: { argb: C.muted } } },
      { text: 'Cycle : ', font: { name: FONT, bold: true } },
      { text: `${cycle}   ·   `, font: { name: FONT, color: { argb: C.muted } } },
      { text: 'Calculé le ', font: { name: FONT, bold: true } },
      {
        text: `${meta.generatedAt}${meta.editor ? `   ·   par ${meta.editor}` : ''}`,
        font: { name: FONT, color: { argb: C.muted } },
      },
    ],
  };
  ws.mergeCells('A3:G3');
  const note = ws.getCell('A3');
  note.value = `Aucun nom d’élève. « – » = groupe de moins de ${d.threshold} personnes, masqué pour que personne ne soit reconnu.`;
  note.font = { name: FONT, size: 10, color: { argb: C.noteText } };
  note.fill = fill(C.noteFill);
  note.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(3).height = 22;

  // Cartes des chiffres clés : libellé, valeur, évolution ; bord vert à gauche.
  const cards = [
    { label: 'Apprenants actifs', figure: d.kpis.active, unit: 'count' as const, from: 1, to: 1 },
    {
      label: 'Cours terminés',
      figure: d.kpis.completionRate,
      unit: 'points' as const,
      from: 2,
      to: 3,
    },
    {
      label: 'Devoirs rendus à temps',
      figure: d.kpis.assignmentsRate,
      unit: 'points' as const,
      from: 4,
      to: 5,
    },
    {
      label: 'Réussite aux quiz',
      figure: d.kpis.quizSuccess,
      unit: 'points' as const,
      from: 6,
      to: 7,
    },
  ];
  for (const card of cards) {
    const ev = evolution(card.figure, card.unit);
    const lines: Array<[number, ExcelJS.Cell['value'], Partial<ExcelJS.Font>, string?]> = [
      [5, card.label, { size: 10, color: { argb: C.muted } }],
      [
        6,
        card.figure.value,
        { size: 22, bold: true, color: { argb: C.dark } },
        card.unit === 'count' ? INTEGER : PERCENT,
      ],
      [7, ev.text, { size: 10, bold: true, color: { argb: ev.color } }],
    ];
    for (const [row, value, font, numFmt] of lines) {
      if (card.to > card.from) ws.mergeCells(row, card.from, row, card.to);
      const cell = ws.getCell(row, card.from);
      cell.value = value === null ? '–' : value;
      cell.font = { name: FONT, ...font };
      if (numFmt && value !== null) cell.numFmt = numFmt;
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      for (let c = card.from; c <= card.to; c++) {
        const part = ws.getCell(row, c);
        part.fill = fill(C.card);
        part.border = {
          ...(c === card.from ? { left: { style: 'thick', color: { argb: C.primary } } } : {}),
          ...(c === card.to ? { right: { style: 'thin', color: { argb: C.cardLine } } } : {}),
          ...(row === 5 ? { top: { style: 'thin', color: { argb: C.cardLine } } } : {}),
          ...(row === 7 ? { bottom: { style: 'thin', color: { argb: C.cardLine } } } : {}),
        };
      }
    }
  }
  ws.getRow(5).height = 20;
  ws.getRow(6).height = 34;
  ws.getRow(7).height = 20;

  band(
    ws,
    9,
    d.rows.length > 0
      ? `COMPARAISON DES ${zoneWord === 'DRENA' ? 'DRENA' : 'ÉTABLISSEMENTS'} — les plus fragiles d’abord`
      : 'COMPARAISON DES ZONES',
    7,
  );
  if (d.rows.length === 0) {
    ws.getCell('A10').value = 'Pas de sous-zone à comparer ici.';
    ws.getCell('A10').font = { name: FONT, color: { argb: C.muted } };
  } else {
    const { first, last } = table(ws, 10, zoneColumns, zoneRows, { filter: true });
    d.rows.forEach((r, i) => stateCell(ws.getCell(first + i, 6), r.state, d.threshold));
    dataBar(ws, 3, first, last + 1, 100);
    // Ensemble de la zone, en gras sous un trait vert.
    const total = ws.getRow(last + 1);
    const values: Value[] = [
      'Ensemble de la zone',
      d.coverage.learners,
      d.averageActiveRate,
      d.kpis.completionRate.value,
      d.kpis.assignmentsRate.value,
      null,
      null,
    ];
    values.forEach((value, i) => {
      const cell = total.getCell(i + 1);
      cell.value = value === null ? (i === 0 || i >= 5 ? null : '–') : value;
      cell.font = { name: FONT, bold: true };
      cell.fill = fill(C.card);
      cell.border = { top: { style: 'medium', color: { argb: C.primary } } };
      if (i === 1 && value !== null) cell.numFmt = INTEGER;
      if (i >= 2 && i <= 4 && value !== null) cell.numFmt = PERCENT;
    });
    const legend = ws.getCell(last + 3, 1);
    legend.value =
      'État : En alerte = moins de 50 % d’actifs · À surveiller = 50 à 64 % · Bon = 65 % et plus. Le détail est dans les autres onglets.';
    legend.font = { name: FONT, size: 9, color: { argb: C.muted } };
  }
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 0, 34);

  // ——— Établissements (ou DRENA) : toutes les colonnes, avec la période d'avant ———
  const wz = wb.addWorksheet(zoneWord === 'DRENA' ? 'DRENA' : 'Établissements', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }],
  });
  setupPage(wz, 4);
  sheetTitle(wz, zoneWord === 'DRENA' ? 'DRENA' : 'Établissements', run);
  // Le nombre d'établissements n'a de sens que pour une DRENA (une école en compte toujours un).
  const byDrena = zoneWord === 'DRENA';
  const zoneDetail: Column[] = [
    { header: zoneWord, width: 36, kind: 'text' },
    ...(byDrena ? [{ header: 'Établissements', width: 14, kind: 'int' } as Column] : []),
    { header: 'Apprenants', width: 13, kind: 'int' },
    { header: 'Actifs (%)', width: 20, kind: 'pct' },
    { header: 'Actifs, période d’avant (%)', width: 16, kind: 'pct' },
    { header: 'Évolution (points)', width: 13, kind: 'points' },
    { header: 'Cours terminés (%)', width: 15, kind: 'pct' },
    { header: 'Devoirs rendus (%)', width: 15, kind: 'pct' },
    { header: 'Devoirs rendus, période d’avant (%)', width: 19, kind: 'pct' },
    { header: 'État', width: 22, kind: 'text' },
  ];
  const detail = table(
    wz,
    4,
    zoneDetail,
    d.rows.map((r) => [
      r.name,
      ...(byDrena ? [r.establishments] : []),
      r.learners,
      r.activeRate,
      r.previousActiveRate,
      minus(r.activeRate, r.previousActiveRate),
      r.completionRate,
      r.assignmentsRate,
      r.previousAssignmentsRate,
      null,
    ]),
    { filter: true },
  );
  d.rows.forEach((r, i) =>
    stateCell(wz.getCell(detail.first + i, zoneDetail.length), r.state, d.threshold),
  );
  dataBar(wz, byDrena ? 4 : 3, detail.first, detail.last, 100);
  if (d.rows.length === 0) wz.getCell(5, 1).value = 'Pas de sous-zone à comparer ici.';

  // ——— Semaines ———
  const ww = wb.addWorksheet('Semaines', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  setupPage(ww, 4);
  sheetTitle(ww, 'Apprenants actifs chaque semaine', run);
  const weeks = table(
    ww,
    4,
    [
      { header: 'Semaine du', width: 16, kind: 'date' },
      { header: 'Apprenants actifs', width: 18, kind: 'int' },
      { header: '', width: 40, kind: 'text' },
    ],
    d.weekly.map((w) => [new Date(`${w.week}T00:00:00Z`), w.active, null]),
  );
  // Barre dans la 3e colonne : elle reprend la valeur de la 2e, sans l'afficher.
  for (let row = weeks.first; row <= weeks.last; row++) {
    const v = ww.getCell(row, 2).value;
    if (typeof v === 'number') {
      ww.getCell(row, 3).value = { formula: `B${row}`, result: v };
      ww.getCell(row, 3).numFmt = ';;;';
    }
  }
  dataBar(ww, 3, weeks.first, weeks.last);
  const how = ww.getCell(weeks.last + 2, 1);
  how.value =
    'Une personne compte une fois par semaine si elle a ouvert une leçon, un quiz ou un devoir.';
  how.font = { name: FONT, size: 9, color: { argb: C.muted } };

  // ——— Cycles ———
  const wc = wb.addWorksheet('Cycles', { views: [{ showGridLines: false }] });
  setupPage(wc, 4);
  sheetTitle(wc, 'Cours terminés, par cycle', run);
  const cycles = table(
    wc,
    4,
    [
      { header: 'Cycle', width: 22, kind: 'text' },
      { header: 'Apprenants', width: 14, kind: 'int' },
      { header: 'Cours terminés (%)', width: 30, kind: 'pct' },
    ],
    d.cycles.map((c) => [PILOT_CYCLE_LABELS[c.cycle], c.learners, c.completionRate]),
  );
  dataBar(wc, 3, cycles.first, cycles.last, 100);

  // ——— Points d'attention ———
  const wa = wb.addWorksheet('Points d’attention', { views: [{ showGridLines: false }] });
  setupPage(wa, 4);
  sheetTitle(wa, 'Points d’attention', run);
  const alerts = table(
    wa,
    4,
    [
      { header: 'Niveau', width: 16, kind: 'text' },
      { header: 'Point', width: 44, kind: 'text' },
      { header: 'Détail', width: 50, kind: 'text' },
      { header: 'Structures concernées', width: 50, kind: 'text' },
    ],
    d.alerts.length > 0
      ? d.alerts.map((a) => [null, a.title, a.detail, a.items.join('\n')])
      : [[null, 'Rien à signaler sur cette période.', null, null]],
  );
  d.alerts.forEach((a, i) => {
    const cell = wa.getCell(alerts.first + i, 1);
    stateCell(cell, a.level, d.threshold);
    cell.value = ALERT_LABELS[a.level];
    wa.getCell(alerts.first + i, 2).font = { name: FONT, bold: true };
  });

  // ——— Cours, rattrapage et atelier ———
  const wk = wb.addWorksheet('Cours', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });
  setupPage(wk, 4);
  sheetTitle(wk, 'Détail par cours', 'Toutes vos structures');
  const courses = table(
    wk,
    4,
    [
      { header: 'Cours', width: 38, kind: 'text' },
      { header: 'Cycle', width: 26, kind: 'text' },
      { header: 'Inscrits', width: 11, kind: 'int' },
      { header: 'Ont commencé', width: 13, kind: 'int' },
      { header: 'Ont terminé', width: 12, kind: 'int' },
      { header: 'Actifs 7 jours', width: 12, kind: 'int' },
      { header: 'Actifs 30 jours', width: 12, kind: 'int' },
      { header: 'Bonnes réponses aux quiz (%)', width: 20, kind: 'pct' },
    ],
    s.courses.map((c) => [
      c.title,
      BRANCHES.find((b) => b.code === c.branch)?.title ?? c.branch,
      c.enrolled,
      c.started,
      c.completed,
      c.active7,
      c.active30,
      c.quizSuccess,
    ]),
    { filter: true },
  );
  dataBar(wk, 8, courses.first, courses.last, 100);
  let row = courses.last + 2;
  band(wk, row, 'RATTRAPAGE EN LECTURE', 3);
  const remediation = table(
    wk,
    row + 1,
    [
      { header: 'Chiffre', width: 38, kind: 'text' },
      { header: 'Valeur', width: 18, kind: 'int' },
    ],
    [
      ['Élèves qui ont passé le bilan', s.remediation.diagnosed],
      ['Rattrapages en cours', s.remediation.inProgress],
      ['Rattrapages réussis', s.remediation.completed],
      ['Part des rattrapages réussis (%)', s.remediation.effectiveRate],
    ],
  );
  const effective = wk.getCell(remediation.last, 2);
  if (typeof effective.value === 'number') effective.numFmt = PERCENT;
  row = remediation.last + 2;
  band(wk, row, 'ATELIER VIRTUEL DE SÉCURITÉ', 3);
  table(
    wk,
    row + 1,
    [
      { header: 'Chiffre', width: 38, kind: 'text' },
      { header: 'Apprenants', width: 18, kind: 'int' },
    ],
    [
      ['Ont essayé', s.workshop.tried],
      ['Ont réussi la simulation', s.workshop.passed],
      ['Ont demandé leur séance encadrée', s.workshop.requested],
    ],
  );

  // ——— À savoir ———
  const wi = wb.addWorksheet('À savoir', { views: [{ showGridLines: false }] });
  setupPage(wi);
  sheetTitle(wi, 'À savoir', run);
  table(
    wi,
    4,
    [
      { header: 'Sujet', width: 30, kind: 'text' },
      { header: 'Explication', width: 100, kind: 'text' },
    ],
    [
      ['Zone', d.zone.path.map((p) => p.name).join(' › ') || d.zone.name],
      ['Période', `${period} (comparée à la période d’avant quand c’est possible)`],
      ['Cycle', cycle],
      ['Calculé le', meta.generatedAt],
      [
        'Confidentialité',
        `Aucun nom d’élève. Un groupe de moins de ${d.threshold} personnes est masqué : « – ».`,
      ],
      ['Apprenant actif', 'A ouvert une leçon, un quiz ou un devoir sur la période.'],
      [
        'État d’une zone',
        'En alerte : moins de 50 % d’actifs. À surveiller : 50 à 64 %. Bon : 65 % et plus.',
      ],
      ['Évolution', 'Différence en points avec la période d’avant (▲ hausse, ▼ baisse).'],
      [
        'Couverture',
        `${d.coverage.establishments} établissements, ${d.coverage.classes} classes, ${d.coverage.teachers} enseignants, ${d.coverage.publishedCourses} cours publiés.`,
      ],
      ['Structures couvertes', s.organizations.join(', ')],
    ],
  );

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
