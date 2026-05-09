# Prisme Patches

This branch keeps the repository close to `sst/opencode/dev` and applies Prisme as a small product layer.

## Electron Rebrand

- Files: `packages/desktop/src/main/index.ts`, `packages/desktop/src/main/windows.ts`, `packages/desktop/electron-builder.config.ts`, `packages/ui/src/components/logo.tsx`
- Why: ship the upstream Electron desktop under the Prisme name, app IDs, and `prisme://` protocol.

## Platform File Writes

- Files: `packages/app/src/context/platform.tsx`, `packages/desktop/src/main/ipc.ts`, `packages/desktop/src/preload/index.ts`, `packages/desktop/src/preload/types.ts`, `packages/desktop/src/renderer/index.tsx`
- Why: replace former Tauri filesystem writes with a small Electron IPC surface used by notes and Markdown saving.

## Notes And Artifacts

- Files: `packages/app/src/components/file-editor.tsx`, `packages/app/src/components/markdown-editor.tsx`, `packages/app/src/components/markdown-editor.css`, `packages/app/src/pages/session/artifact-kind.ts`, `packages/app/src/pages/session/artifact-viewer.tsx`, `packages/app/src/pages/session/file-tabs.tsx`, `packages/app/src/pages/session/session-side-panel.tsx`
- Why: keep the fixed upstream session layout while adding editable Markdown notes plus PDF, Mermaid, image, audio, video, text, and binary artifact previews in the right panel.

## Voice Input

- Files: `packages/app/src/components/prompt-input.tsx`, `packages/app/src/components/prompt-input/microphone.tsx`, `packages/app/src/context/settings.tsx`, `packages/app/src/components/settings-general.tsx`
- Why: preserve Prisme dictation with browser/Electron microphone capture and Deepgram settings, without Rust/Tauri code.

## Product Defaults

- Files: `packages/app/src/pages/session.tsx`, `packages/app/src/pages/session/session-side-panel.tsx`
- Why: keep the terminal hidden by default and keep the right panel focused on files, notes, and artifacts instead of review tabs.

## Distribution

- Files: `packages/desktop/electron-builder.config.ts`, `packages/desktop/src/main/index.ts`, `packages/desktop/scripts/notarize-dmg.ts`, `packages/desktop/scripts/finalize-latest-yml.ts`, `.github/workflows/prisme-desktop-release.yml`, `docs/prisme-distribution.md`
- Why: publish Prisme builds and update metadata from the Prisme GitHub repo for macOS, Windows, and Linux instead of OpenCode release channels.

## Merge Rules

- Do not delete upstream packages only to slim the repo.
- Prefer new Prisme components over broad edits in upstream files.
- Keep upstream backend, PTY, SQLite, updater, and Electron plumbing intact.
- On update: fetch `sst/opencode`, fast-forward `upstream-sync`, then merge that branch into Prisme and resolve only the patches above.
