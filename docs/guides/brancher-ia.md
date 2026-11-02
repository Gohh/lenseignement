# Mémo : brancher l'IA dans L'Enseignement

L'IA aide les enseignants à **proposer** des exercices dans la Fabrique. Elle est **éteinte
par défaut**. Seul le superadministrateur peut l'allumer, choisir le fournisseur et coller la clé.

## Ce que l'IA reçoit, et ce qu'elle ne reçoit jamais

- Elle reçoit : le programme, la matière, le niveau, la compétence (code et intitulé), le
  domaine, la difficulté, le type d'exercice et les précisions écrites par l'enseignant.
- Elle ne reçoit jamais : un nom d'élève, une note, une réponse, une classe.
- Ce qu'elle propose arrive **en brouillon**. L'enseignant relit et corrige, puis l'exercice
  passe par la relecture habituelle avant d'être publié.

## Quel fournisseur choisir

| Fournisseur            | Prix                       | Pour qui                                                         |
| ---------------------- | -------------------------- | ---------------------------------------------------------------- |
| Mistral AI (française) | Payant à l'usage, peu cher | Le plus simple pour commencer                                    |
| Claude (Anthropic)     | Payant à l'usage           | Très bon en français et pour suivre le format                    |
| ChatGPT (OpenAI)       | Payant à l'usage           | Si vous avez déjà un compte                                      |
| Modèle libre (Ollama)  | Gratuit                    | Si le serveur a au moins 16 Go de mémoire et 4 cœurs ; plus lent |

L'abonnement Claude Code (ou ChatGPT Plus) **ne sert pas** ici : la plateforme a besoin d'une
**clé d'API**, payée à l'usage, différente d'un abonnement.

## Étapes (fournisseur payant)

1. Créez un compte sur le site du fournisseur :
   - Mistral : console.mistral.ai
   - Claude : console.anthropic.com
   - ChatGPT : platform.openai.com
2. Ajoutez un petit crédit (quelques euros suffisent pour des centaines d'exercices).
3. Créez une **clé d'API** (« API key ») et copiez-la. Elle ne s'affiche qu'une fois.
4. Dans L'Enseignement : **Administration > Intelligence artificielle**.
5. Choisissez le fournisseur, collez la clé, cochez **Allumer l'IA**, puis **Enregistrer**.
6. Cliquez sur **Essayer la connexion**. Un message « Connexion réussie » confirme.
7. Réglez la **limite par jour** (30 par défaut) pour éviter une facture surprise.

## Étapes (modèle libre, gratuit)

1. Sur le serveur, installez Ollama (ollama.com), puis un modèle, par exemple :
   `ollama pull qwen2.5:7b`
2. Dans **Administration > Intelligence artificielle** : choisissez « Modèle libre », ouvrez
   **Réglages avancés**, écrivez le nom du modèle (`qwen2.5:7b`) et l'adresse
   `http://localhost:11434/v1`. Pas de clé.
3. Cochez **Allumer l'IA**, **Enregistrer**, puis **Essayer la connexion**.

## Utiliser l'IA (enseignants)

Fabrique d'exercices > **Proposer avec l'IA** : choisir la compétence, le domaine, la
difficulté, le type et le nombre (1 à 5), écrire des précisions sans nom d'élève, puis
**Proposer les exercices**. Les propositions s'ouvrent en brouillon pour être relues.

## Sécurité

- La clé est **chiffrée** dans la base. Elle ne s'affiche plus jamais : seuls ses 4 derniers
  caractères restent visibles.
- Le chiffrement utilise `AI_KEY_SECRET` du fichier `.env` (à défaut, le secret Keycloak). Si ce
  secret change, recollez la clé.
- Pour tout arrêter : décochez **Allumer l'IA** et enregistrez. Pour effacer la clé : cochez
  « Effacer la clé enregistrée ».
- Chaque demande est notée au journal des actions (`exercise.ai`).
