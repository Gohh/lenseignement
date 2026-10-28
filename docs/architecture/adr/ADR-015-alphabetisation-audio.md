# ADR-015 — Alphabétisation : « écouter d'abord » (prototype)

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : cahier directeur §3.1 D (interface « écouter d'abord », pictogrammes), §4.3
  n° 2 (« marché-école »), §4.1 (alternative non vocale), E2E-06 ; ticket 19 ; ADR-008
  (lecteur et voix de synthèse), ADR-010 (quiz), ADR-012 (hors ligne)

## Contexte

Un adulte qui lit peu doit pouvoir suivre une leçon et répondre au quiz en écoutant, sans
dépendre d'un texte complexe (E2E-06). Le lecteur du ticket 11 lit déjà la leçon avec la voix de
l'appareil, mais pas les questions, les réponses ni la correction.

## Décision

1. **Bouton 🔊 partout où il y a du texte à comprendre** (`SpeakButton`) : présentation du
   cours (titre, résumé, liste des leçons), chaque question (avec ses réponses), chaque réponse
   seule, le résultat et la correction. Pour tous les cours, pas seulement en alphabétisation.
   Le nom du bouton pour les lecteurs d'écran est un texte masqué (« Écouter la question 1 »).
2. **« Écouter d'abord »** pour les cours de l'espace alphabétisation : le lecteur passe avant
   le titre et le texte est plus grand. La leçon expose désormais l'espace de son cours
   (`CatalogLesson.branch`).
3. **Voix de synthèse de l'appareil** (comme ADR-008) : rien à télécharger, fonctionne hors
   ligne une fois le cours gardé (ADR-012). Les pictogrammes (🪙, 💵) aident à l'écran mais ne
   sont pas lus. Sans voix sur l'appareil, les boutons disparaissent et le texte reste
   (alternative non vocale).
4. **Après la correction**, les réponses sont figées mais les boutons d'écoute restent actifs.
5. **Cours de démonstration FICTIF** « Marché-école : l'argent du marché », parcours DEMO-ALPHA
   2026 (NOMB-01 reconnaître l'argent, NOMB-02 rendre la monnaie) : deux leçons en phrases
   courtes et trois questions.

## Conséquences

- Voix : le site choisit la voix la plus naturelle de l'appareil pour la langue du cours
  (voix « Natural/Online » d'Edge et Windows, puis Google, puis la variante de France) et ne
  coupe la lecture qu'en fin de phrase, pour moins de pauses (retour de GOHH sur PC, 28/10).
- La prononciation dépend du téléphone. Suite prévue : des **enregistrements de vraies voix**
  (par exemple celle de l'animateur), envoyés par le formateur ; le bouton 🔊 lira alors
  l'enregistrement quand il existe, et la voix de synthèse sinon.
- Pas de commande vocale (reconnaissance de la parole) : peu fiable hors ligne et sur les
  téléphones économiques ; à étudier avec des apprenants.
- Langues locales : à définir avec linguistes et équipes pédagogiques (cahier §3.1 D) ; le
  bouton suit déjà la langue du cours.
