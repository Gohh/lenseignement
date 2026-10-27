# ADR-009 — Inscription à un cours et suivi de la progression

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §6.2 (parcours apprenant), §6.5 (progression), §9 (données des
  mineurs) ; ticket 12 ; ADR-007, ADR-008

## Contexte

Le catalogue et le lecteur sont publics (ADR-007, ADR-008). Un apprenant connecté doit pouvoir
suivre un cours, marquer les leçons terminées et reprendre là où il s’était arrêté, sur le
téléphone comme sur l’ordinateur. Les apprenants sont souvent mineurs : on ne garde que le strict
nécessaire.

## Décision

1. **Deux tables** : `enrollments` (une ligne par personne et par cours, unique) et
   `lesson_progress` (une ligne par leçon terminée, unique par inscription et rang). On garde la
   version du cours en vigueur au moment où la leçon a été terminée, pour l’historique.
2. **Leçon repérée par son rang** dans le plan, comme l’adresse du lecteur (ADR-008) : la
   progression reste valable quand une nouvelle version garde le même plan. Les rangs au-delà du
   nombre de leçons actuel sont ignorés à l’affichage.
3. **Seuls les cours publiés** se suivent ; un brouillon ou un cours en relecture répond 404.
4. **Idempotence** : s’inscrire deux fois ou terminer deux fois la même leçon (double clic,
   réseau lent, renvoi) ne crée aucun doublon ; la progression ne recule jamais.
5. **Reprise** : la dernière leçon ouverte si elle n’est pas terminée, sinon la première leçon
   non terminée. La leçon ouverte est mémorisée à l’affichage du lecteur, pour une personne
   inscrite seulement.
6. **Accès** : routes `POST /enrollments`, `GET /me/learning-plan`,
   `GET /me/courses/:id/progress`, `POST /me/progress/opened|completed`. L’identité vient
   toujours du jeton ; aucun paramètre ne permet de lire ou d’écrire la progression d’une autre
   personne.
7. **Web** : formulaires envoyés par actions serveur (fonctionnent sans JavaScript côté
   navigateur) ; « Suivre ce cours » sur la fiche, « J’ai terminé cette leçon » qui ouvre la leçon
   suivante, carte « Mes cours suivis » dans Mon espace avec « Reprendre ».

## Conséquences

- Ni score ni temps passé ne sont enregistrés : seulement « leçon terminée » et sa date. Les
  quiz et évaluations viendront dans un ticket dédié.
- Les enseignants et les parents ne voient pas encore cette progression : leur accès passera par
  les règles ABAC existantes (classe, lien parental), dans un ticket dédié.
- Hors ligne : la lecture reste possible, mais « J’ai terminé » exige le réseau pour l’instant ;
  une file d’envoi différé est prévue avec le mode hors ligne.
