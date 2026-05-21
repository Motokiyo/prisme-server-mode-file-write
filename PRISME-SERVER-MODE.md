# Prisme Server Mode — édition web sécurisée d'un workspace

Contribution proposée à Prisme Workspace (fork de `prismeworkspace`, base `647b032` de la branche `dev`).

Objectif : pouvoir lire et éditer les fichiers d'un workspace (notes, docs) depuis un navigateur, y compris sur mobile, sans dépendre du wrapper Electron desktop. Aujourd'hui l'app web Prisme sait piloter une session opencode mais l'autosave Markdown passe uniquement par `platform.writeTextFile` (fourni par Electron). Cette contribution ajoute la brique manquante côté serveur, puis branche l'app web dessus.

Tout est en lecture/écriture cadrée au workspace, pensé pour un déploiement self-hosted derrière un réseau privé.

## Ce que ça apporte

| Domaine | Apport |
|---|---|
| Backend opencode | Route `PUT /file/content` : écriture sécurisée de fichiers Markdown existants |
| Backend opencode | `file.read` ne tronque plus le contenu (`.trim()` retiré) et renvoie `etag`/`mtimeMs`/`bytes` |
| Backend opencode | `file.read` sert les PDF en base64 (lecture seule, plafond 25 Mo) pour le visualiseur |
| App web | `FileEditor` sauvegarde via le SDK quand l'IPC Electron est absent (fallback web) |
| App web | Layout mobile responsive : vues Files / Edit / Chat, éditeur plein écran sous 768 px |
| App web | Les fichiers cités dans les réponses de l'assistant deviennent cliquables (ouverture dans le visualiseur, cadré au workspace) |

## Les commits (sur `647b032`)

```
4a5ed88 feat(file): secure server-side markdown write with hardened safety + parity fixes
31341cd refactor: simplify file write metadata read and editor save guards
8b8c0e8 feat(app): mobile Files/Edit/Chat layout for web editing
3021243 refactor: simplify mobile session layout
0d039dd fix(app): reach mobile Files without an active session
bc5e506 feat(file): serve PDF files as base64 for preview (size-capped, read-only)
0b4e19c feat(app): persist self-hosted server credentials across reloads
449c7fb chore(app): gate dev perf HUD behind localStorage flag for self-hosted trial
4fe556c feat(app): open files referenced in chat messages (workspace-scoped)
```

Chaque commit est autonome et reviewé. Le commit `449c7fb` est spécifique au self-hosted (il masque le HUD de perfs du mode dev) et peut être ignoré en amont.

## API backend

```http
PUT /file/content
Authorization: Basic ...
Content-Type: application/json

{ "path": "notes/journal.md", "content": "...", "etag": "<sha256 lu via GET>" }
```

Réponse `200` :

```json
{ "ok": true, "etag": "...", "mtimeMs": 1779000000000, "bytes": 1234 }
```

Codes d'erreur, identiques sur les deux surfaces (route Hono legacy et HttpApi) :

| Code | Cas |
|---|---|
| `400` | payload invalide, chemin invalide, extension non autorisée |
| `401` | auth absente ou invalide (si le serveur a un mot de passe) |
| `403` | hors workspace, symlink, segment caché |
| `409` | `etag` périmé (le fichier a changé depuis la lecture) |
| `413` | contenu trop gros |

## Garanties de sécurité (écriture)

- Fichiers `.md` existants uniquement (pas de création, pas de dossiers, pas d'autres extensions au premier jalon).
- Refus des chemins absolus, de `..`, des null bytes, des backslash, et de tout segment caché.
- Refus des symlinks (fichier et dossier), vérifiés segment par segment, plus `realpath` du parent, plus un `lstat` final juste avant le `rename` (réduction de la fenêtre TOCTOU à quelques microsecondes).
- Écriture atomique : fichier temporaire exclusif dans le même dossier, `fsync`, `rename`, nettoyage du temporaire en cas d'échec.
- Préservation des permissions du fichier existant.
- Détection de conflit par `etag` (SHA-256), réponse `409` sans écraser.
- Plafond de taille (1 Mo en écriture, 25 Mo en lecture PDF).
- La capability d'écriture est protégée par l'auth serveur dès qu'un mot de passe est configuré (testé : `PUT` sans identifiants renvoie `401`).

## Vérification

- Tests opencode (`packages/opencode`) : 208 passés. Couvrent l'écriture nominale, le refus `/etc/passwd`, `../`, `.env`, segment caché, backslash, null byte, fichier inexistant, symlink fichier et symlink dossier (avec assertion de non-modification de la cible), conflit `409`, dépassement `413`, et auth requise sur le `PUT`.
- Tests app (`packages/app`) : 339 passés. Tests ui de détection des références fichier : 13 passés (rejet de `..`, `/etc/x`, `C:/x`, `~/x`, `file://`, `https://`).
- `typecheck` vert sur `opencode`, `app`, `ui`, `sdk`.
- Audit sécurité dédié : scan secrets propre, écriture durcie, chaîne de linkification verrouillée à trois niveaux (détection, re-classification au clic anti-tampering DOM, re-contrôle anti-traversal avant ouverture). Le rendu Markdown des messages passe par `DOMPurify`.

## Points à connaître pour une intégration

1. Persistance des identifiants : pour le confort self-hosted, le commit `0b4e19c` mémorise les identifiants serveur dans le `localStorage` du navigateur (pour ne pas redemander l'auth à chaque rechargement). C'est un compromis assumé en mono-utilisateur, à ne pas utiliser sur un navigateur partagé. À documenter ou à rendre optionnel selon la posture amont.
2. Fenêtre TOCTOU résiduelle : la course entre le `lstat` final et le `rename` ne se ferme complètement qu'avec `renameat2` (Linux). Elle est documentée dans le code et négligeable hors d'un attaquant local concurrent.
3. Posture d'auth : opencode n'exige une authentification que si un mot de passe est configuré. Ce comportement est celui d'opencode, non modifié ici. Au-delà du mono-utilisateur, configurer `OPENCODE_SERVER_PASSWORD`.
4. App web en production : `getCurrentUrl` utilise `location.origin` en build de production. Un déploiement web sépare donc soit le backend en même origine (reverse-proxy), soit utilise le mode dev avec `VITE_OPENCODE_SERVER_HOST/PORT`. À cadrer côté packaging amont.

## Déploiement de référence

Dans notre installation self-hosted, le serveur opencode et l'app web sont liés à un **réseau privé Tailscale** et protégés par mot de passe. C'est Tailscale qui garde l'accès au workspace privé : le service n'est pas exposé publiquement, seuls les appareils du réseau privé l'atteignent. L'écriture reste cadrée aux `.md`, derrière l'auth. C'est ce qui rend l'usage mobile sûr sans surface publique.

## Essayer

```bash
# backend (depuis packages/opencode)
OPENCODE_SERVER_PASSWORD=... bun run --conditions=browser ./src/index.ts serve --hostname 127.0.0.1 --port 4096

# app web en dev (depuis la racine)
VITE_OPENCODE_SERVER_HOST=127.0.0.1 VITE_OPENCODE_SERVER_PORT=4096 bun run dev:web
```

Ouvrir un projet, ouvrir une note `.md`, l'éditer : la sauvegarde passe par `PUT /file/content`. Ouvrir un `.pdf` : il s'affiche via le visualiseur. Citer un fichier dans le chat : il devient cliquable.

Cordialement,
Alexandre
