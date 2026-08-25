# L'éphémère — Bot Discord

Bot Discord en Node.js (même architecture qu’EdenBot) pour :

- **Modération** : `/ban`, `/unban`, `/warn`, `/unwarn`, `/analyse`
- **Présentations** : `/présentation` (assistant par étapes, comme Jardin d’Eden)
- **Tickets** : fils **privés** dans un salon `#ticket` (pas de nouveau salon à chaque ticket)

Couleurs des embeds :

- Sanctions (`ban`, `unban`, `warn`, `unwarn`) : `#ef233c`
- Autres (présentation, tickets, analyse) : `#f4acb7`

## Prérequis

- Node.js **20+**
- Un serveur Discord et un rôle dédié pour le staff du bot
- Intents dans le [Developer Portal](https://discord.com/developers/applications) :
  - Message Content (optionnel, pas requis pour les commandes slash)
  - **Server Members Intent** (recommandé : autocomplétion + `/analyse`)

## Installation

1. Installer les dépendances :
   ```bash
   npm install
   ```

2. Copier `.env.example` vers `.env` et remplir au minimum :
   - `DISCORD_TOKEN`
   - `ADMIN_ROLE_IDS` (IDs des rôles staff, séparés par des virgules)

3. Inviter le bot avec les permissions : *Bannir des membres*, *Envoyer des messages*, *Utiliser les commandes slash*, *Créer des fils privés*, *Gérer les fils*, *Envoyer des messages dans les fils*.

4. Lancer :
   ```bash
   npm start
   ```

En développement : `npm run dev`.

## Commandes

| Commande | Description |
|---|---|
| `/ban` | Bannit un utilisateur (`@membre` ou ID) + **raison** obligatoire. MP au banni. |
| `/unban` | Débannit par ID + **raison** obligatoire. |
| `/warn` | Enregistre un avertissement + **raison**. Les raccourcis (`Fake`, `Menace`…) sont développés comme sur EdenBot. |
| `/unwarn` | Liste les warns, **raison** du retrait, puis menu pour choisir lequel retirer. |
| `/analyse` | Groupes de pseudos similaires (Jaro-Winkler, seuil 92 %). |
| `/présentation` | Assistant Identité / Apparence / À propos, publication en embed. |
| `/ticket-panel` | Poster le panneau d’ouverture de tickets dans le salon courant (staff). |

## Tickets (threads privés)

Contrairement à DraftBot (qui crée un **salon**), le bot ouvre un **fil privé** dans le salon où le panneau a été posté (ex. `#📥 · ticket`).

1. Un staff lance `/ticket-panel` dans `#ticket`.
2. Le membre choisit **Signalement**, **Aide** ou **Question**, puis indique un **sujet**.
3. Un fil `Signalement-pseudo` (ou `Aide-…` / `Question-…`) est créé, le membre y est ajouté, le staff est pingé.
4. Boutons **Revendiquer** (staff) et **Fermer** (staff ou auteur) — le fil est ensuite verrouillé et archivé.

Le staff doit avoir **Gérer les fils** sur le salon `#ticket` pour voir tous les fils privés. Renseigne `TICKET_STAFF_ROLE_IDS` pour les pings à l’ouverture.

Un membre ne peut avoir **qu’un ticket ouvert** à la fois.

## Base de données

- Sans `MONGODB_URI` : SQLite dans `data/ephemere.db`
- Avec `MONGODB_URI` : MongoDB (hébergement persistant)

## Structure

```
src/
  index.js
  config.js
  database.js / databaseSqlite.js / databaseMongo.js
  embeds.js / permissions.js / validation.js / rateLimit.js
  commands/
    moderation.js
    presentation.js
    tickets.js
```
