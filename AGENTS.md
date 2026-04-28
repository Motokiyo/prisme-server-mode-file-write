# Prisme

Interface desktop user-friendly basée sur opencode. Fork du frontend desktop d'opencode (Tauri + SolidJS), repensé pour un usage grand public orienté chat IA + édition de notes, sans le côté éditeur de code.

Le backend reste **opencode** officiel : bundlé dans l'app au build (sidecar Tauri) ou attendu sur le PATH en dev.

---

## Architecture

```
prismeworkspace/
├── packages/
│   ├── desktop/              # Wrapper Tauri 2 (point d'entrée macOS / Windows / Linux)
│   │   ├── src/              # TypeScript Vite (bootstrap, menu natif, deep links)
│   │   ├── src-tauri/        # Rust (commandes natives, voice cpal, sidecar)
│   │   └── scripts/predev.ts # Copie le binaire opencode local dans src-tauri/sidecars/
│   ├── app/                  # Frontend SolidJS (logique applicative, contexts, pages)
│   ├── ui/                   # Composants UI partagés (boutons, dialogs, logo, thème)
│   ├── sdk/js/               # Client API et types TypeScript pour parler à opencode
│   └── core/                 # Utilitaires partagés (path, encode, retry, array, binary)
├── patches/                  # Patches pnpm (solid-js)
├── package.json              # Workspace root (Bun + Turbo)
├── turbo.json                # Tasks typecheck / build
└── README.md
```

5 packages stricts. Le reste du monorepo upstream (console, web, opencode CLI, plugin, slack, etc.) a été retiré.

---

## Stack

| Couche | Tech |
|---|---|
| UI | SolidJS 1.9.10 (réactif, pas de Virtual DOM) |
| Bundler | Vite 7 |
| Desktop | Tauri 2 (Rust + WKWebView macOS / WebView2 Windows / WebKitGTK Linux) |
| Style | Tailwind CSS 4 + CSS modules |
| State | Solid stores + contexts |
| Routing | @solidjs/router |
| Markdown editor | Tiptap v3 (StarterKit + Link, Image, Tables, tiptap-markdown) |
| Filesystem | @tauri-apps/plugin-fs (lecture/écriture workspace) |
| Audio | cpal côté Rust (CoreAudio sur macOS) |
| Package manager | Bun 1.3.13 |
| Build orchestrator | Turbo 2 |

---

## Commands

```bash
bun install                                  # à la racine
cd packages/desktop && bun tauri dev         # dev avec HMR Vite + hot Rust
bun turbo typecheck                          # vérifier les 5 packages
cd packages/desktop && bun tauri build       # produit Prisme.app + Prisme.dmg
```

Alias shell pratique (zsh) :
```bash
prismeapp                # tue les anciens process et lance bun tauri dev en background
```

---

## Distribution

**Build prod** : `cd packages/desktop && bun tauri build`
Sortie : `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Prisme_X.Y.Z_aarch64.dmg`

Le client télécharge le `.dmg`, drag dans `/Applications`, lance `Prisme`. Le binaire opencode-cli est bundlé via le sidecar Tauri (`tauri.conf.json` `externalBin: ["sidecars/opencode-cli"]`), donc aucun pré-requis côté client.

À régler avant distribution publique :
1. Apple Developer ID + notarization (sinon "Cannot be opened" au premier lancement)
2. `NSMicrophoneUsageDescription` dans `tauri.conf.json` `infoPlist` pour un message custom à la demande micro
3. Auto-updates via `tauri-plugin-updater` (clé Tauri + endpoint GitHub Releases)

---

## Backend opencode

Le binaire opencode officiel sert de backend. Au dev, le predev copie `/opt/homebrew/bin/opencode` (ou ce qui est sur le PATH) dans `src-tauri/sidecars/opencode-cli-<target>`. Au runtime, Tauri spawn ce sidecar sur un port aléatoire localhost et le frontend s'y connecte via le SDK.

Pour mettre à jour : `brew upgrade opencode` puis relance `bun tauri dev`.

---

## Stratégie de merge upstream

Modèle deux branches recommandé :
- `main` (ou `dev`) suit `upstream/dev` (sst/opencode)
- branche perso pour les changements Prisme

```bash
git remote add upstream https://github.com/sst/opencode.git
git fetch upstream
git merge upstream/dev
```

Zones de friction prévues :
- `packages/app/src/pages/session.tsx` (suppression diff viewer)
- `packages/app/src/context/layout.tsx` (panel state, voice flag)
- `packages/app/src/pages/session/use-session-commands.tsx` (raccourcis remappés)
- `packages/app/src/pages/session/session-side-panel.tsx` (tabs review supprimés)
- `packages/desktop/src-tauri/src/lib.rs` (commandes voice ajoutées)

Zones safe (fichiers neufs, jamais en conflit) :
- `packages/app/src/components/markdown-editor.tsx`, `markdown-editor.css`
- `packages/app/src/components/file-editor.tsx`
- `packages/app/src/components/prompt-input/microphone.tsx`
- `packages/app/src/utils/panels.ts`
- `packages/desktop/src-tauri/src/voice.rs`
- `packages/desktop/src-tauri/prisme-icon.svg`

---

## Changelog (chronologique)

### 2026-04-28

**Setup et fork**
- Fork de sst/opencode → EliottMeunierFluid/prismeworkspace, branche `dev`
- Clone local dans `~/Documents/CODE/prismeworkspace`

**Épuration massive**
- Suppression de 14 packages : `console`, `containers`, `desktop-electron`, `docs`, `enterprise`, `extensions`, `function`, `identity`, `opencode`, `plugin`, `script`, `slack`, `storybook`, `web`
- Suppression sub-packages `sdk/openapi.json`, `sdk/js/example`, `sdk/js/script`
- Suppression à la racine : tous les README localisés, `flake.*`, `nix/`, `infra/`, `github/`, `sdks/`, `specs/`, `script/`, `sst.config.ts`, `sst-env.d.ts`, `.opencode/`, `.husky/`, 3 patches inutiles
- Réécriture de `predev.ts` pour utiliser le binaire opencode local au lieu de builder depuis les sources supprimées
- `package.json` racine renommé `prisme-desktop`, postinstall + scripts non utilisés retirés
- `turbo.json` épuré (juste typecheck + build)
- `packages/core/package.json` réduit à zéro deps externes (5 utils standalone)
- ~678 000 deletions, 5 packages restants : `desktop`, `app`, `ui`, `sdk/js`, `core`
- bun install passe (1044 packages au lieu de plusieurs milliers), typecheck OK
- Vite démarre en 1.4s

**Rebrand Prisme**
- `tauri.conf.json` : productName, identifier, mainBinaryName, deep-link scheme = `prisme`
- Logo SVG (Mark + Splash) remplacé par triangle Prisme dans `packages/ui/src/components/logo.tsx`
- Logo wordmark = `<Mark /> + texte "Prisme"`
- Icônes Tauri régénérées via `bun tauri icon prisme-icon.svg` pour `dev/`, `beta/`, `prod/`
- Title de la fenêtre native = "Prisme" dans `windows.rs`
- 198 fichiers touchés : OpenCode → Prisme dans tous les i18n (16 langues), theme schema, webmanifest

**Suppression UI diff viewer (review)**
- Premier passage : masquage des onglets `changes` et `review`
- Deuxième passage : suppression complète des fichiers `session-review.tsx` (650 LOC), `review-tab.tsx` (170 LOC) + nettoyage des imports/usages dans `session.tsx` (block `createGit`, `reviewEmpty`, `reviewContent`, `reviewPanel` remplacés par stubs). 916 deletions

**Markdown editor (Tiptap)**
- Install : `@tiptap/core`, `starter-kit`, `link`, `image`, `table` extensions, `tiptap-markdown`
- Composant `markdown-editor.tsx` avec toolbar : H1-H3, gras, italique, strike, code, listes, tasks, quote, code block, link, image, table, hr, undo/redo
- Wrapper `file-editor.tsx` qui dispatche selon extension : `.md`/`.mdx`/`.markdown` → MarkdownEditor, sinon textarea plain text
- Sauvegarde sur disque via `@tauri-apps/plugin-fs` `writeTextFile` debounced 800ms
- Plugin Tauri FS ajouté à `Cargo.toml` + permissions dans `capabilities/default.json`
- Wiré dans `FileTabContent` à la place du fileComponent read-only
- Bug initial : `solid-tiptap` recréait l'éditeur à chaque keystroke (curseur sautait au sommet). Réécrit avec `new Editor()` dans `onMount` + `untrack(initialContent)` + `<Show keyed>` pour remount uniquement sur changement de path

**Multi-window panels**
- Approche : nouvelle fenêtre Tauri au lieu de split in-window
- `utils/panels.ts` : `openNewPanel(direction)` ouvre une WebviewWindow décalée à droite (vertical) ou en bas (horizontal). `closeCurrentPanel()` ferme la fenêtre active
- Commands : `panel.split.vertical`, `panel.split.horizontal`, `panel.close`
- Raccourcis : Cmd+E (split right), Cmd+Shift+E (split down). Cmd+D et Cmd+J avaient été essayés mais étaient avalés par macOS / WebView défauts
- Remap : ancien `tab.close` Cmd+W → Cmd+Alt+W. Ancien `model.variant.cycle` Cmd+Shift+D → Cmd+Alt+M
- Menu Tauri natif (`menu.ts`) intercepte Cmd+E et Cmd+Shift+E
- Capabilities : `core:webview:allow-create-webview-window`, `core:window:allow-create`, `core:window:allow-outer-position`, etc.

**Terminal en option**
- Default `settings.general.showTerminal = false`
- `<TerminalPanel />` wrappé dans `<Show when={settings.general.showTerminal()}>`
- Bouton terminal du header conditionnel à `settings.general.showTerminal()`
- Le toggle existe déjà dans Settings → General

**Settings → Shortcuts**
- Nouveau groupe "Layout" dans `settings-keybinds.tsx` (entre General et Session)
- `panel.*`, `fileTree.*`, `tab.*` mappés vers Layout
- i18n FR : "Disposition", EN : "Layout"

**Notes empty state**
- Quand le panel notes est ouvert sans note, affichage centré : titre "Aucune note ouverte" + description "Choisissez un fichier dans l'explorateur de gauche ou créez une nouvelle note." + bouton "Créer une nouvelle note"
- Le bouton ouvre un prompt système, sanitize le nom (strips path-unsafe chars, ajoute `.md`), crée le fichier dans le workspace via Tauri FS avec un body `# {{name}}` par défaut, l'ouvre dans un nouveau tab
- i18n keys `notes.empty.title`, `.description`, `.create`, `notes.create.prompt`, `notes.create.defaultBody` en EN et FR. Autres langues fallback EN

**Bouton "Open in Finder/Cursor/iTerm"**
- Caché dans le header (`<Show when={false && projectDirectory()}>`)

**Tab Review persistant**
- Forcé à `false` dans deux endroits : `session.tsx` (variable globale) et `session-side-panel.tsx` (variable locale qui était passée comme reviewMemo)

### 2026-04-29

**Voice input (Deepgram + cpal)**

Tentative 1 : `navigator.mediaDevices.getUserMedia` + WebSocket Deepgram depuis le frontend. Échec : WKWebView macOS désactive `mediaDevices` par défaut.

Tentative 2 : activation des flags privés WKPreferences (`mediaDevicesEnabled`, `mediaCaptureEnabled`, `mediaStreamEnabled`, `peerConnectionEnabled`) via objc2 `setValue:forKey:`. Crash SIGABRT au boot : WebKit cascade dans `WebCore::registerOpusDecoderIfNeeded()` → XPC sync vers AudioComponentMgr qui timeout. Revert.

Tentative 3 (working) : capture native côté Rust avec `cpal` 0.16.
- `voice.rs` : `voice_start` ouvre le default input device sur un thread dédié, downmixe stéréo→mono i16 LE, envoie chaque chunk dans `Channel<Vec<u8>>`. `voice_stop` flippe un AtomicBool pour arrêter le thread. `VoiceState` géré via `app.manage()`
- Frontend : `microphone.tsx` réécrit pour `invoke('voice_start', { onChunk: Channel })`. Le retour donne le `sample_rate` du device, qu'on passe à Deepgram WebSocket avec `encoding=linear16`. Chaque chunk est forwardé en binaire au WS
- Bouton micro à côté du `+ attach` dans le prompt input. Idle = icône mic SVG. Recording = carré rouge pulsant (style stop)
- Settings → General : `Deepgram API key` (password), `Voice language` (default `fr`), `Voice model` (default `nova-3`)
- Bug initial UI : bouton micro et `+` empilés verticalement (le wrapper `<div>` n'avait pas de flex). Fix avec `flex items-center gap-1`
- Bug initial Settings : crash silencieux empêchait l'ouverture du dialog. Cause : `onInput` cast event mal aligné avec la signature Kobalte. Fix : `onChange={(value) => ...}` comme le reste du dialog

---

## Règles de contribution

- Ne pas commit sans demande explicite (sauf instruction "circuit fermé")
- Tester end-to-end avant de marquer comme done
- Préférer édition vs création
- Pas d'emojis sauf demande explicite
- Pas de tirets longs (—)
- Français pour le code interne / commits, anglais pour les strings UI publiques
- Web search via Firecrawl, pas WebFetch

---

## Limitations connues

- Les nouvelles fenêtres ouvertes via Cmd+E n'héritent pas des configurations spéciales de la fenêtre main (vibrancy macOS, decorations custom). Elles s'ouvrent avec décorations standard. Pour les rendre identiques à la main, il faudrait dupliquer la config Rust
- Tab style iTerm Cmd+D (split dans la même fenêtre au lieu de nouvelle fenêtre) non implémenté
- Le binaire dev s'appelle encore `opencode-desktop` (Cargo.toml `name`). Cosmétique. Le bundle prod (`bun tauri build`) utilise bien `Prisme` via `mainBinaryName`
- Pas encore de signature Apple ni de NSMicrophoneUsageDescription custom dans le bundle
- Auto-updater configuré dans `Cargo.toml` mais pas activé dans `tauri.conf.json` (pas de clé publique ni d'endpoint)
