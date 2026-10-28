import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Bilan de lecture FICTIF : apps/api/src/remediation/demo-diagnostic.ts. Awa (apprenant.demo)
// est dans la classe CP1 A de M. Koffi (enseignant.demo) ; Fatou (parent.demo) est sa mère.
const AWA = '40000000-0000-4000-8000-000000000001';
const PAGE = '/mon-espace/bilan-lecture';

const freshLearner = (testInfo: TestInfo) =>
  `nouveau.r${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

/** Coche une réponse par question, repérée par le début de son énoncé. */
async function answer(page: Page, choices: Array<[RegExp, string]>) {
  for (const [question, label] of choices) {
    await page.getByRole('group', { name: question }).getByLabel(label, { exact: true }).check();
  }
}

/** Lettres et compréhension justes ; syllabes et mots à consolider. */
const DIAGNOSTIC: Array<[RegExp, string]> = [
  [/lettre « m »/, 'm'],
  [/lettre « i »/, 'i'],
  [/m et a se lisent/, 'am'],
  [/p et i se lisent/, 'pa'],
  [/pa et pa se lisent/, 'pipa'],
  [/lu et ne se lisent/, 'nule'],
  [/Que mange Ama/, 'Une mangue'],
  [/Où dort le chat/, 'Sous la table'],
];

test.afterAll(async () => {
  await closeDb();
});

test.describe('Rattrapage en lecture (ticket 17)', () => {
  test('E2E-04 : bilan, orientation expliquée, petit test lié à la version de compétence', async ({
    page,
  }, testInfo) => {
    const username = freshLearner(testInfo);
    await loginAs(page, username, '/mon-espace');
    await page.getByRole('link', { name: 'Mon bilan de lecture' }).click();
    await expect(page.getByRole('heading', { name: 'Passer le bilan' })).toBeVisible();

    await answer(page, DIAGNOSTIC);
    await page.getByRole('button', { name: 'Envoyer mon bilan' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Bilan enregistré' })).toBeVisible();

    const results = page.getByTestId('skill-results');
    await expect(results).toContainText(
      "✓ Acquise : Reconnaître les lettres de l'alphabet (2 sur 2)",
    );
    await expect(results).toContainText('À consolider : Lire des syllabes simples (0 sur 2)');
    const plan = page.getByTestId('remediation-plan');
    await expect(plan).toContainText('À travailler : Lire des syllabes simples');
    await expect(page.getByTestId('remediation-rationale')).toContainText(
      '« Lire des mots courts » demande d’abord « Lire des syllabes simples »',
    );
    await expect(
      plan.getByRole('link', {
        name: 'Ouvrir le cours : Des lettres aux syllabes (démonstration)',
      }),
    ).toBeVisible();

    // Petit test : pas encore, puis réussi.
    await answer(page, [
      [/l et a se lisent/, 'al'],
      [/t et o se lisent/, 'to'],
    ]);
    await page.getByRole('button', { name: 'Vérifier mes réponses' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pas encore' })).toBeVisible();
    await expect(page.getByTestId('post-test-last')).toContainText('Dernier essai : 1 sur 2');

    await answer(page, [
      [/l et a se lisent/, 'la'],
      [/t et o se lisent/, 'to'],
    ]);
    await page.getByRole('button', { name: 'Vérifier mes réponses' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Bravo, c’est acquis !' }),
    ).toBeVisible();
    await expect(plan).toContainText('✓ Acquise : Lire des syllabes simples');
    await expect(page.getByRole('heading', { name: 'Refaire le bilan' })).toBeVisible();

    // Côté base : bilan et petits tests rattachés aux compétences de la version 2026.
    const rows = await sql<{ phase: string; label: string; n: number }>(
      `select s.phase, v.label, count(*)::int as n
         from diagnostic_sessions s
         join users u on u.id = s.user_id
         join skill_results r on r.session_id = s.id
         join competencies c on c.id = r.competency_id
         join curriculum_versions v on v.id = c.version_id
        where u.oidc_subject = $1
        group by s.phase, v.label order by s.phase`,
      [subjectOf(username)],
    );
    expect(rows).toEqual([
      { phase: 'diagnostic', label: '2026', n: 4 },
      { phase: 'post_test', label: '2026', n: 2 },
    ]);
  });

  test('l’enseignant comprend et corrige l’orientation ; le parent la voit seulement', async ({
    page,
  }, testInfo) => {
    // Awa est partagée par les deux profils (téléphone, ordinateur), qui tournent en même temps :
    // un seul modifie son orientation, pour que l'un ne défasse pas ce que l'autre vérifie.
    test.skip(testInfo.project.name !== 'desktop', 'orientation d’Awa modifiée une seule fois');
    const reason = 'Awa confond encore b et d.';
    await loginAs(page, 'apprenant.demo', `${PAGE}?refaire=1`);
    await answer(page, DIAGNOSTIC);
    await page.getByRole('button', { name: 'Envoyer mon bilan' }).click();
    await expect(page.getByTestId('remediation-plan')).toContainText('Lire des syllabes simples');

    await page.context().clearCookies();
    await loginAs(page, 'enseignant.demo', `/mon-espace/eleves/${AWA}`);
    const section = page.getByTestId('learner-reading');
    await expect(section).toContainText('À travailler');
    await expect(section.getByTestId('remediation-rationale')).toBeVisible();
    await section
      .getByLabel('Compétence à travailler')
      .selectOption({ label: "Reconnaître les lettres de l'alphabet" });
    await section.getByLabel(/Pourquoi ce choix/).fill(reason);
    await section.getByRole('button', { name: 'Enregistrer l’orientation' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Orientation modifiée' }),
    ).toBeVisible();
    await expect(section).toContainText("À travailler : Reconnaître les lettres de l'alphabet");
    await expect(section).toContainText(`Choisi par M. Koffi (fictif) : « ${reason} »`);

    await page.context().clearCookies();
    await loginAs(page, 'parent.demo', `/mon-espace/eleves/${AWA}`);
    await expect(page.getByTestId('learner-reading')).toContainText(reason);
    await expect(page.getByRole('button', { name: 'Enregistrer l’orientation' })).toHaveCount(0);

    // L'élève voit l'orientation choisie par son enseignant, et pourquoi.
    await page.context().clearCookies();
    await loginAs(page, 'apprenant.demo', PAGE);
    await expect(page.getByTestId('remediation-plan')).toContainText(reason);
  });

  test('E2E-16 : bilan et orientation sans violation axe WCAG A/AA', async ({ page }, testInfo) => {
    await loginAs(page, freshLearner(testInfo), PAGE);
    await answer(page, DIAGNOSTIC);
    await page.getByRole('button', { name: 'Envoyer mon bilan' }).click();
    await expect(page.getByTestId('remediation-plan')).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});
