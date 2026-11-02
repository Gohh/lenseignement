/**
 * Page du lecteur H5P, chargée dans un cadre isolé (sandbox sans allow-same-origin) : le code de
 * l'exercice ne voit ni la session ni la page de l'élève. Le score final est envoyé à la page
 * parente par postMessage ({ type: 'h5p-score', percent }).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9]{32}$/.test(key)) return new Response('Introuvable', { status: 404 });
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exercice H5P</title>
<style>html,body{margin:0;background:#fff;font-family:system-ui,sans-serif}#h5p{min-height:120px}</style>
</head>
<body>
<div id="h5p"></div>
<script>
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
})();
</script>
<script src="/h5p/moteur/main.bundle.js"></script>
<script>
(function () {
  var best = null;
  function send(percent) {
    best = best === null ? percent : Math.max(best, percent);
    parent.postMessage({ type: 'h5p-score', percent: best }, '*');
  }
  function height() {
    parent.postMessage({ type: 'h5p-height', height: document.getElementById('h5p').scrollHeight }, '*');
  }
  new H5PStandalone.H5P(document.getElementById('h5p'), {
    h5pJsonPath: '/h5p/fichiers/${key}',
    frameJs: '/h5p/moteur/frame.bundle.js',
    frameCss: '/h5p/moteur/styles/h5p.css',
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
})();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "sandbox allow-scripts; frame-ancestors 'self'",
      'cache-control': 'no-store',
    },
  });
}
