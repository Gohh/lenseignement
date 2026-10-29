# Créer un compte : réglage unique dans Keycloak

La page **Équipe → « + Créer un compte »** crée la personne directement dans Keycloak, avec un mot de passe provisoire (à changer à la première connexion). Pour cela, la plateforme a besoin d'un « client de service » dans Keycloak : une clé qui n'a le droit que de gérer les comptes. On le règle une seule fois.

## 1. Créer le client de service dans Keycloak

1. Ouvre http://localhost:8080/admin et connecte-toi.
2. En haut à gauche, choisis le royaume **lenseignement**.
3. Menu de gauche : **Clients**, puis **Create client**.
4. Client type : _OpenID Connect_. Client ID : `lenseignement-admin`. Clique **Next**.
5. Active **Client authentication**. Dans « Authentication flow », décoche tout sauf **Service accounts roles**. Clique **Next**, puis **Save**.
6. Onglet **Credentials** : copie la valeur de **Client secret**.
7. Onglet **Service accounts roles** : clique **Assign role**, change le filtre en **Filter by clients**, cherche `manage-users`, coche la ligne du client **realm-management**, puis **Assign**. Refais-le pour `view-users` et `query-users`.

## 2. Donner la clé à la plateforme

1. Ouvre le fichier `.env` à la racine du projet (dans VS Code).
2. Ajoute (ou modifie) cette ligne, en collant la clé copiée à l'étape 6 :

   `KEYCLOAK_ADMIN_CLIENT_SECRET=la-clé-copiée`

3. Arrête `pnpm start` (Ctrl+C) puis relance-le.

## 3. Essayer

Connecte-toi en superadministrateur, ouvre **Équipe**, clique **+ Créer un compte**, remplis le formulaire. Le mot de passe provisoire s'affiche **une seule fois** : note-le et donne-le à la personne. À sa première connexion, Keycloak lui demande d'en choisir un nouveau.

## Si ça ne marche pas

- « La création de comptes n'est pas encore configurée » : la ligne du `.env` manque, ou `pnpm start` n'a pas été relancé.
- « Keycloak a refusé la connexion du client de service » : la clé collée n'est pas la bonne.
- « Le client de service n'a pas le droit » : refaire l'étape 7.
- « Un compte existe déjà avec cet e-mail » : la personne a déjà un compte ; utilise plutôt un code d'invitation.
