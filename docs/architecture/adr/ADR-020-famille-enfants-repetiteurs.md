# ADR-020 — Enfants ajoutés par le parent, répétiteurs en lecture seule

- **Statut** : acceptée
- **Date** : 2026-10-28
- **Références** : demande de GOHH (28/10/2026) ; ADR-003 (contrôle d'accès), ADR-018 (inscription)

## Décision

1. **Le parent crée le profil de son enfant** (`POST /family/children`) : compte de type « mineur »
   sans identité de connexion (`oidc_subject = child:<id>`), lié au parent par un lien vérifié
   (`guardian_links`). Le parent voit ses progrès par la fiche élève existante. Au plus 10 enfants.
   La connexion de l'enfant lui-même (code à 6 chiffres) est une étape à part.
2. **Le niveau de l'enfant** est facultatif (`users.level`, liste fixe de l'ADR-017).
3. **Le répétiteur est invité par le parent** : un code de 8 caractères (sans lettres ambiguës),
   à usage unique, valable 7 jours, pour des enfants choisis du parent (`tutor_invitations`).
   Le répétiteur, connecté, saisit le code ; un lien actif est créé par enfant (`tutor_links`).
4. **Accès en lecture seule** : un lien actif donne la raison d'accès `tutor` à la fiche de
   l'enfant. Les décisions pédagogiques (`assertCanGuide`) restent refusées au répétiteur.
5. **Le parent retire l'accès** d'un répétiteur à tout moment (`DELETE /family/tutors/:id`).
6. **Code invalide, expiré ou déjà utilisé** : message unique, sans dire lequel. Création, usage
   et retrait sont inscrits au journal d'audit.

## Conséquences

- Un répétiteur n'a pas de rôle de structure : il n'existe que par ses liens actifs.
- Écrans : « Ma famille » (parent) et « Répétiteur » dans Mon espace.
- À venir : connexion de l'enfant par code, courriel ou SMS d'invitation à la place du code remis
  de la main à la main.
