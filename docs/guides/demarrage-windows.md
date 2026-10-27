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

> À ce stade (ticket 5), l’application n’écrit encore rien dans PostgreSQL : les premières
> tables arriveront avec les tickets 6 et 7.

## Étape 4 — Récupérer la version à tester (fenêtre n° 2)

Chaque PR a une branche. **À faire avant le fichier `.env`** : certains réglages n’existent que
dans la branche de la PR. Pour la PR #1 (ticket 5) :

```powershell
cd C:\Projets\lenseignement
git fetch origin
git checkout feat/ticket-5-auth-oidc
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

Enregistrer et fermer. (Sans Redis, les sessions sont gardées en mémoire : vous serez
simplement déconnecté à chaque redémarrage de l’application. Ce mode est refusé en production.)

## Étape 6 — Démarrer Keycloak (fenêtre PowerShell n° 1)

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

## Étape 7 — Lancer l’application (fenêtre n° 2)

```powershell
pnpm dev
```

Laissez cette fenêtre ouverte. Attendu : les lignes `Ready` (site) et
`Found 0 errors. Watching for file changes.` (API).

## Étape 8 — Tester dans le navigateur

1. Ouvrir http://localhost:3000 : la page d’accueil s’affiche avec « Que voulez-vous faire ? ».
2. Cliquer sur **Mon espace** (en haut à droite) : vous arrivez sur la page de connexion Keycloak.
3. Se connecter avec `apprenant.demo` / `Demo-lenseignement-2026` (compte **fictif**).
4. Attendu : « **Bonjour, Awa** », le profil « Apprenant » et la phrase
   « **Compte reconnu par le service.** » (preuve que l’API a vérifié votre jeton).
5. Cliquer sur **Se déconnecter** : retour à l’accueil. Recliquer sur « Mon espace » doit
   redemander le mot de passe.
6. Facultatif : http://localhost:4000/api/v1/health doit afficher `"status":"ok"`, et
   http://localhost:4000/api/v1/me doit répondre **401** (accès refusé sans connexion, c’est voulu).

Autres comptes fictifs (même mot de passe) : `enseignant.demo`, `referent.demo`,
`admin.demo` (ce dernier demande de configurer une application d’authentification, comme
Google Authenticator, à la première connexion).

## Étape 9 — Lancer les tests automatiques (facultatif, fenêtre n° 3)

Arrêter d’abord `pnpm dev` (**Ctrl + C** dans la fenêtre n° 2) : les tests utilisent les mêmes
ports. Keycloak peut rester allumé, les tests ne l’utilisent pas.

```powershell
cd C:\Projets\lenseignement
pnpm test
pnpm exec playwright install chromium   # une seule fois
pnpm test:e2e
```

Attendu : aucun test en échec (`24 passed` pour les tests E2E de la PR #1).

## Étape 10 — Valider et fusionner la PR sur GitHub

1. Ouvrir la PR (ex. https://github.com/Gohh/lenseignement/pull/1).
2. Onglet **Files changed** pour parcourir les modifications si vous le souhaitez.
3. Vérifier en bas que les contrôles sont verts (« All checks have passed »).
4. Cliquer sur **Merge pull request**, puis **Confirm merge**.
5. Sur votre PC, revenir sur la branche principale à jour :

   ```powershell
   git checkout main
   git pull
   ```

## Étape 11 — Tout arrêter

- Fenêtre n° 2 (application) : **Ctrl + C**.
- Fenêtre n° 1 (Keycloak) : **Ctrl + C**.

Votre PostgreSQL continue de tourner comme d’habitude. Les comptes Keycloak sont conservés dans
`C:\Outils\keycloak-26.8.1\data` pour la prochaine fois.

---

## En cas de problème

| Symptôme                                                   | Solution                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm` n’est pas reconnu                                   | Refaire l’étape 1.5 dans un PowerShell administrateur, puis rouvrir PowerShell.                                                                   |
| `java` n’est pas reconnu                                   | Réinstaller Temurin 21 en cochant « Add to PATH » et « Set JAVA_HOME », puis rouvrir PowerShell.                                                  |
| Keycloak : « Address already in use » sur 8080             | Un autre logiciel utilise le port 8080 : le fermer, ou nous le signaler. WAMP (ports 80 et 3306) ne gêne pas.                                     |
| La page de connexion ne s’ouvre pas                        | Keycloak démarre encore, ou sa fenêtre a été fermée : vérifier la fenêtre n° 1.                                                                   |
| Message `ECONNREFUSED 127.0.0.1:6379` dans la fenêtre n° 2 | Le fichier `.env` n’indique pas `SESSION_STORE=memory` : refaire les étapes 4 et 5, puis relancer `pnpm dev`.                                     |
| « Connexion impossible » après le mot de passe             | La connexion a expiré (plus de 10 minutes) ou l’application a redémarré : cliquer sur « Réessayer ».                                              |
| Compte bloqué après plusieurs mots de passe faux           | Protection anti-bruteforce : attendre quelques minutes.                                                                                           |
| « Service momentanément indisponible » dans Mon espace     | L’API n’est pas démarrée : vérifier la fenêtre n° 2.                                                                                              |
| `password authentication failed for user "postgres"`       | Le mot de passe est celui choisi à l’installation de PostgreSQL ; s’il est perdu, utiliser pgAdmin ou nous le signaler.                           |
| Le realm `lenseignement` a changé dans une nouvelle PR     | Arrêter Keycloak, supprimer `C:\Outils\keycloak-26.8.1\data\h2`, recopier le fichier (étape 6.1) et redémarrer. Les comptes de démo sont recréés. |

## Variante avec Docker

Sur un poste où Docker Desktop est disponible, les étapes 1.3, 1.4, 5 et 6 sont remplacées par
`pnpm infra:up:sans-postgres` (Redis, MinIO et Keycloak dans Docker, PostgreSQL du poste), ou
`pnpm infra:up` si PostgreSQL n’est pas installé. `pnpm infra:down` arrête les conteneurs.
