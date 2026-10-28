# Guide pas à pas — lancer et tester L’Enseignement sous Windows (sans Docker)

Ce guide sert à tester une PR sur votre PC avant de la fusionner. Il est écrit pour Windows 10/11
avec **PowerShell**, **sans Docker** : PostgreSQL est celui déjà installé sur le poste, Keycloak
tourne avec Java, et les sessions sont gardées en mémoire. Comptez environ 30 minutes la
première fois (installations), puis 5 minutes.

Vous aurez **trois fenêtres PowerShell** ouvertes pendant les tests : Keycloak, l’application,
et une fenêtre libre pour les commandes.

---

## Étape 1 — Installer les outils (une seule fois)

1. **Git pour Windows** : https://git-scm.com/download/win — options par défaut.
2. **Node.js 22 LTS** : https://nodejs.org — choisir la version **22 LTS**, options par défaut.
3. **Java 21** (nécessaire à Keycloak) : https://adoptium.net — choisir
   **Temurin 21 LTS**, Windows x64, fichier `.msi`. Pendant l’installation, activer
   « **Set JAVA_HOME variable** » et « **Add to PATH** ».
4. **Keycloak 26.8.1** : télécharger
   https://github.com/keycloak/keycloak/releases/download/26.8.1/keycloak-26.8.1.zip
   et l’extraire dans `C:\Outils\` (vous obtenez `C:\Outils\keycloak-26.8.1\`).
5. Ouvrir **PowerShell en administrateur** (clic droit sur le menu Démarrer → « Terminal
   (administrateur) ») et taper :

   ```powershell
   corepack enable
   corepack prepare pnpm@10.28.0 --activate
   ```

6. Fermer cette fenêtre, ouvrir un PowerShell **normal** et vérifier :

   ```powershell
   node -v      # doit afficher v22.x
   pnpm -v      # doit afficher 10.28.0
   java -version   # doit afficher 21.x
   ```

## Étape 2 — Récupérer le code (une seule fois)

```powershell
mkdir C:\Projets -Force
cd C:\Projets
git clone https://github.com/Gohh/lenseignement.git
cd lenseignement
```

> Évitez `C:\wamp64\www` : ce projet ne passe pas par Apache, il a ses propres serveurs.

## Étape 3 — Préparer PostgreSQL (une seule fois)

1. Vérifier la version (14 ou plus récente recommandée). Si `psql` n’est pas reconnu, utiliser
   « SQL Shell (psql) » dans le menu Démarrer, ou le chemin complet, par exemple
   `& "C:\Program Files\PostgreSQL\17\bin\psql.exe"` (adapter le numéro de version).

   ```powershell
   psql --version
   ```

2. Créer l’utilisateur et la base du projet. Le mot de passe demandé est celui du compte
   `postgres` choisi à l’installation de PostgreSQL :

   ```powershell
   psql -U postgres -c "CREATE ROLE lenseignement LOGIN PASSWORD 'change-me-dev-only';"
   psql -U postgres -c "CREATE DATABASE lenseignement OWNER lenseignement ENCODING 'UTF8';"
   psql -U postgres -d lenseignement -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   ```

   Attendu : `CREATE ROLE`, `CREATE DATABASE`, puis `CREATE EXTENSION`.
   Vous pouvez aussi le faire dans **pgAdmin** si vous préférez l’interface graphique.

3. Créer les deux bases réservées aux tests automatiques (elles sont vidées à chaque test,
   ne jamais y mettre de vraies données) :

   ```powershell
   psql -U postgres -c "CREATE DATABASE lenseignement_test OWNER lenseignement ENCODING 'UTF8';"
   psql -U postgres -c "CREATE DATABASE lenseignement_e2e OWNER lenseignement ENCODING 'UTF8';"
   ```

> Si votre PostgreSQL n’écoute pas sur le port habituel **5432**, ajoutez `-p <port>` à chaque
> commande `psql` (par exemple `-p 5430`) et adaptez le port dans le fichier `.env` (étape 5).

## Étape 4 — Récupérer la version à tester (fenêtre n° 2)

Chaque PR a une branche. **À faire avant le fichier `.env`** : certains réglages n’existent que
dans la branche de la PR. Pour la PR #23 (nouveau look : catalogue et fiches de cours) :

```powershell
cd C:\Projets\lenseignement
git fetch origin
git checkout feat/look-catalogue
git pull
pnpm install
pnpm build
```

Attendu : la dernière ligne indique `Tasks: 4 successful, 4 total`.

## Étape 5 — Créer le fichier de configuration local

```powershell
cd C:\Projets\lenseignement
Copy-Item .env.example .env -Force
notepad .env
```

Dans le Bloc-notes, remplacer la ligne `SESSION_STORE=redis` par :

```text
SESSION_STORE=memory
```

Si votre PostgreSQL utilise un autre port que 5432, modifier aussi la ligne `DATABASE_URL`, par
exemple pour le port 5430 :

```text
DATABASE_URL=postgresql://lenseignement:change-me-dev-only@localhost:5430/lenseignement
```

Enregistrer et fermer. (Sans Redis, les sessions sont gardées en mémoire : vous serez
simplement déconnecté à chaque redémarrage de l’application. Ce mode est refusé en production.)

## Étape 6 — Créer les tables et les données de démonstration

```powershell
pnpm --filter @lenseignement/api db:migrate
pnpm --filter @lenseignement/api db:seed
```

Attendu : `Migrations appliquées.` puis `Données de démonstration fictives insérées.`
Les deux commandes peuvent être relancées sans risque : elles n’ajoutent que ce qui manque.
**À refaire après chaque nouvelle PR** qui touche à la base (nouvelles tables ou nouvelles
données de démonstration).

## Étape 7 — Démarrer Keycloak (fenêtre PowerShell n° 1)

1. **La première fois seulement**, copier la configuration du projet dans Keycloak :

   ```powershell
   mkdir C:\Outils\keycloak-26.8.1\data\import -Force
   Copy-Item C:\Projets\lenseignement\infra\keycloak\realm-lenseignement.json C:\Outils\keycloak-26.8.1\data\import\
   ```

2. Démarrer Keycloak (à faire à chaque session de travail) :

   ```powershell
   cd C:\Outils\keycloak-26.8.1
   $env:KC_BOOTSTRAP_ADMIN_USERNAME = "admin"
   $env:KC_BOOTSTRAP_ADMIN_PASSWORD = "change-me-dev-only"
   bin\kc.bat start-dev --import-realm --http-port=8080
   ```

   Attendu, après 20 à 60 secondes : `Realm 'lenseignement' imported` (la première fois) puis
   `Keycloak 26.8.1 ... started ... Listening on: http://localhost:8080`.
   **Laissez cette fenêtre ouverte.** Console d’administration : http://localhost:8080
   (`admin` / `change-me-dev-only`).

> Si Windows demande d’autoriser Java sur le réseau, accepter pour les réseaux **privés**.

## Étape 8 — Lancer l’application (fenêtre n° 2)

```powershell
pnpm dev
```

Laissez cette fenêtre ouverte. Attendu : les lignes `Ready` (site) et
`Found 0 errors. Watching for file changes.` (API).

## Étape 9 — Tester dans le navigateur

1. Ouvrir http://localhost:3000 : la page d’accueil s’affiche avec « Que voulez-vous faire ? ».
2. Cliquer sur **Mon espace** (en haut à droite) : vous arrivez sur la page de connexion Keycloak.
3. Se connecter avec `apprenant.demo` / `Demo-lenseignement-2026` (compte **fictif**).
4. Attendu : « **Bonjour, Awa** », le profil « Apprenant » et la phrase
   « **Compte reconnu par le service.** » (preuve que l’API a vérifié votre jeton).
5. Cliquer sur **Se déconnecter** : retour à l’accueil. Recliquer sur « Mon espace » doit
   redemander le mot de passe.
6. Facultatif : http://localhost:4000/api/v1/health doit afficher `"status":"ok"`, et
   http://localhost:4000/api/v1/me doit répondre **401** (accès refusé sans connexion, c’est voulu).

Comptes fictifs (même mot de passe) et ce que chacun doit voir dans « Mon espace » :

| Compte             | Personne fictive         | Ce qui doit s’afficher                                                   |
| ------------------ | ------------------------ | ------------------------------------------------------------------------ |
| `apprenant.demo`   | Awa, élève de CP1 A      | Ni « Mes classes » ni « Mes enfants »                                    |
| `enseignant.demo`  | Koffi, maître du CP1 A   | « Mes classes » : **CP1 A** seulement (3 élèves)                         |
| `enseignant2.demo` | Aminata, maîtresse CP1 B | « Mes classes » : **CP1 B** seulement (1 élève)                          |
| `directeur.demo`   | Bamba, directeur         | Les deux classes de son école, pas celle de l’autre école                |
| `referent.demo`    | Mariam, référente        | Les trois classes des deux écoles de sa région                           |
| `parent.demo`      | Fatou, mère d’Awa        | « Mes enfants » : **Awa** seulement (le lien vers Seydou est en attente) |
| `admin.demo`       | Yao, administrateur      | Aucune donnée d’élève (demande aussi une application d’authentification) |

Test du refus d’accès : connecté en `enseignant.demo`, ouvrir
http://localhost:3000/mon-espace/classes/30000000-0000-4000-8000-000000000002 (la classe de la
collègue) : la page doit afficher « **Accès refusé** ».

Test des programmes (sans connexion) : ouvrir http://localhost:3000/branches/primaire/programme.
Attendu : le bandeau « Programme de démonstration, non officiel », la **version 2026** et la
compétence « Compter jusqu'à 50 ». Dans « Historique des versions », cliquer sur
**Version 2025** : la compétence redevient « Compter jusqu'à 20 ».

Test de la rédaction de cours : se connecter en `enseignant.demo`, puis dans « Mon espace »
cliquer sur **Mes cours**. Attendu : le brouillon fictif « Lire ses premières syllabes
(démonstration) ». Cliquer sur **Créer un cours**, donner un titre, puis choisir le programme
« version 2026 », enregistrer, cocher une compétence, enregistrer à nouveau. Dans « Plan du
cours », ajouter un module et une leçon, puis **Enregistrer le plan** : après rechargement de la
page, tout doit être conservé. Connecté en `apprenant.demo`, le lien « Mes cours » n’apparaît
pas et http://localhost:3000/mon-espace/cours indique que la rédaction est réservée.

Test de la relecture (double validation) : se connecter en `referent.demo` (Mariam), puis dans
« Mon espace » cliquer sur **À relire et à publier**. Ouvrir « Compter au marché
(démonstration) » (cours fictif de Mme Aminata), cocher les trois contrôles et cliquer sur
**Approuver** : Mariam ne voit pas de bouton « Publier » (elle vient d’approuver). Se reconnecter
en `directeur.demo` (Bamba), ouvrir le même cours depuis « À relire et à publier » et cliquer sur
**Publier cette version** : le statut devient « Publiée » et l’historique montre les trois
étapes. Connecté en `enseignant.demo`, aucun bouton de validation n’apparaît.

Test du catalogue (sans connexion) : cliquer sur **Catalogue** en haut de la page. Attendu : les
cours publiés, dont « Les nombres jusqu’à 50 (démonstration) » et « Lire des mots courts
(démonstration) ». Taper « mots » dans « Rechercher » puis **Filtrer** : un seul cours reste.
Ouvrir sa fiche : compétences visées et plan du cours. Le brouillon « Lire ses premières
syllabes » n’apparaît jamais dans le catalogue.

Test du lecteur de leçons (sans connexion) : dans le catalogue, ouvrir « Les nombres jusqu’à 50
(démonstration) » puis cliquer sur **Commencer le cours**. Attendu : « Leçon 1 sur 2 », le texte en
grand et le bloc « Écouter la leçon ». Cliquer sur **Écouter** : l’ordinateur lit la leçon à voix
haute (monter le son ; sous Windows, la voix française est fournie par le système). Cliquer sur
**Leçon suivante →**, puis **← Leçon précédente**.

Test de l’inscription et de la progression (la PR #8 ajoute deux tables : refaire l’étape 6
avant) : se connecter en `apprenant.demo` (Awa). Dans « Mon espace », la carte **Mes cours
suivis** indique « Vous ne suivez encore aucun cours ». Ouvrir « Les nombres jusqu’à 50
(démonstration) » depuis le catalogue et cliquer sur **Suivre ce cours** : « 0 leçon sur 2
terminée. » et un bouton **Reprendre : leçon 1**. Cliquer dessus, puis sur **J’ai terminé cette
leçon** en bas de la leçon : la leçon 2 s’ouvre. Revenir dans « Mon espace » : « 1 leçon sur 2
terminée. » et **Reprendre : leçon 2**. Terminer la leçon 2 : la fiche du cours affiche « Bravo,
vous avez terminé ce cours ! » et une coche devant chaque leçon du plan. Sans connexion, la fiche
propose seulement « Se connecter pour enregistrer sa progression ».

Test des quiz (la PR #9 ajoute des tables et un cours fictif : refaire l’étape 6 avant) : sans
connexion, ouvrir « Additionner jusqu’à 10 (démonstration) » dans le catalogue, puis **Commencer
le cours**. Sous la leçon, le bloc « Quiz de la leçon » propose deux questions. Choisir « Trois »
puis « Six » et cliquer sur **Valider mes réponses** : « Résultat : 1 sur 2. », la première
question est marquée « Bonne réponse » et la seconde donne la bonne réponse (« Cinq ») avec son
explication. **Recommencer le quiz** vide les réponses. Connecté en `apprenant.demo`, après
**Suivre ce cours**, le résultat est enregistré : en rechargeant la leçon, « Votre dernier
résultat » s’affiche. Côté rédaction, connecté en `enseignant.demo`, chaque leçon du plan d’un
brouillon a un bloc « quiz (facultatif) » avec **Ajouter une question**.

Test des évènements (la PR #10 ajoute deux tables : refaire l’étape 6 avant) : connecté en
`apprenant.demo`, suivre un cours qu’Awa ne suit pas encore, puis terminer une leçon. Dans la
fenêtre où tourne `pnpm dev`, une ligne `[Outbox] EnrollmentCreated …` puis une ligne
`[Outbox] LessonCompleted …` apparaissent dans les secondes qui suivent : chaque progrès produit
un évènement, une seule fois. Cliquer de nouveau sur **Suivre ce cours** ou terminer encore la
même leçon n’en produit pas de nouveau.

Test des fiches élèves (PR #11) : connecté en `parent.demo` (Fatou), cliquer sur **Awa (fictive)**
dans « Mes enfants » : sa fiche s’ouvre avec sa classe (CP1 A). Ouvrir ensuite
http://localhost:3000/mon-espace/eleves/40000000-0000-4000-8000-000000000103 (Seydou, dont le
lien avec Fatou n’est pas encore vérifié) : « Accès refusé », sans aucun nom. Connecté en
`enseignant.demo`, la même adresse est aussi refusée (Seydou est dans la classe d’une collègue),
alors que les élèves de sa classe CP1 A s’ouvrent depuis « Mes classes ».

Test du mode hors connexion (PR #12) : il se teste avec la version « construite » du site, plus
proche de ce qui tournera sur le serveur. Dans la fenêtre n° 2, au lieu de `pnpm dev`, taper
`pnpm start` (le site est d’abord construit, puis démarré ; attendre la ligne `Ready`).

1. Connecté en `apprenant.demo`, ouvrir « Additionner jusqu’à 10 (démonstration) », cliquer sur
   **Suivre ce cours** si besoin, puis sur **Garder ce cours sur cet appareil** : « ✓ Ce cours est
   disponible sans connexion sur cet appareil. »
2. Couper le site : dans la fenêtre n° 2, `Ctrl + C` (répondre `O` si Windows le demande).
3. Dans le navigateur, cliquer sur la première leçon : elle s’ouvre quand même. Répondre au quiz
   et cliquer sur **Valider mes réponses** : « Réponses gardées sur cet appareil, en attente de
   synchronisation ». Cliquer sur **J’ai terminé cette leçon** : un bandeau indique « 2 actions
   en attente de synchronisation ».
4. Relancer `pnpm start`, attendre `Ready`, puis cliquer sur **Synchroniser maintenant** :
   « ✓ Progression enregistrée. » En rechargeant la leçon : « ✓ Leçon terminée » et « Votre
   dernier résultat ».
5. Dans **Mon espace**, la carte « Cet appareil » propose **Effacer mes données sur cet
   appareil** ; la déconnexion efface aussi tout.

Avec une vraie coupure d’internet (téléphone en mode avion), le badge « Hors ligne » s’affiche et
l’envoi se fait tout seul au retour du réseau.

Test du rattrapage en lecture (la PR #13 ajoute des tables, un bilan et un cours fictifs :
refaire l’étape 6 avant) :

1. Connecté en `apprenant.demo`, **Mon espace** → **Mon bilan de lecture**. Répondre juste aux
   deux questions de lettres et aux deux de compréhension, et se tromper sur les syllabes et les
   mots, puis **Envoyer mon bilan**.
2. Attendu : « À travailler : Lire des syllabes simples », la liste « Pourquoi ? » (les mots
   demandent d’abord les syllabes) et le bouton **Ouvrir le cours : Des lettres aux syllabes**.
3. Le **petit test de vérification** : se tromper une fois (« Pas encore… »), puis répondre juste
   (« Bravo, c’est acquis ! »).
4. Refaire le bilan avec les mêmes erreurs, se déconnecter, puis se connecter en
   `enseignant.demo` : **Mes classes** → **CP1 A** → **Awa (fictive)**. La carte « Rattrapage en
   lecture » montre le bilan et le « Pourquoi ? ». Choisir une autre compétence, écrire la raison,
   **Enregistrer l’orientation**.
5. En `parent.demo`, la fiche d’Awa montre l’orientation et la raison, sans formulaire.

Test de l’atelier virtuel de sécurité (la PR #15 ajoute des tables et une simulation fictive :
refaire l’étape 6 avant) :

1. Connecté en `apprenant.demo`, **Mon espace** → **Atelier virtuel : sécurité**. Attendu :
   « 🔒 Bloquée » pour la séance pratique, et le rappel « ne touche jamais une installation
   électrique sans ton formateur ».
2. Faire la simulation avec des erreurs (par exemple cocher « Montre ou bracelet en métal »),
   puis **Vérifier ma simulation**. Attendu : « Pas encore », ce qu’il faut revoir, et la séance
   toujours bloquée.
3. Refaire la simulation sans erreur : matériel (VAT, disjoncteur, cadenas), équipements (gants,
   lunettes, chaussures), gestes (équipements, couper, cadenas, VAT, commencer). Attendu :
   « Bravo, simulation réussie ! » et la séance « Ouverte ».
4. **Demander ma séance pratique encadrée**. Attendu : « ✓ Demande envoyée ».

Test de l’écoute pour les adultes (la PR #16 ajoute un cours fictif : refaire l’étape 6 avant ;
monter le son de l’ordinateur) :

1. **Catalogue** → espace **Alphabétisation** → **Marché-école : l’argent du marché**. Le bouton
   🔊 à côté du titre lit la présentation du cours.
2. Connecté en `apprenant.demo`, **Suivre ce cours**, puis **Commencer le cours**. Attendu : le
   cadre « Écouter la leçon » est tout en haut ; **Écouter** lit la leçon.
3. Dans le quiz, chaque 🔊 lit la question ou une réponse. Choisir **10 pièces**, **Valider mes
   réponses**, puis 🔊 à côté du résultat et de la correction.

Test des statistiques anonymes (la PR #18 ajoute des élèves fictifs : refaire l’étape 6 avant) :

1. Connecté en `directeur.demo`, **Mon espace** → carte **Pilotage** → **Statistiques
   anonymes**.
2. Attendu pour « Additionner jusqu’à 10 » : 12 inscrits, 10 ont commencé, 7 ont terminé, 85 % de bonnes
   réponses. Aucun nom d’élève sur la page.
3. Les cours suivis par moins de 5 personnes affichent « moins de 5 » et « pas assez de
   personnes ».
4. En `enseignant.demo`, pas de carte **Pilotage** ; l’adresse
   `http://localhost:3000/mon-espace/statistiques` affiche « Ce tableau est réservé à la direction
   des établissements et aux référents. »

Test de la navigation (PR #19) :

1. Connecté en `directeur.demo`, **Mon espace** : un menu apparaît en haut, avec **Vue
   d’ensemble**, **Rédiger**, **Relecture** et **Statistiques**. La page en cours est en vert.
2. Cliquer sur **Statistiques**, puis sur **Relecture** : on passe d’un outil à l’autre sans
   revenir en arrière.
3. En `apprenant.demo`, le menu montre **Vue d’ensemble**, **Mon bilan** et **Atelier**.

Test du logo (PR #20) :

1. Page d’accueil : le logo (un livre ouvert sous un soleil orange) apparaît en haut à gauche et
   dans le grand bandeau vert ; une fine bande orange borde le haut de la page.
2. L’onglet du navigateur montre le même logo (si l’ancien « E » reste, appuyer sur Ctrl + F5).
3. Sur téléphone, seul le logo reste en haut à gauche, pour laisser la place aux boutons.

Test des niveaux et classes (la PR #21 ajoute une colonne : refaire l’étape 6 avant) :

1. **Catalogue** : un nouveau choix **Niveau ou classe** liste Maternelle (1re à 3e section),
   Primaire (CP1 à CM2), Collège (6e à 3e), Lycée (2nde à Terminale) et Alphabétisation
   (niveaux 1 à 3).
2. Choisir **Alphabétisation Niveau 1**, puis **Filtrer** : seul « Marché-école » reste. Sa fiche
   indique « Niveau : Alphabétisation Niveau 1 ».
3. En `enseignant.demo`, **Mon espace** → **Rédiger** → un brouillon : le champ **Niveau ou
   classe** ne propose que les niveaux de l’espace du cours.

Test du nouveau look, partie 2 (PR #23, aucune base de données à refaire) :

1. **Catalogue** : les cours sont des cartes arrondies avec un bandeau vert clair, une étiquette
   (niveau ou espace) et le nombre de leçons.
2. Ouvrir un cours : grand titre, étiquette de niveau, boutons verts en relief, plan du cours.
3. **Accueil** → une carte d’espace (ex. Alphabétisation) : bandeau vert, puces de niveau et deux
   boutons.

Rappel, partie 1 (PR #22, déjà fusionnée) :

1. **Accueil** : titres arrondis (police Baloo), grand bouton vert « Commencer à apprendre »,
   puis quatre cartes **Choisis ton niveau** (École, Secondaire, Alphabétisation, Se former).
2. Cliquer **CP2** : le catalogue s’ouvre déjà filtré sur ce niveau.
3. Plus bas : **Cours à découvrir** (cartes avec bandeau vert clair) et **Comment ça marche ?**.
4. En haut, le menu est en « pilules » : la page en cours est sur fond vert clair.

## Étape 10 — Lancer les tests automatiques (facultatif, fenêtre n° 3)

Les tests utilisent leurs propres ports (3100, 4100 et 8190) et les bases `lenseignement_test` et
`lenseignement_e2e` : `pnpm dev` et Keycloak peuvent rester allumés.

Si votre PostgreSQL n’est pas sur le port 5432, indiquer d’abord les adresses des bases de test
dans cette fenêtre (exemple pour le port 5430) :

```powershell
$env:TEST_DATABASE_URL = "postgresql://lenseignement:change-me-dev-only@localhost:5430/lenseignement_test"
$env:E2E_DATABASE_URL = "postgresql://lenseignement:change-me-dev-only@localhost:5430/lenseignement_e2e"
```

Puis :

```powershell
cd C:\Projets\lenseignement
pnpm test
pnpm exec playwright install chromium   # une seule fois
pnpm test:e2e
```

Attendu : aucun test en échec (`135 passed` et `1 skipped` pour les tests E2E).

## Étape 11 — Valider et fusionner la PR sur GitHub

1. Ouvrir la PR (ex. https://github.com/Gohh/lenseignement/pull/3).
2. Onglet **Files changed** pour parcourir les modifications si vous le souhaitez.
3. Vérifier en bas que les contrôles sont verts (« All checks have passed »).
4. Cliquer sur **Merge pull request**, puis **Confirm merge**.
5. Sur votre PC, revenir sur la branche principale à jour :

   ```powershell
   git checkout main
   git pull
   ```

## Étape 12 — Tout arrêter

- Fenêtre n° 2 (application) : **Ctrl + C**.
- Fenêtre n° 1 (Keycloak) : **Ctrl + C**.

Votre PostgreSQL continue de tourner comme d’habitude. Les comptes Keycloak sont conservés dans
`C:\Outils\keycloak-26.8.1\data` pour la prochaine fois.

---

## Administrer les programmes (référentiels)

Un programme s’écrit dans un fichier JSON (modèles : `database/curricula/`). Il est d’abord
importé comme **brouillon**, invisible du public, puis **publié** avec une date d’effet. Une
version publiée ne peut plus être modifiée : pour corriger, on publie une nouvelle version.

```powershell
cd apps\api
node dist\db\cli.js curriculum:import C:\chemin\programme.json
node dist\db\cli.js curriculum:publish DEMO-PRIMAIRE 2027 2027-09-01
cd ..\..
```

Si le fichier contient une erreur (code en double, matière inconnue, prérequis en boucle…),
l’import est refusé et le message indique la ligne fautive.

## En cas de problème

| Symptôme                                                       | Solution                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm` n’est pas reconnu                                       | Refaire l’étape 1.5 dans un PowerShell administrateur, puis rouvrir PowerShell.                                                                   |
| `java` n’est pas reconnu                                       | Réinstaller Temurin 21 en cochant « Add to PATH » et « Set JAVA_HOME », puis rouvrir PowerShell.                                                  |
| Keycloak : « Address already in use » sur 8080                 | Un autre logiciel utilise le port 8080 : le fermer, ou nous le signaler. WAMP (ports 80 et 3306) ne gêne pas.                                     |
| La page de connexion ne s’ouvre pas                            | Keycloak démarre encore, ou sa fenêtre a été fermée : vérifier la fenêtre n° 1.                                                                   |
| Message `ECONNREFUSED 127.0.0.1:6379` dans la fenêtre n° 2     | Le fichier `.env` n’indique pas `SESSION_STORE=memory` : refaire les étapes 4 et 5, puis relancer `pnpm dev`.                                     |
| « Connexion impossible » après le mot de passe                 | La connexion a expiré (plus de 10 minutes) ou l’application a redémarré : cliquer sur « Réessayer ».                                              |
| Compte bloqué après plusieurs mots de passe faux               | Protection anti-bruteforce : attendre quelques minutes.                                                                                           |
| « Service momentanément indisponible » dans Mon espace         | L’API n’est pas démarrée : vérifier la fenêtre n° 2.                                                                                              |
| `ECONNREFUSED 127.0.0.1:5432` ou `database ... does not exist` | Vérifier le port et le nom de base dans la ligne `DATABASE_URL` du `.env` (étapes 3 et 5).                                                        |
| `relation "users" does not exist` dans la fenêtre n° 2         | Les tables ne sont pas créées : refaire l’étape 6, puis relancer `pnpm dev`.                                                                      |
| « Mes classes » n’apparaît pas pour `enseignant.demo`          | Keycloak a gardé l’ancienne configuration : voir la ligne « Le realm a changé » ci-dessous.                                                       |
| `password authentication failed for user "postgres"`           | Le mot de passe est celui choisi à l’installation de PostgreSQL ; s’il est perdu, utiliser pgAdmin ou nous le signaler.                           |
| Le realm `lenseignement` a changé dans une nouvelle PR         | Arrêter Keycloak, supprimer `C:\Outils\keycloak-26.8.1\data\h2`, recopier le fichier (étape 7.1) et redémarrer. Les comptes de démo sont recréés. |

## Variante avec Docker

Sur un poste où Docker Desktop est disponible, les étapes 1.3, 1.4, 5 et 7 sont remplacées par
`pnpm infra:up:sans-postgres` (Redis, MinIO et Keycloak dans Docker, PostgreSQL du poste), ou
`pnpm infra:up` si PostgreSQL n’est pas installé. `pnpm infra:down` arrête les conteneurs.
