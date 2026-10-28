/* Service worker de L'Enseignement (ticket 15, ADR-012).
 *
 * - Pages publiques et leçons : réseau d'abord ; sans réseau (ou réseau trop lent), la dernière
 *   copie gardée sur l'appareil ; sinon la page « Hors connexion ».
 * - Jamais mis de côté : l'espace personnel, la connexion, les envois (POST) et les données
 *   techniques de navigation (RSC). Aucun jeton : le cookie de session reste au navigateur.
 * - La déconnexion efface tout (en-tête Clear-Site-Data), comme le bouton « Effacer mes données
 *   sur cet appareil ».
 */

const VERSION = 'v1';
const PAGES = `lenseignement-pages-${VERSION}`;
const ASSETS = `lenseignement-assets-${VERSION}`;
const OFFLINE_URL = '/hors-ligne';
const PRECACHE = ['/', '/catalogue', OFFLINE_URL];
/** Au-delà, on montre la copie gardée plutôt que d'attendre un réseau très lent. */
const NETWORK_TIMEOUT_MS = 4000;

/** Pages qu'on peut garder : publiques ou propres à la leçon, jamais l'espace personnel. */
function isKeepablePage(url) {
  return (
    url.pathname === '/' ||
    url.pathname === OFFLINE_URL ||
    url.pathname === '/catalogue' ||
    url.pathname.startsWith('/catalogue/') ||
    url.pathname.startsWith('/branches')
  );
}

function isAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname === '/manifest.webmanifest';
}

/** Clé de cache : l'adresse sans paramètres (les messages ?message=… ne sont pas gardés). */
function pageKey(url) {
  return url.origin + url.pathname;
}

/** Scripts et feuilles de style d'une page, pour qu'elle fonctionne aussi hors connexion. */
function assetsOf(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    found.add(match[1].replace(/&amp;/g, '&'));
  }
  return [...found];
}

/** Télécharge une page et ses fichiers, et les garde (bouton « Garder ce cours », précache). */
async function keepPage(path) {
  const url = new URL(path, self.location.origin);
  if (!isKeepablePage(url)) return false;
  // L'en-tête évite que le téléchargement compte comme une leçon ouverte (bouton « Reprendre »).
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'x-lse-keep': '1' },
  });
  if (!response.ok || response.redirected) return false;
  const html = await response.clone().text();
  await (await caches.open(PAGES)).put(pageKey(url), response);
  const assets = await caches.open(ASSETS);
  await Promise.all(
    assetsOf(html).map(async (asset) => {
      if (await assets.match(asset)) return;
      const res = await fetch(asset).catch(() => null);
      if (res && res.ok) await assets.put(asset, res);
    }),
  );
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all(PRECACHE.map((path) => keepPage(path).catch(() => false))).then(() =>
      self.skipWaiting(),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('lenseignement-') && ![PAGES, ASSETS].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function fromCache(cacheName, key) {
  return (await caches.open(cacheName)).match(key);
}

async function navigate(request) {
  const url = new URL(request.url);
  const keepable = isKeepablePage(url);
  const network = fetch(request).then(async (response) => {
    if (keepable && response.ok && response.type === 'basic' && !response.redirected) {
      await (await caches.open(PAGES)).put(pageKey(url), response.clone());
    }
    return response;
  });

  if (!keepable) {
    return network.catch(
      async () => (await fromCache(PAGES, pageKey(new URL(OFFLINE_URL, url)))) ?? Response.error(),
    );
  }

  const cached = await fromCache(PAGES, pageKey(url));
  const slow = new Promise((resolve) =>
    setTimeout(() => resolve(cached ?? null), NETWORK_TIMEOUT_MS),
  );
  try {
    const response = await Promise.race([network, slow]);
    if (response) return response;
    return await network;
  } catch {
    return (
      cached ?? (await fromCache(PAGES, pageKey(new URL(OFFLINE_URL, url)))) ?? Response.error()
    );
  }
}

async function asset(request) {
  const url = new URL(request.url);
  try {
    // Réseau d'abord : le cache HTTP du navigateur évite déjà de retélécharger les fichiers
    // inchangés, et le mode développement change de fichiers à chaque modification.
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await (await caches.open(ASSETS)).put(url.pathname + url.search, response.clone());
    }
    return response;
  } catch {
    return (await fromCache(ASSETS, url.pathname + url.search)) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
  } else if (isAsset(url)) {
    event.respondWith(asset(request));
  }
  // Le reste (données de navigation RSC, API) passe directement par le réseau.
});

/** Message de la page : garder des pages (bouton « Garder ce cours sur cet appareil »). */
self.addEventListener('message', (event) => {
  const port = event.ports[0];
  const data = event.data ?? {};
  if (!port) return;
  if (data.type === 'keep' && Array.isArray(data.paths)) {
    event.waitUntil(
      Promise.all(data.paths.slice(0, 200).map((path) => keepPage(path).catch(() => false))).then(
        (results) => port.postMessage({ kept: results.filter(Boolean).length }),
      ),
    );
  }
});
