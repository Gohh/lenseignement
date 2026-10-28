# ADR-014 — Atelier virtuel : simulation de sécurité (prototype)

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : cahier directeur §3.1 C (prérequis de sécurité, check-lists EPI et gestes
  sûrs), §4.3 n° 3 (« atelier virtuel de base »), §6.2 (`safety_checklists`,
  `practical_assessments`), E2E-05 ; ticket 18 ; ADR-004, ADR-010, ADR-013

## Contexte

En enseignement technique, un apprenant ne doit pas passer à la pratique sans maîtriser les
gestes de sécurité. Le cahier demande un atelier virtuel (reconnaître le matériel, respecter les
EPI, ordonner les gestes) qui **n'autorise jamais une manipulation physique risquée sans
encadrement**, et le scénario E2E-05 : « blocage du parcours pratique en cas d'échec de
prérequis ».

## Décision

1. **Simulation** (`safety_simulations`) : rattachée à une version de référentiel métier ; elle
   vérifie une compétence de sécurité et ouvre la séance pratique d'une autre compétence.
   Démonstration FICTIVE : « Mettre un circuit en sécurité », référentiel DEMO-ELEC 2026,
   vérifie SECU-02 (consigner une installation) et ouvre INST-01 (câbler un circuit
   d'éclairage), dont SECU-02 est le prérequis. Figée une fois créée (déclencheur).
2. **Trois étapes** : `identify` (une question par matériel), `equipment` (cocher les EPI, et
   seulement eux), `order` (ranger les gestes de consignation). Le corrigé et les explications
   restent sur le serveur.
3. **Règle V1** : une étape est réussie quand elle est entièrement juste ; la simulation, quand
   toutes ses étapes le sont. Pour chaque erreur, une phrase simple dit ce qu'il faut revoir
   (« Il manque… », « À laisser… », « … est le 4e geste »). Jamais « échec ».
4. **Essais** (`simulation_attempts`) : ajout seulement, identifiant tiré par l'appareil (un
   renvoi ne crée pas de doublon ; l'identifiant d'une autre personne est refusé).
5. **Séance pratique** (`practice_requests`) : la demande n'est possible que si le **dernier**
   essai est réussi (un nouvel essai raté rebloque tant que la demande n'est pas faite). Une seule
   demande par apprenant et par simulation. Contrôle en double : l'API refuse (`409`), et un
   déclencheur de la base refuse toute demande qui ne cite pas le dernier essai, réussi, de la
   même personne. La séance se fait toujours avec le formateur ; la page le rappelle.
6. **Accès** : chacun ne voit et n'écrit que ses propres essais (`/me/simulations/:code`).

## Conséquences

- Pas encore de vue formateur : il n'y a pas de compte formateur ni de centre technique dans les
  données de démonstration. Suite prévue : le formateur voit les demandes de son groupe et
  enregistre l'évaluation pratique (`practical_assessments`), en s'appuyant sur ces tables.
- La simulation est un formulaire accessible (choix, cases, listes), sans glisser-déposer ni
  images : à enrichir (illustrations, audio) après tests avec des apprentis.
- Le contenu est fictif : un vrai atelier demandera la validation de formateurs (§7).
