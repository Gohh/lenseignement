# ADR-010 — Quiz formatifs versionnés

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §4 (`QuizRunner`), §6.1 (version exacte conservée), §6.2
  (évaluation), E2E-01, E2E-07, E2E-08 ; ticket 13 ; ADR-005, ADR-008, ADR-009

## Contexte

Les leçons doivent se terminer par de petits exercices corrigés tout de suite. Le résultat doit
rester lié à la version exacte du contenu, et un renvoi (double clic, réseau coupé puis rétabli)
ne doit jamais compter deux fois.

## Décision

1. **Questions à choix unique** : énoncé, deux à quatre choix, une bonne réponse et une
   explication montrée après la réponse ; dix questions au plus par leçon. Format simple, lisible
   sur un petit écran et prêt à être lu à voix haute plus tard.
2. **Versionnées avec le cours** : table `quiz_questions` rattachée à la leçon et à la version.
   Les questions font partie du plan (même éditeur, même enregistrement d'un bloc), passent par
   la même double validation et sont figées hors brouillon par le même déclencheur que les
   leçons. Une nouvelle version recopie le quiz.
3. **Bonnes réponses protégées** : la leçon publique donne les questions sans la bonne réponse
   ni l'explication ; elles ne partent qu'avec la correction.
4. **Deux façons de répondre** :
   - `POST /quiz/check`, ouvert à tous : correction sans rien enregistrer (visiteur, ou personne
     non inscrite) ;
   - `POST /me/quiz-attempts`, pour une personne inscrite : correction et enregistrement
     (`quiz_attempts`, `quiz_responses`) avec la version du cours.
5. **Idempotence** : l'identifiant de tentative est choisi par l'appareil (tiré par le serveur
   web à l'affichage, puis à chaque « Recommencer ») ; un renvoi rend la correction déjà
   enregistrée, sans rien ajouter. Tentatives et réponses sont en ajout seulement (déclencheur).
6. **Formatif** : tentatives illimitées ; seul le dernier résultat est affiché à l'apprenant.
   Aucune note officielle, aucun classement.

## Conséquences

- Les autres formats (choix multiples, appariement, réponse courte, H5P) viendront en ajoutant
  un type de question, sans changer les tentatives.
- L'écoute des questions (E2E-06) et la tentative hors ligne envoyée plus tard (E2E-07) sont
  prévues avec les tickets 15 (hors ligne) et 19 (alphabétisation audio) ; l'identifiant choisi
  par l'appareil les prépare déjà.
- Les enseignants ne voient pas encore les résultats de leur classe : ticket dédié, avec les
  règles ABAC existantes.
