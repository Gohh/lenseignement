# Guide pas à pas — lancer et tester L’Enseignement sous Windows

Ce guide sert à tester une PR sur votre PC avant de la fusionner. Il est écrit pour Windows 10/11
avec **PowerShell**. Comptez environ 30 minutes la première fois (installations), puis 5 minutes.

---

## Étape 1 — Installer les outils (une seule fois)

1. **Git pour Windows** : https://git-scm.com/download/win — installer avec les options par défaut.
2. **Node.js 22 LTS** : https://nodejs.org — choisir la version **22 LTS**, options par défaut.
3. **Docker Desktop** : https://www.docker.com/products/docker-desktop — accepter l’option
   **WSL 2**. Redémarrer le PC si demandé, puis lancer Docker Desktop et attendre que l’icône
   de la baleine indique « Engine running ».
4. Ouvrir **PowerShell en administrateur** (clic droit sur le menu Démarrer → « Terminal
   (administrateur) ») et taper :

   ```powershell
   corepack enable
   corepack prepare pnpm@10.28.0 --activate
   ```

5. Fermer cette fenêtre, ouvrir un PowerShell **normal** et vérifier :

   ```powershell
   node -v      # doit afficher v22.x
   pnpm -v      # doit afficher 10.28.0
   docker -v    # doit afficher une version de Docker
   ```

## Étape 2 — Récupérer le code (une seule fois)

```powershell
mkdir C:\Projets -Force
cd C:\Projets
git clone https://github.com/Gohh/lenseignement.git
cd lenseignement
```

> Évitez `C:\wamp64\www` : ce projet ne passe pas par Apache, il a ses propres serveurs.

## Étape 3 — Se placer sur la branche de la PR à tester

Chaque PR a une branche. Pour la PR #1 (ticket 5) :

```powershell
cd C:\Projets\lenseignement
git fetch origin
git checkout feat/ticket-5-auth-oidc
git pull
```

## Étape 4 — Installer les dépendances et compiler

```powershell
pnpm install
pnpm build
```

Attendu : la dernière ligne indique `Tasks: 4 successful, 4 total`.

> Le fichier `.env` est facultatif en local : les valeurs par défaut correspondent déjà à
> `docker-compose.yml`. Pour les modifier : `Copy-Item .env.example .env`.

## Étape 5 — Démarrer la base de données, Redis et Keycloak

Docker Desktop doit être ouvert. Deux possibilités pour PostgreSQL :

### Cas A — PostgreSQL est déjà installé sur votre PC (votre cas)

Votre PostgreSQL utilise déjà le port 5432 : on ne démarre donc **pas** celui de Docker.

1. Vérifier la version (14 ou plus récente recommandée). Si `psql` n’est pas reconnu, utiliser
   « SQL Shell (psql) » dans le menu Démarrer, ou le chemin complet, par exemple
   `& "C:\Program Files\PostgreSQL\17\bin\psql.exe"` (adapter le numéro de version).

   ```powershell
   psql --version
   ```

2. Créer l’utilisateur et la base du projet (**une seule fois**). Le mot de passe demandé est
   celui du compte `postgres` choisi à l’installation de PostgreSQL :

   ```powershell
   psql -U postgres -c "CREATE ROLE lenseignement LOGIN PASSWORD 'change-me-dev-only';"
   psql -U postgres -c "CREATE DATABASE lenseignement OWNER lenseignement ENCODING 'UTF8';"
   psql -U postgres -d lenseignement -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   ```

   Attendu : `CREATE ROLE`, `CREATE DATABASE`, puis `CREATE EXTENSION`.
   Vous pouvez aussi le faire dans **pgAdmin** si vous préférez l’interface graphique.

3. Démarrer les autres services avec Docker :

   ```powershell
   pnpm infra:up:sans-postgres
   docker compose ps
   ```

   Attendu : `redis`, `minio` et `keycloak` en état `running`.

> Ce mot de passe `change-me-dev-only` ne sert qu’en local. Si vous en choisissez un autre,
> copiez `.env.example` en `.env` (`Copy-Item .env.example .env`) et mettez-le dans
> `DATABASE_URL`.

### Cas B — pas de PostgreSQL installé

```powershell
pnpm infra:up
docker compose ps
```

Attendu : `postgres`, `redis`, `minio` et `keycloak` en état `running` (ou `healthy`).

### Dans les deux cas

**Keycloak met 30 à 60 secondes à démarrer** la première fois : ouvrez http://localhost:8080
jusqu’à voir la page d’accueil de Keycloak.

> À ce stade (ticket 5), l’application n’écrit encore rien dans PostgreSQL : les premières
> tables arriveront avec les tickets 6 et 7. Cette étape prépare la base pour la suite.

## Étape 6 — Lancer l’application

```powershell
pnpm dev
```

Laissez cette fenêtre ouverte. Attendu : les lignes `Ready` (site) et
`Found 0 errors. Watching for file changes.` (API).

## Étape 7 — Tester dans le navigateur

1. Ouvrir http://localhost:3000 : la page d’accueil s’affiche avec « Que voulez-vous faire ? ».
2. Cliquer sur **Mon espace** (en haut à droite) : vous arrivez sur la page de connexion Keycloak.
3. Se connecter avec `apprenant.demo` / `Demo-lenseignement-2026` (compte **fictif**).
4. Attendu : « **Bonjour, Awa** », le profil « Apprenant » et la phrase
   « **Compte reconnu par le service.** » (preuve que l’API a vérifié votre jeton).
5. Cliquer sur **Se déconnecter** : retour à l’accueil. Recliquer sur « Mon espace » doit
   redemander le mot de passe.
6. Facultatif : vérifier l’API directement : http://localhost:4000/api/v1/health doit afficher
   `"status":"ok"`, et http://localhost:4000/api/v1/me doit répondre **401** (accès refusé sans
   connexion, c’est voulu).

Autres comptes fictifs (même mot de passe) : `enseignant.demo`, `referent.demo`,
`admin.demo` (ce dernier demande de configurer une application d’authentification, comme
Google Authenticator, à la première connexion).

## Étape 8 — Lancer les tests automatiques (facultatif)

Arrêter d’abord `pnpm dev` avec **Ctrl + C** (les tests utilisent les mêmes ports).

```powershell
pnpm test
pnpm exec playwright install chromium   # une seule fois
pnpm test:e2e
```

Attendu : aucun test en échec (`24 passed` pour les tests E2E de la PR #1).

## Étape 9 — Valider et fusionner la PR sur GitHub

1. Ouvrir la PR (ex. https://github.com/Gohh/lenseignement/pull/1).
2. Onglet **Files changed** pour parcourir les modifications si vous le souhaitez.
3. Vérifier en bas que les contrôles sont verts (« All checks have passed »).
4. Cliquer sur **Merge pull request**, puis **Confirm merge**.
5. Sur votre PC, revenir sur la branche principale à jour :

   ```powershell
   git checkout main
   git pull
   ```

## Étape 10 — Tout arrêter

```powershell
# dans la fenêtre de pnpm dev : Ctrl + C
pnpm infra:down
```

Votre PostgreSQL installé (cas A) continue de tourner comme d’habitude : il n’est pas géré
par Docker.

Vos données locales (base, comptes Keycloak) sont conservées pour la prochaine fois.

---

## En cas de problème

| Symptôme                                               | Solution                                                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm` n’est pas reconnu                               | Refaire l’étape 1.4 dans un PowerShell administrateur, puis rouvrir PowerShell.                                                                                      |
| `docker` : « cannot connect » / « pipe »               | Docker Desktop n’est pas démarré : l’ouvrir et attendre « Engine running ».                                                                                          |
| « port is already allocated » sur 5432                 | Votre PostgreSQL installé utilise ce port : utiliser `pnpm infra:up:sans-postgres` (cas A de l’étape 5), puis `pnpm infra:down` si un conteneur postgres a été créé. |
| « port is already allocated » (6379, 8080, 9000)       | Un autre logiciel utilise ce port. WAMP (ports 80 et 3306) ne gêne pas. Fermer l’autre logiciel ou nous le signaler.                                                 |
| `password authentication failed for user "postgres"`   | Le mot de passe est celui choisi à l’installation de PostgreSQL ; s’il est perdu, utiliser pgAdmin ou nous le signaler.                                              |
| La page de connexion ne s’ouvre pas                    | Keycloak démarre encore : attendre une minute et réessayer http://localhost:8080.                                                                                    |
| « Connexion impossible » après le mot de passe         | La connexion a expiré (plus de 10 minutes) : cliquer sur « Réessayer ».                                                                                              |
| Compte bloqué après plusieurs mots de passe faux       | Protection anti-bruteforce : attendre quelques minutes.                                                                                                              |
| « Service momentanément indisponible » dans Mon espace | L’API n’est pas démarrée : vérifier la fenêtre `pnpm dev`.                                                                                                           |
