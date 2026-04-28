# Prisme

Interface desktop user-friendly basee sur opencode.

Prisme est un fork du frontend desktop d'opencode (Tauri + SolidJS), depouille de tous les composants backend pour ne garder que l'interface. Le backend reste opencode officiel, installe separement.

## Prerequis

Avoir opencode CLI installe localement et accessible sur le PATH (ou dans `~/.opencode/bin/opencode`).

```bash
curl -fsSL https://opencode.ai/install | bash
```

## Dev

```bash
bun install
cd packages/desktop
bun dev
```

## Build prod

```bash
cd packages/desktop
bun tauri build
```

## Architecture

- `packages/desktop` - wrapper Tauri (entry point)
- `packages/app` - frontend Solid.js (logique applicative)
- `packages/ui` - composants UI partages
- `packages/sdk/js` - client API et types vers opencode
- `packages/core` - utilitaires partages

## Licence

MIT. Fork de [sst/opencode](https://github.com/sst/opencode).
