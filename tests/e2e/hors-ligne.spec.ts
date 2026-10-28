import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Cours fictif publié « Additionner jusqu'à 10 » (2 leçons, avec quiz) : demo-courses.ts.
const COURSE = '50000000-0000-4000-8000-000000000005';

const freshLearner = (testInfo: TestInfo) =>
  `nouveau.h${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

/** Attend que le service worker contrôle la page (pages gardées, page « Hors connexion »). */
async function workerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
}

async function enrollAndKeep(page: Page, username: string) {
  await loginAs(page, username, `/catalogue/${COURSE}`);
  await page.getByRole('button', { name: 'Suivre ce cours' }).click();
  await expect(page.getByTestId('course-progress')).toBeVisible();
  await workerReady(page);
  await page.getByRole('button', { name: 'Garder ce cours sur cet appareil' }).click();
  await expect(page.getByTestId('keep-status')).toHaveText(
    '✓ Ce cours est disponible sans connexion sur cet appareil.',
  );
}

/** La leçon 1 du cours est-elle gardée sur l'appareil ? (Le service worker se réinstalle
 * ensuite et regarde de nouveau l'accueil, jamais les leçons.) */
const lessonKept = (page: Page) =>
  page.evaluate(
    async (path) => Boolean(await caches.match(new URL(path, location.origin).href)),
    `/catalogue/${COURSE}/lecons/1`,
  );

test.afterAll(async () => {
  await closeDb();
});

test.describe('Hors connexion et synchronisation (ticket 15)', () => {
  test('E2E-07 / E2E-08 : leçon et quiz faits sans réseau, envoyés une seule fois au retour', async ({
    page,
    context,
  }, testInfo) => {
    const username = freshLearner(testInfo);
    await enrollAndKeep(page, username);

    // Plus de réseau : la leçon gardée s'ouvre quand même.
    await context.setOffline(true);
    await page.goto(`/catalogue/${COURSE}/lecons/1`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();

    // Quiz : réponses gardées (et toujours cochées), en attente.
    const q1 = page.getByRole('group', { name: /Question 1/ });
    const q2 = page.getByRole('group', { name: /Question 2/ });
    await q1.getByLabel('Trois').check();
    await q2.getByLabel('Cinq').check();
    await page.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(page.getByTestId('quiz-score')).toContainText('en attente de synchronisation');
    await expect(q1.getByLabel('Trois')).toBeChecked();

    // Leçon terminée deux fois (double envoi) : avec le quiz, trois actions gardées.
    await page.getByRole('button', { name: 'J’ai terminé cette leçon' }).click();
    await expect(page.getByTestId('lesson-status')).toContainText('en attente de synchronisation');
    await page.reload();
    await page.getByRole('button', { name: 'J’ai terminé cette leçon' }).click();
    await expect(page.getByTestId('sync-status')).toContainText(
      '3 actions en attente de synchronisation',
    );

    // Retour du réseau : envoi automatique.
    await context.setOffline(false);
    await expect(page.getByTestId('sync-status')).toContainText('Progression enregistrée.');
    await expect(page.getByTestId('sync-status')).not.toContainText('en attente');

    await page.goto(`/catalogue/${COURSE}/lecons/1`);
    await expect(page.getByTestId('lesson-status')).toHaveText('✓ Leçon terminée');
    await expect(page.getByTestId('quiz-last')).toHaveText('Votre dernier résultat : 2 sur 2.');

    // Côté serveur : une seule leçon terminée, un seul évènement, une seule tentative.
    const [counts] = await sql<{ events: number; completed: number; attempts: number }>(
      `select
         (select count(*)::int from outbox_events o
           where o.event_type = 'LessonCompleted' and o.payload->>'userId' = u.id::text) as events,
         (select count(*)::int from learning_events l
           where l.user_id = u.id and l.event_type = 'lesson_completed') as completed,
         (select count(*)::int from quiz_attempts q where q.user_id = u.id) as attempts
       from users u where u.oidc_subject = $1`,
      [subjectOf(username)],
    );
    expect(counts).toEqual({ events: 1, completed: 2, attempts: 1 });
  });

  test('bouton « Synchroniser maintenant » et page « Hors connexion »', async ({
    page,
    context,
  }, testInfo) => {
    await enrollAndKeep(page, freshLearner(testInfo));
    await context.setOffline(true);
    await page.goto(`/catalogue/${COURSE}/lecons/2`);
    await page.getByRole('button', { name: 'J’ai terminé cette leçon' }).click();
    await expect(page.getByTestId('sync-status')).toContainText(
      '1 action en attente de synchronisation',
    );
    await expect(page.getByRole('button', { name: 'Synchroniser maintenant' })).toHaveCount(0);

    // Page jamais ouverte : la page « Hors connexion » la remplace.
    await page.goto('/branches/technique');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pas de connexion');
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);

    // Bouton d'envoi manuel, une fois le réseau revenu (si l'envoi automatique n'a pas déjà eu lieu).
    await context.setOffline(false);
    await page.goto(`/catalogue/${COURSE}`);
    const button = page.getByRole('button', { name: 'Synchroniser maintenant' });
    if (await button.isVisible()) await button.click();
    await expect(page.getByTestId('sync-status')).not.toContainText('en attente');
    await page.reload();
    await expect(page.getByTestId('course-progress')).toHaveText('1 leçon sur 2 terminée.');
  });

  test('la déconnexion et le bouton « Effacer » vident l’appareil', async ({ page }, testInfo) => {
    await enrollAndKeep(page, freshLearner(testInfo));
    expect(await lessonKept(page)).toBe(true);

    await page.goto('/mon-espace');
    await page.getByRole('button', { name: 'Effacer mes données sur cet appareil' }).click();
    await page.getByRole('button', { name: 'Oui, tout effacer' }).click();
    await expect(page.getByTestId('device-status')).toHaveText(
      '✓ Données effacées de cet appareil.',
    );
    expect(await lessonKept(page)).toBe(false);

    await page.goto(`/catalogue/${COURSE}`);
    await workerReady(page);
    await page.getByRole('button', { name: 'Garder ce cours sur cet appareil' }).click();
    await expect(page.getByTestId('keep-status')).toContainText('disponible sans connexion');
    await page.goto('/mon-espace');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'));
    expect(await lessonKept(page)).toBe(false);
  });

  test('E2E-16 : leçon en attente de synchronisation sans violation axe WCAG A/AA', async ({
    page,
    context,
  }, testInfo) => {
    await enrollAndKeep(page, freshLearner(testInfo));
    await context.setOffline(true);
    await page.goto(`/catalogue/${COURSE}/lecons/2`);
    await page.getByRole('button', { name: 'J’ai terminé cette leçon' }).click();
    await expect(page.getByTestId('sync-status')).toContainText('en attente');
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await context.setOffline(false);
  });
});

// Sans service worker : l'interception des envois par Playwright ne voit pas ceux qui passent
// par lui. La file d'actions, elle, n'en dépend pas.
test.describe('Site injoignable (ticket 15)', () => {
  test.use({ serviceWorkers: 'block' });

  test('site injoignable malgré le réseau : l’action est gardée, puis envoyée', async ({
    page,
  }, testInfo) => {
    const username = freshLearner(testInfo);
    await loginAs(page, username, `/catalogue/${COURSE}`);
    await page.getByRole('button', { name: 'Suivre ce cours' }).click();
    await expect(page.getByTestId('course-progress')).toBeVisible();
    await page.goto(`/catalogue/${COURSE}/lecons/2`);

    // Les envois vers le site échouent (serveur arrêté, réseau saturé…).
    await page.route('**/*', (route) =>
      route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue(),
    );
    await page
      .getByRole('group', { name: /Question 1/ })
      .getByLabel('Cinq')
      .check();
    await page.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(page.getByTestId('quiz-score')).toContainText('en attente de synchronisation');
    await page.getByRole('button', { name: 'J’ai terminé cette leçon' }).click();
    await expect(page.getByTestId('lesson-status')).toContainText('en attente de synchronisation');

    // Le site répond de nouveau : « Synchroniser maintenant ».
    await page.unrouteAll();
    await page.getByRole('button', { name: 'Synchroniser maintenant' }).click();
    await expect(page.getByTestId('sync-status')).toContainText('Progression enregistrée.');
    await page.goto(`/catalogue/${COURSE}`);
    await expect(page.getByTestId('course-progress')).toHaveText('1 leçon sur 2 terminée.');
    const [{ attempts }] = await sql<{ attempts: number }>(
      `select count(*)::int as attempts from quiz_attempts q join users u on u.id = q.user_id
        where u.oidc_subject = $1`,
      [subjectOf(username)],
    );
    expect(attempts).toBe(1);
  });
});
