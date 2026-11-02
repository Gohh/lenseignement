import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Atelier gardé sur l'appareil (paquet fictif tests/fixtures/exercice-test.h5p) : fait sans
// connexion, l'essai est gardé puis corrigé et compté une seule fois au retour du réseau.

const FIXTURES = join(__dirname, '..', 'fixtures');

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

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

/** Atelier avec un exercice H5P, rédigé par l'enseignant et publié par le référent. */
async function publishH5PWorkshop(page: Page, title: string) {
  await loginAs(page, 'enseignant.demo', '/mon-espace/ateliers/nouveau');
  await page.getByLabel('Titre').fill(title);
  await page.getByRole('button', { name: 'Créer et ajouter les étapes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Atelier créé' })).toBeVisible();
  const editor = page.getByTestId('workshop-editor');
  await editor.getByRole('button', { name: /\+ Exercice H5P/ }).click();
  await editor.getByTestId('h5p-file-1').setInputFiles(join(FIXTURES, 'exercice-test.h5p'));
  await expect(editor.getByTestId('h5p-package-1')).toContainText('Quel outil desserre');
  await editor.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Brouillon enregistré' })).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer en relecture' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText('En relecture');
  await page.context().clearCookies();
  await loginAs(page, 'referent.demo', '/mon-espace/ateliers');
  await page.getByTestId('workshops-review').getByRole('link', { name: title }).click();
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByTestId('workshop-status')).toContainText('Publié');
  await page.context().clearCookies();
}

/** Image du contenu et image de la feuille de style de l'exercice : bien chargées ? */
const exerciseImages = (page: Page) =>
  page
    .frameLocator('iframe[title^="Exercice :"]')
    .locator('img.lse-test-image')
    .evaluate((img: HTMLImageElement) => {
      const badge = document.querySelector('.lse-test-badge');
      return {
        image: img.complete && img.naturalWidth === 4,
        style: badge ? getComputedStyle(badge).backgroundImage : '',
      };
    });

test.afterAll(async () => {
  await closeDb();
});

test('un atelier H5P gardé se fait sans connexion ; l’essai compte une fois au retour', async ({
  page,
  context,
}, testInfo) => {
  const title = `Atelier hors ligne ${testInfo.project.name} ${Date.now()}`;
  await publishH5PWorkshop(page, title);

  const learner = `nouveau.h${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();
  await loginAs(page, learner, '/mon-espace');
  await sql(`update users set level = 'alpha-1' where oidc_subject = $1`, [subjectOf(learner)]);
  await page.goto('/mon-espace/atelier');
  await page.getByRole('link', { name: `Commencer « ${title} »` }).click();
  await expect(page.getByTestId('h5p-score-etape-1')).toContainText('Il faut au moins 80 %');
  // En ligne, l'exercice montre ses images (contenu et feuille de style).
  await expect.poll(async () => (await exerciseImages(page)).image).toBe(true);
  const workshopUrl = page.url();

  await workerReady(page);
  const keep = page.getByRole('button', { name: /Garder cet atelier sur cet appareil \(\d/ });
  await keep.click();
  await expect(page.getByTestId('keep-workshop-status')).toContainText(
    'Cet atelier est sur cet appareil',
  );

  // Plus de réseau : l'adresse de l'atelier ouvre l'atelier gardé.
  await context.setOffline(true);
  await page.goto(workshopUrl);
  const offline = page.getByTestId('offline-workshops');
  await expect(offline.getByRole('heading', { name: title })).toBeVisible();
  const exercise = page.frameLocator('iframe[title^="Exercice :"]');
  await expect(exercise.getByRole('button', { name: 'Une clé en croix' })).toBeVisible();
  // Fichiers venus de l'appareil : images du contenu et de la feuille de style comprises.
  await expect.poll(async () => (await exerciseImages(page)).image).toBe(true);
  expect((await exerciseImages(page)).style).toContain('blob:');

  await exercise.getByRole('button', { name: 'Une clé en croix' }).click();
  await expect(page.getByTestId('h5p-score-etape-1')).toContainText('Ton score : 100 %');
  await page.getByRole('button', { name: 'Vérifier ma simulation' }).click();
  await expect(page.getByTestId('offline-workshop-saved')).toContainText(
    'Ton essai est gardé sur cet appareil',
  );
  await expect(page.getByTestId('offline-workshop-saved')).toContainText('100 %');
  const userId = async () =>
    (await sql(`select id from users where oidc_subject = $1`, [subjectOf(learner)]))[0]!.id;
  const attempts = async () =>
    Number(
      (
        await sql(`select count(*)::int as n from simulation_attempts where user_id = $1`, [
          await userId(),
        ])
      )[0]!.n,
    );
  expect(await attempts()).toBe(0);
  // L'essai attend dans la file de l'appareil (gardé pour le renvoyer plus bas).
  const queued = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('lenseignement', 1);
        open.onsuccess = () => {
          const read = open.result.transaction('actions').objectStore('actions').getAll();
          read.onsuccess = () => resolve(read.result as unknown[]);
          read.onerror = () => reject(read.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  expect(queued).toHaveLength(1);

  // Retour du réseau : l'essai part tout seul, il est corrigé et compté une seule fois.
  await context.setOffline(false);
  await expect.poll(attempts, { timeout: 15_000 }).toBe(1);
  await page.goto(workshopUrl);
  await expect(page.getByTestId('simulation-result')).toContainText('✓ Réussi');
  // Le même essai renvoyé (réseau coupé au mauvais moment) n'est pas compté deux fois.
  const replay = await page.evaluate(async (actions) => {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actions }),
    });
    return ((await res.json()) as { results: Array<{ status: string }> }).results;
  }, queued);
  expect(replay).toEqual([expect.objectContaining({ status: 'applied' })]);
  expect(await attempts()).toBe(1);

  // Retirer l'atelier de l'appareil efface sa fiche.
  await page.getByRole('button', { name: 'Retirer de cet appareil' }).click();
  await expect(page.getByRole('button', { name: /Garder cet atelier/ })).toBeVisible();
});
