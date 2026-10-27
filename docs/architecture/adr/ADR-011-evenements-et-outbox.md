# ADR-011 — Actions idempotentes et outbox transactionnelle

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §5.3 (outbox, idempotence), §5.4 (file locale d'actions),
  §6.4 (`learning_events`), E2E-07, E2E-08 ; ticket 14 ; ADR-009, ADR-010

## Contexte

Les apprenants travaillent souvent avec un réseau intermittent. Une action envoyée peut arriver
deux fois (renvoi après coupure), dans le désordre, ou jamais. Les fonctions à venir (badges,
tableaux de bord, notifications) doivent être prévenues de chaque progrès **une seule fois**, sans
que l'enregistrement du progrès et l'envoi de l'évènement puissent diverger.

## Décision

1. **Journal des actions** (`learning_events`) : chaque action de l'apprenant porte un
   `operationId` tiré par l'appareil, unique par personne. Une action déjà reçue répond
   `duplicate` et n'est pas rejouée. Ajout seulement ; l'heure de l'appareil est gardée à côté de
   l'heure de réception ; les réponses aux quiz n'y sont pas copiées.
2. **Envoi groupé** : `POST /api/v1/learning-events` reçoit jusqu'à 50 actions (`enrolled`,
   `lesson_opened`, `lesson_completed`, `quiz_submitted`), traitées dans l'ordre, chacune dans
   sa propre transaction (journal et effet ensemble). Résultat par action : `applied`,
   `duplicate` ou `rejected` avec un message. Une action refusée ne laisse aucune trace et peut
   être renvoyée. C'est la route que le mode hors ligne (ticket 15) utilisera.
3. **Outbox transactionnelle** (`outbox_events`) : `EnrollmentCreated`, `LessonCompleted` et
   `AssessmentSubmitted` sont écrits dans la transaction du changement, **seulement quand il y a
   un vrai changement**. Une leçon terminée deux fois, même sous deux identifiants, ne produit
   qu'un évènement (pas de double badge, E2E-08). Contenu : identifiants seulement.
4. **Travailleur** dans le processus de l'API : toutes les 2 s, il prend un lot avec
   `for update skip locked` (plusieurs instances possibles sans double prise), le délivre dans
   l'ordre et le marque publié. En cas d'échec, la tentative est reportée (2 s, 4 s, 8 s…
   jusqu'à une heure) sans bloquer les autres évènements. Livraison « au moins une fois » : un
   destinataire s'appuie sur l'identifiant de l'évènement pour ne pas le traiter deux fois.
   Aujourd'hui, le seul destinataire est le journal technique.
5. Les routes directes (`/enrollments`, `/me/progress/*`, `/me/quiz-attempts`) restent : elles
   passent par les mêmes fonctions, donc par la même outbox.

## Conséquences

- Pas d'en-tête `Idempotency-Key` générique : chaque commande sensible est idempotente par
  construction (contraintes d'unicité, identifiant d'action ou de tentative).
- Pas de Redis ni de file externe pour l'instant (PC sans Docker, VPS simple) ; le travailleur
  pourra être sorti dans un processus séparé si la charge le demande.
- Conservation : purge des évènements publiés et durée de garde du journal à fixer avec la
  politique de conservation des données (ticket dédié).
