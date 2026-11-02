import {
  EXERCISE_DOMAIN_LABELS,
  type CampaignResultRow,
  type CampaignResults,
} from '@lenseignement/types';
import ExcelJS from 'exceljs';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

// Résultats d'une campagne pour Excel : un onglet par section, aucun nom d'élève ; une moyenne
// masquée (moins de 5 copies) s'écrit « – ».

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function sheet(book: ExcelJS.Workbook, name: string, header: string[], rows: unknown[][]) {
  const ws = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(header);
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF146B46' } };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col, i) => {
    col.width = Math.min(
      50,
      Math.max(12, header[i]!.length + 2, ...rows.map((r) => String(r[i] ?? '').length + 2)),
    );
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
}

const cells = (r: CampaignResultRow, withGroup: boolean) => [
  r.name,
  ...(withGroup ? [r.group] : []),
  r.expected,
  r.participants,
  r.average ?? '–',
  r.above ?? '–',
  r.participants === 0
    ? 'Non évaluée'
    : r.weakest
      ? `${r.weakest.label} (${r.weakest.rate} %)`
      : '–',
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response('Connexion requise.', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Introuvable.', { status: 404 });
  const res = await apiGet<CampaignResults>(
    session.accessToken,
    `/authoring/campaigns/${id}/results`,
  );
  if (!res.ok) return new Response('Résultats indisponibles.', { status: res.status });
  const r = res.data;
  const c = r.campaign;
  const book = new ExcelJS.Workbook();
  book.creator = 'L’Enseignement';
  sheet(
    book,
    'Synthèse',
    ['Indicateur', 'Valeur'],
    [
      ['Campagne', c.title],
      ['Zone', c.zone.name],
      ['Épreuve', c.exam.title],
      ['Seuil (%)', c.exam.threshold],
      ['Élèves attendus', r.expected],
      ['Ont composé', r.participants],
      ['Moyenne sur 100', r.average ?? '–'],
      ['Au-dessus du seuil (%)', r.above ?? '–'],
      ['Préparé par', session.displayName ?? ''],
    ],
  );
  const head = [
    'Élèves attendus',
    'Ont composé',
    'Moyenne / 100',
    'Au-dessus du seuil (%)',
    'Domaine le plus faible',
  ];
  if (r.groupLabel && r.groups.length > 0) {
    sheet(
      book,
      `Par ${r.groupLabel}`,
      [r.groupLabel, ...head],
      r.groups.map((g) => cells(g, false)),
    );
  }
  sheet(
    book,
    'Par école',
    ['École', ...(r.groupLabel ? [r.groupLabel] : []), ...head],
    r.schools.map((s) => cells(s, Boolean(r.groupLabel))),
  );
  sheet(
    book,
    'Par domaine',
    ['Domaine', 'Questions', 'Réussite (%)'],
    r.byDomain.map((d) => [d.label, d.count, d.rate]),
  );
  sheet(
    book,
    'Façon de penser',
    ['Façon de penser', 'Questions', 'Réussite (%)'],
    r.bySkill.map((d) => [d.label, d.count, d.rate]),
  );
  sheet(
    book,
    'Par question',
    ['N°', 'Question', 'Domaine', 'Réussite (%)'],
    r.byQuestion.map((q) => [q.position, q.label, EXERCISE_DOMAIN_LABELS[q.domain], q.rate]),
  );
  const file = await book.xlsx.writeBuffer();
  return new Response(file, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="campagne-${slug(c.title)}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
