# ADR-008 — Lecteur de leçons (texte et voix de l’appareil)

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §1 (mode texte/audio faible débit), §4 (« écouter d’abord »,
  composant `AudioLessonPlayer`), §8 (budgets réseau), E2E-06, E2E-15 ; ticket 11 ; ADR-007

## Contexte

Les apprenants doivent pouvoir lire **et écouter** une leçon sur un téléphone modeste, avec peu
de réseau. Les enregistrements réalisés par des enseignants sont la meilleure solution à terme
(qualité, langues locales), mais ils supposent l’envoi de fichiers, leur contrôle et un stockage.

## Décision

1. **Lecture** : `GET /api/v1/catalog/courses/:id/lessons/:n` sert la leçon n° n (dans l’ordre du
   plan) de la version **publiée** du cours, avec la précédente et la suivante. Le rang plutôt que
   l’identifiant technique : l’adresse `/catalogue/[id]/lecons/[n]` reste valable quand une
   nouvelle version est publiée avec le même plan. Brouillons et cours non publiés : 404.
2. **Écoute** (choix de GOHH, 27/10/2026) : voix de synthèse de l’appareil (Web Speech API), en
   français. Aucun fichier téléchargé, fonctionne sans réseau si l’appareil a une voix française.
   Le texte est lu phrase par phrase (certains navigateurs coupent les lectures longues) ;
   boutons Écouter, Pause, Reprendre, Arrêter, vitesse lente ou normale ; état annoncé aux
   lecteurs d’écran. Sans voix disponible, un message le dit et la leçon reste lisible.
3. **Lisibilité** : texte en grande taille, largeur de ligne limitée, navigation précédente /
   suivante par liens simples (pas de JavaScript nécessaire pour lire).

## Conséquences

- La qualité de la voix dépend du téléphone et elle ne couvre pas les langues locales : un ticket
  dédié ajoutera les **enregistrements audio** des enseignants (envoi contrôlé, stockage sur le
  serveur puis stockage objet sur le VPS), prioritaires sur la voix de synthèse quand ils existent.
- La progression de l’apprenant (leçons vues) viendra avec le ticket 12 (inscription et
  progression).
