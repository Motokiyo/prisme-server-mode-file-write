// Prisme: archive a session transcript to the Obsidian vault inbox.
//
// Pure Node (no opencode/effect imports) so it can be called from any server
// backend. Writes a Markdown transcript into a single fixed directory (the
// vault's "0 Inbox"); the directory is fixed and the filename is reduced to a
// sanitized basename, so no caller-supplied value can escape the inbox.
import * as fs from "node:fs/promises"
import * as nodePath from "node:path"

const VAULT_INBOX_DIR = process.env.PRISME_VAULT_INBOX ?? "/root/vault/0 Inbox"
const VAULT_ARCHIVE_MAX_BYTES = 8 * 1024 * 1024

type SessionInfoLike = { id: string; title?: string; time?: { created?: number } }
type MessageLike = { info: { role: string }; parts?: ReadonlyArray<{ type: string; text?: string }> }

function sanitizeVaultFilename(name: string): string {
  const cleaned = nodePath
    .basename(name)
    .replace(/[\\/]/g, "-")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
  return (cleaned || "session").slice(0, 120)
}

export function vaultArchiveFilename(info: SessionInfoLike): string {
  const d = new Date(info.time?.created ?? Date.now())
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return `${stamp}-${sanitizeVaultFilename(info.title || "session")}.md`
}

export function renderVaultTranscript(info: SessionInfoLike, messages: ReadonlyArray<MessageLike>): string {
  const fmt = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : undefined)
  const lines: string[] = []
  lines.push(`# ${info.title?.trim() || "Session sans titre"}`)
  lines.push("")
  const meta = [`session \`${info.id}\``, `archivée le ${fmt(Date.now())}`]
  const created = fmt(info.time?.created)
  if (created) meta.push(`créée le ${created}`)
  lines.push(`*${meta.join(" — ")}*`)
  lines.push("")
  lines.push("---")
  for (const message of messages) {
    const texts = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0)
      .map((part) => part.text!.trim())
    if (texts.length === 0) continue
    lines.push("")
    lines.push(`### ${message.info.role === "user" ? "🧑 Vous" : "🤖 Assistant"}`)
    lines.push("")
    lines.push(texts.join("\n\n"))
  }
  lines.push("")
  return lines.join("\n")
}

export async function archiveSessionToVault(
  info: SessionInfoLike,
  messages: ReadonlyArray<MessageLike>,
): Promise<{ path: string; bytes: number }> {
  const content = renderVaultTranscript(info, messages)
  const bytes = Buffer.byteLength(content, "utf8")
  if (bytes > VAULT_ARCHIVE_MAX_BYTES) throw new Error("vault archive content too large")
  const dir = nodePath.resolve(VAULT_INBOX_DIR)
  const dest = nodePath.resolve(dir, vaultArchiveFilename(info))
  if (nodePath.dirname(dest) !== dir) throw new Error("invalid vault archive path")
  await fs.mkdir(dir, { recursive: true })
  const tmp = nodePath.join(dir, `.${nodePath.basename(dest)}.${process.pid}.${Date.now()}.tmp`)
  await fs.writeFile(tmp, content, { encoding: "utf8", mode: 0o644 })
  await fs.rename(tmp, dest)
  return { path: dest, bytes }
}
