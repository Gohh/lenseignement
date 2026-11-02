/**
 * Page du lecteur H5P, chargée dans un cadre isolé (sandbox sans allow-same-origin) : le code de
 * l'exercice ne voit ni la session ni la page de l'élève. Le score final est envoyé à la page
 * parente par postMessage ({ type: 'h5p-score', percent }).
 *
 * Deux façons de charger les fichiers :
 * - `online` : le cadre les demande au site ;
 * - `local` (atelier gardé sur l'appareil) : un cadre isolé ne passe pas par le service worker,
 *   donc la page parente lui envoie les fichiers gardés ({ type: 'h5p-files' }). Le cadre en fait
 *   des adresses `blob:` et redirige vers elles les demandes du lecteur (fetch, XHR, balises
 *   script, link, img, audio, vidéo et adresses url() des feuilles de style).
 */

const MEMORY_STORAGE = `
// Cadre isolé : pas de stockage du navigateur ; H5P reçoit une mémoire le temps de la page.
(function () {
  function memory() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { window[name]; } catch (e) {
      Object.defineProperty(window, name, { value: memory(), configurable: true });
    }
  });
})();`;

const LOCAL_FILES = `
// Fichiers reçus de la page parente : chaque adresse du lecteur est remplacée par une adresse blob:.
(function () {
  var map = {};
  var base = document.baseURI;
  function keyOf(url, from) {
    try { return new URL(url, from || base).pathname; } catch (e) { return null; }
  }
  function look(url) {
    if (typeof url !== 'string' || /^(blob:|data:|about:|javascript:)/i.test(url)) return null;
    var key = keyOf(url);
    if (!key) return null;
    if (map[key]) return map[key];
    try { return map[decodeURIComponent(key)] || null; } catch (e) { return null; }
  }
  function cssUrls(text, from) {
    return text.replace(/url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/g, function (all, q, ref) {
      if (/^(blob:|data:|#)/i.test(ref)) return all;
      var key = keyOf(ref, 'http://cadre' + (from || '/'));
      var found = key && (map[key] || map[decodeURIComponent(key)]);
      return found ? 'url("' + found + '")' : all;
    });
  }
  window.__lseLook = look;

  // Propriétés et attributs qui chargent un fichier.
  function patch(proto, prop) {
    var d = proto && Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set: function (v) { d.set.call(this, look(v) || v); }
    });
  }
  patch(HTMLScriptElement.prototype, 'src');
  patch(HTMLLinkElement.prototype, 'href');
  patch(HTMLImageElement.prototype, 'src');
  patch(HTMLMediaElement.prototype, 'src');
  patch(HTMLSourceElement.prototype, 'src');
  patch(HTMLTrackElement.prototype, 'src');
  var setAttr = Element.prototype.setAttribute;
  function fixed(name, value) {
    var n = String(name).toLowerCase();
    if (typeof value !== 'string') return value;
    if (n === 'src' || n === 'href' || n === 'poster') return look(value) || value;
    if (n === 'style' && value.indexOf('url(') >= 0) return cssUrls(value);
    return value;
  }
  Element.prototype.setAttribute = function (name, value) {
    return setAttr.call(this, name, fixed(name, value));
  };
  // Éléments créés à partir de texte HTML (innerHTML, jQuery) : corrigés dès leur arrivée.
  function fixElement(el) {
    if (!el || el.nodeType !== 1) return;
    ['src', 'href', 'poster', 'style'].forEach(function (name) {
      var v = el.getAttribute(name);
      if (v === null) return;
      var f = fixed(name, v);
      if (f !== v) setAttr.call(el, name, f);
    });
  }
  new MutationObserver(function (changes) {
    changes.forEach(function (c) {
      if (c.type === 'attributes') return fixElement(c.target);
      c.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        fixElement(node);
        node.querySelectorAll('[src],[href],[poster],[style]').forEach(fixElement);
      });
    });
  }).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['src', 'href', 'poster', 'style']
  });

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && (input.href || input.url);
    var found = look(url);
    if (!found) console.warn('h5p hors ligne : fichier absent', url);
    return found ? realFetch.call(window, found) : realFetch.call(window, input, init);
  };
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    var args = Array.prototype.slice.call(arguments);
    var found = look(String(args[1]));
    if (found) args[1] = found;
    return open.apply(this, args);
  };

  window.__lseReceive = function (files) {
    var styles = [];
    files.forEach(function (f) {
      if (/\\.css$/i.test(f.path)) styles.push(f);
      else map[f.path] = URL.createObjectURL(new Blob([f.data], { type: f.type }));
    });
    styles.forEach(function (f) {
      var text = cssUrls(new TextDecoder().decode(f.data), f.path);
      map[f.path] = URL.createObjectURL(new Blob([text], { type: 'text/css' }));
    });
  };
})();`;

const START = (key: string) => `
function lseStart() {
  // Cadre local (srcdoc) : l'adresse du cadre est about:srcdoc ; les chemins du lecteur doivent
  // alors être complets pour rester ceux du site (et trouver les fichiers reçus).
  var root = location.protocol === 'about:' ? new URL(document.baseURI).origin : '';
  var best = null;
  function send(percent) {
    best = best === null ? percent : Math.max(best, percent);
    parent.postMessage({ type: 'h5p-score', percent: best }, '*');
  }
  function height() {
    parent.postMessage({ type: 'h5p-height', height: document.getElementById('h5p').scrollHeight }, '*');
  }
  new H5PStandalone.H5P(document.getElementById('h5p'), {
    h5pJsonPath: root + '/h5p/fichiers/${key}',
    frameJs: root + '/h5p/moteur/frame.bundle.js',
    frameCss: root + '/h5p/moteur/styles/h5p.css',
    embedType: 'div',
    frame: false,
    copyright: false,
    export: false,
    embed: false,
    fullScreen: true
  }).then(function () {
    H5P.externalDispatcher.on('xAPI', function (event) {
      var s = event.data && event.data.statement;
      if (!s || !s.result || !s.result.score) return;
      var parentId = s.context && s.context.contextActivities && s.context.contextActivities.parent;
      if (parentId && parentId.length) return;
      var score = s.result.score;
      var scaled = typeof score.scaled === 'number' ? score.scaled
        : (score.max ? score.raw / score.max : 0);
      send(Math.max(0, Math.min(100, Math.round(scaled * 100))));
    });
    setInterval(height, 500);
  }).catch(function (error) {
    console.error('h5p', error);
    document.getElementById('h5p').textContent = 'Cet exercice ne peut pas s’ouvrir.';
  });
}`;

const LOCAL_BOOT = `
window.addEventListener('message', function (event) {
  var data = event.data;
  if (event.source !== parent || !data || data.type !== 'h5p-files' || window.__lseStarted) return;
  window.__lseStarted = true;
  window.__lseReceive(data.files);
  var script = document.createElement('script');
  script.onload = lseStart;
  script.onerror = function () {
    document.getElementById('h5p').textContent = 'Cet exercice ne peut pas s’ouvrir sans connexion.';
  };
  script.src = '/h5p/moteur/main.bundle.js';
  document.head.appendChild(script);
});
parent.postMessage({ type: 'h5p-need-files' }, '*');`;

export function h5pPlayerHtml(key: string, mode: 'online' | 'local'): string {
  const scripts =
    mode === 'online'
      ? `<script>${MEMORY_STORAGE}</script>
<script src="/h5p/moteur/main.bundle.js"></script>
<script>${START(key)}
lseStart();</script>`
      : `<script>${MEMORY_STORAGE}
${LOCAL_FILES}
${START(key)}
${LOCAL_BOOT}</script>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exercice H5P</title>
<style>html,body{margin:0;background:#fff;font-family:system-ui,sans-serif}#h5p{min-height:120px}</style>
</head>
<body>
<div id="h5p"></div>
${scripts}
</body>
</html>`;
}
