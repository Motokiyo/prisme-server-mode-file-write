// Prisme Server Mode — ecriture serveur durcie d'un fichier Markdown existant.
//
// Porte depuis packages/opencode/src/file/index.ts (base 1.14.39) vers la
// structure 1.18 : l'ancien namespace File a ete dissous en amont, ce module
// ne garde donc que la logique d'ecriture et ses garde-fous.
//
// Garanties : Markdown uniquement, fichier deja existant, aucun segment cache,
// aucun symlink, chemin confine au workspace, taille bornee, etag obligatoire
// (409 si le fichier a bouge), ecriture atomique par rename avec preservation
// des permissions.
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import { lstat, open, realpath, rename, stat, unlink } from "node:fs/promises"
import path from "path"

const MAX_WRITE_BYTES = 1024 * 1024
const WRITE_EXTENSIONS = new Set(["md"])

const ext = (file: string) => path.extname(file).replace(".", "").toLowerCase()

export const WriteInput = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
  etag: Schema.String,
}).annotate({ identifier: "FileWriteInput" })
export type WriteInput = Schema.Schema.Type<typeof WriteInput>

export const WriteResult = Schema.Struct({
  ok: Schema.Boolean,
  etag: Schema.String,
  mtimeMs: Schema.Number,
  bytes: NonNegativeInt,
}).annotate({ identifier: "FileWriteResult" })
export type WriteResult = Schema.Schema.Type<typeof WriteResult>

export class WriteError extends Error {
  constructor(
    readonly status: 400 | 403 | 409 | 413,
    message: string,
  ) {
    super(message)
    this.name = "FileWriteError"
  }
}

export function hashOf(input: Uint8Array | string) {
  return createHash("sha256").update(input).digest("hex")
}

function isWithin(base: string, target: string) {
  const relative = path.relative(base, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function assertSafeWritePath(file: string) {
  if (!file || file.trim() !== file) throw new WriteError(400, "Invalid path")
  if (file.includes("\0") || file.includes("\\")) throw new WriteError(400, "Invalid path")
  if (path.isAbsolute(file)) throw new WriteError(400, "Absolute paths are not allowed")

  const normalized = path.posix.normalize(file)
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new WriteError(400, "Path escapes workspace")
  }

  const segments = normalized.split("/")
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") throw new WriteError(400, "Invalid path segment")
    if (segment.startsWith(".")) throw new WriteError(403, "Hidden paths are not writable")
  }

  if (!WRITE_EXTENSIONS.has(ext(normalized))) throw new WriteError(400, "Only Markdown files are writable")
  return normalized
}

async function assertNoSymlinkSegments(root: string, file: string) {
  const segments = file.split("/")
  let current = root
  for (const segment of segments) {
    current = path.join(current, segment)
    const info = await lstat(current).catch(() => undefined)
    if (!info) throw new WriteError(400, "File must already exist")
    if (info.isSymbolicLink()) throw new WriteError(403, "Symlinks are not writable")
  }
}

async function fileMeta(full: string) {
  const [info, bytes] = await Promise.all([stat(full), Bun.file(full).bytes()])
  return {
    mtimeMs: info.mtimeMs,
    bytes: bytes.length,
    etag: hashOf(bytes),
  }
}

export async function writeMarkdownExisting(root: string, input: WriteInput): Promise<WriteResult> {
  const file = assertSafeWritePath(input.path)
  const rootReal = await realpath(root)
  const full = path.join(rootReal, file)

  if (!isWithin(rootReal, full)) throw new WriteError(403, "Path escapes workspace")
  await assertNoSymlinkSegments(rootReal, file)

  // Lecture unique de la cible : verifie l'etag ET capture les bits de permission.
  const [info, currentBytes] = await Promise.all([stat(full), Bun.file(full).bytes()])
  if (hashOf(currentBytes) !== input.etag) throw new WriteError(409, "File changed since it was read")

  // Preserver les permissions : le temp est cree en 0o600, sans ca un .md en
  // 0o644 serait silencieusement degrade apres le rename.
  const targetMode = info.mode & 0o777

  const bytes = Buffer.from(input.content, "utf8")
  if (bytes.length > MAX_WRITE_BYTES) throw new WriteError(413, "File is too large")

  const parent = path.dirname(full)
  const parentReal = await realpath(parent)
  if (!isWithin(rootReal, parentReal)) throw new WriteError(403, "Path escapes workspace")

  const temp = path.join(parentReal, `.opencode-write-${randomUUID()}.tmp`)
  const handle = await open(temp, "wx", 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.chmod(targetMode)
    await handle.sync()
  } finally {
    await handle.close()
  }

  try {
    // Dernier garde-fou TOCTOU : re-verifier que la cible est toujours un
    // fichier regulier (pas un symlink glisse apres assertNoSymlinkSegments)
    // juste avant le rename. La fenetre residuelle ne peut pas etre fermee
    // portablement sans renameat2 (Linux only) ; la cible de deploiement est
    // une instance Tailscale mono-utilisateur.
    const finalInfo = await lstat(full)
    if (!finalInfo.isFile() || finalInfo.isSymbolicLink()) {
      await unlink(temp).catch(() => {})
      throw new WriteError(403, "Target changed before write")
    }
    await rename(temp, full)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }

  return {
    ok: true,
    ...(await fileMeta(full)),
  }
}
