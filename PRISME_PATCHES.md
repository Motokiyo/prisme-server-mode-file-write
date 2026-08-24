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

## Session Vault Archive

- App version: **1.14.39**. Date: 2026-05-22.
- Files: `packages/opencode/src/session/vault-archive.ts` (new, shared pure-Node module: renders a session transcript to Markdown and writes it atomically into a single fixed inbox dir), `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts` (active backend), `packages/opencode/src/server/routes/instance/session.ts` (legacy Hono backend, parity).
- Why: archiving a session **exports its full transcript** to `0 Inbox/<YYYY-MM-DD-HHmm>-<title>.md` and then **deletes the session** — the `.md` becomes the only record (Prisme has no un-archive, so a hidden session was already unrecoverable). Hooked into the existing `session.update` handler: when `time.archived` is set for the first time, it renders the transcript (user/assistant text parts, in order), writes the file, and on success calls `session.remove`.
- **Safety**: the session is deleted **only if the export actually succeeded**; otherwise it falls back to a plain hide (`setArchived`), so a vault/read failure can never lose data. No new HTTP route and no client change: every archive path goes through `session.update`.
- **Scope note**: "archive all" / reset-workspace also goes through `session.update({time:{archived}})`, so it now exports **and deletes every session** (with a `.md` backup each). The dedicated *Delete* action (trash + confirm) is unchanged and does **not** export.
- Config: inbox dir defaults to `/root/vault/0 Inbox`, override with env `PRISME_VAULT_INBOX`. Filename is reduced to a sanitized basename (no path traversal); content capped at 8 MB.
- Note: this server runs the experimental **effect-httpapi** backend (`OPENCODE_EXPERIMENTAL_HTTPAPI` defaults on for this channel), so the live handler is the httpapi one; the legacy Hono route carries the same hook for parity if the backend is ever switched.

## Server Reload Fix (self-hosted web)

- App version: **1.14.39**. Date: 2026-05-22.
- Files: `packages/app/src/entry.tsx` (`getCurrentUrl` honors a build-time `VITE_OPENCODE_SERVER_HOST/PORT` in production too, falling back to same-origin for Electron/generic builds), `packages/app/vite.config.ts` (adds a `preview` block with `allowedHosts: true`), `systemd: /etc/systemd/system/prisme-web.service.d/use-preview.conf` (drop-in: `vite preview` instead of `vite dev`).
- Why: the web UI was served by a **Vite dev server**, whose HMR client forces a full page reload on websocket reconnect (e.g. when returning to the tab). Serving a **production build** (`vite preview`) removes the HMR client entirely, so the page no longer reloads on refocus.
- Deploy: `cd packages/app && VITE_OPENCODE_SERVER_HOST=100.115.131.25 VITE_OPENCODE_SERVER_PORT=4096 bun run build`, then the systemd drop-in serves `dist/` on `:3090`. Rebuild after any app code change (the dev server's live edit is no longer used). Revert by removing the drop-in (back to `vite dev`).

## Merge Rules

- Do not delete upstream packages only to slim the repo.
- Prefer new Prisme components over broad edits in upstream files.
- Keep upstream backend, PTY, SQLite, updater, and Electron plumbing intact.
- On update: fetch `sst/opencode`, fast-forward `upstream-sync`, then merge that branch into Prisme and resolve only the patches above.
