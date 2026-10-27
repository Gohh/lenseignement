# ADR-012 — Hors connexion et synchronisation

- **Statut** : acceptée
- **Date** : 2026-10-27
- **Références** : cahier directeur §1 (offline-first), §4 (`OfflineBadge`, `SyncStatus`), §5.4,
  §10.3, E2E-07, E2E-08, E2E-16 ; ticket 15 ; ADR-008, ADR-010, ADR-011

## Contexte

Beaucoup d'apprenants ont un réseau coupé, lent ou payé au mégaoctet, et parfois un téléphone
partagé. Une leçon commencée doit pouvoir se terminer sans réseau, et rien de ce qui est fait
hors ligne ne doit être perdu ni compté deux fois.

## Décision

1. **Service worker** (`apps/web/public/sw.js`, sans dépendance) :
   - accueil, catalogue et page « Pas de connexion » (`/hors-ligne`) gardés dès l'installation ;
   - pages publiques et leçons : réseau d'abord, copie gardée si le réseau manque ou met plus de
     4 s, sinon la page « Pas de connexion » ;
   - fichiers de l'interface (`/_next/static`) : réseau d'abord (le cache HTTP évite déjà les
     retéléchargements), copie gardée sans réseau ;
   - jamais gardés : l'espace personnel (`/mon-espace`), la connexion, les envois, l'API ;
     aucun jeton n'est accessible au service worker.
2. **« Garder ce cours sur cet appareil »** : la fiche du cours et toutes ses leçons (avec leurs
   fichiers) sont téléchargées d'un coup. L'en-tête `x-lse-keep` évite que ce téléchargement
   compte comme une leçon ouverte (bouton « Reprendre »). Pas encore de « pack signé » (§5.4) :
   les pages viennent du même site, en HTTPS ; les packs signés viendront avec l'audio (ticket 19).
3. **File locale d'actions** (IndexedDB, `lib/offline-queue.ts`) : « leçon terminée » et
   « quiz envoyé » faits sans réseau sont gardés avec leur identifiant d'opération et l'heure de
   l'appareil. Rien d'autre : ni nom, ni jeton, seulement les identifiants et les choix du quiz.
   Le quiz n'est **pas corrigé sur l'appareil** (les bonnes réponses ne quittent pas l'API) : le
   résultat s'affiche après l'envoi. Les réponses cochées restent visibles (brouillon conservé).
   Si le réseau tombe pendant l'envoi d'un quiz, l'identifiant de la tentative sert d'identifiant
   d'opération : si la première tentative était arrivée, elle n'est pas comptée deux fois.
4. **Synchronisation** : au retour du réseau (et à chaque page), les actions partent dans
   l'ordre vers `POST /api/sync` du site web, qui ajoute le jeton de la session et les transmet à
   `POST /api/v1/learning-events` (ADR-011) par lots de 50. Une action acceptée ou déjà reçue est
   retirée de la file ; une action refusée aussi, avec son message affiché. On garde la route de
   l'ADR-011 au lieu d'un `POST /offline/sync` séparé (§5.3) : une seule porte d'entrée.
5. **Appareil partagé** : chaque action porte l'empreinte de la personne connectée (SHA-256 de
   son identifiant OIDC, jamais l'identifiant en clair) ; `/api/sync` n'envoie que les actions de
   la personne connectée. La déconnexion efface pages gardées et actions (`Clear-Site-Data:
"cache", "storage"`), et « Effacer mes données sur cet appareil » (Mon espace) fait de même,
   en prévenant si des actions ne sont pas encore envoyées.
6. **Indicateurs** : `OfflineBadge` (« Hors ligne ») et `SyncStatus` (« N actions en attente de
   synchronisation », « Synchroniser maintenant », « Progression enregistrée »), annoncés aux
   lecteurs d'écran. Manifeste complété (icône, `id`, `scope`) : le site s'installe comme une
   application.

## Conséquences

- Le hors-ligne complet se vérifie sur la version construite (`pnpm start`, ajouté à la racine :
  construit puis démarre l'API et le site). En mode développement (`pnpm dev`), le service worker
  ne gêne pas (le réseau passe toujours en premier), mais une page gardée peut s'afficher sans
  ses boutons actifs, car le serveur de développement charge ses fichiers à la demande.
- Pas de chiffrement de l'IndexedDB : le cahier demande de ne pas présumer une protection totale
  sur un appareil partagé ; on minimise donc ce qui est gardé et on l'efface à la déconnexion.
- Une page gardée montre la progression du moment où elle a été gardée ; elle se met à jour à la
  prochaine ouverture avec réseau.
- Une session expirée hors ligne garde les actions jusqu'à la reconnexion de la même personne.
- Inscription à un cours et ouverture d'une leçon hors ligne : pas encore gardées (l'inscription
  demande déjà le réseau ; « Reprendre » se met à jour au retour).
