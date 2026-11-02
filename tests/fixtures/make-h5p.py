"""Fabrique les paquets H5P de test (bibliothèque factice H5P.TestScore, fictive).

python3 tests/fixtures/make-h5p.py  →  exercice-test.h5p, exercice-sans-bibliotheque.h5p, exercice-dangereux.h5p
"""
import json
import zipfile
from pathlib import Path

HERE = Path(__file__).parent

LIBRARY = {
    "title": "Score de test (fictif)",
    "machineName": "H5P.TestScore",
    "majorVersion": 1,
    "minorVersion": 0,
    "patchVersion": 0,
    "runnable": 1,
    "embedTypes": ["div"],
    "preloadedJs": [{"path": "score.js"}],
}

SCRIPT = """H5P.TestScore = (function () {
  function TestScore(params, contentId) {
    H5P.EventDispatcher.call(this);
    this.params = params;
    this.contentId = contentId;
  }
  TestScore.prototype = Object.create(H5P.EventDispatcher.prototype);
  TestScore.prototype.constructor = TestScore;
  TestScore.prototype.attach = function ($container) {
    var self = this;
    var root = $container.get(0);
    var question = document.createElement('p');
    question.textContent = self.params.question;
    root.appendChild(question);
    self.params.answers.forEach(function (answer) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = answer.text;
      button.onclick = function () {
        self.triggerXAPIScored(answer.correct ? 1 : 0, 1, 'answered');
      };
      root.appendChild(button);
    });
  };
  return TestScore;
})();
"""

H5P_JSON = {
    "title": "Quel outil desserre les écrous ? (fictif)",
    "language": "fr",
    "mainLibrary": "H5P.TestScore",
    "embedTypes": ["div"],
    "license": "U",
    "preloadedDependencies": [{"machineName": "H5P.TestScore", "majorVersion": 1, "minorVersion": 0}],
}

CONTENT = {
    "question": "Quel outil desserre les écrous de roue ?",
    "answers": [{"text": "Un tournevis", "correct": False}, {"text": "Une clé en croix", "correct": True}],
}


def build(name: str, with_library: bool, evil: bool = False) -> None:
    with zipfile.ZipFile(HERE / name, "w", zipfile.ZIP_DEFLATED) as z:
        if evil:
            z.writestr("../evil.js", "alert(1)")
        z.writestr("h5p.json", json.dumps(H5P_JSON, ensure_ascii=False))
        z.writestr("content/content.json", json.dumps(CONTENT, ensure_ascii=False))
        if with_library:
            z.writestr("H5P.TestScore-1.0/library.json", json.dumps(LIBRARY, ensure_ascii=False))
            z.writestr("H5P.TestScore-1.0/score.js", SCRIPT)
            z.writestr("H5P.TestScore-1.0/ignore.exe", "ignored")


build("exercice-test.h5p", True)
build("exercice-sans-bibliotheque.h5p", False)
build("exercice-dangereux.h5p", True, evil=True)
