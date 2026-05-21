import { BusEvent } from "@/bus/bus-event"
import { InstanceState } from "@/effect/instance-state"

import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Git } from "@/git"
import { Effect, Layer, Context, Schema, Scope } from "effect"
import * as Stream from "effect/Stream"
import { formatPatch, structuredPatch } from "diff"
import fuzzysort from "fuzzysort"
import ignore from "ignore"
import { createHash, randomUUID } from "node:crypto"
import { lstat, open, realpath, rename, stat, unlink } from "node:fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { containsPath } from "../project/instance-context"
import * as Log from "@opencode-ai/core/util/log"
import { Protected } from "./protected"
import { Ripgrep } from "./ripgrep"
import { zod } from "@/util/effect-zod"
import { NonNegativeInt, type DeepMutable, withStatics } from "@/util/schema"

export const Info = Schema.Struct({
  path: Schema.String,
  added: NonNegativeInt,
  removed: NonNegativeInt,
  status: Schema.Literals(["added", "deleted", "modified"]),
})
  .annotate({ identifier: "File" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

export const Node = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  absolute: Schema.String,
  type: Schema.Literals(["file", "directory"]),
  ignored: Schema.Boolean,
})
  .annotate({ identifier: "FileNode" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type Node = DeepMutable<Schema.Schema.Type<typeof Node>>

const Hunk = Schema.Struct({
  oldStart: NonNegativeInt,
  oldLines: NonNegativeInt,
  newStart: NonNegativeInt,
  newLines: NonNegativeInt,
  lines: Schema.Array(Schema.String),
})

const Patch = Schema.Struct({
  oldFileName: Schema.String,
  newFileName: Schema.String,
  oldHeader: Schema.optional(Schema.String),
  newHeader: Schema.optional(Schema.String),
  hunks: Schema.Array(Hunk),
  index: Schema.optional(Schema.String),
})

export const Content = Schema.Struct({
  type: Schema.Literals(["text", "binary"]),
  content: Schema.String,
  diff: Schema.optional(Schema.String),
  patch: Schema.optional(Patch),
  encoding: Schema.optional(Schema.Literal("base64")),
  mimeType: Schema.optional(Schema.String),
  etag: Schema.optional(Schema.String),
  mtimeMs: Schema.optional(Schema.Number),
  bytes: Schema.optional(NonNegativeInt),
})
  .annotate({ identifier: "FileContent" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type Content = DeepMutable<Schema.Schema.Type<typeof Content>>

export const WriteInput = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
  etag: Schema.String,
})
  .annotate({ identifier: "FileWriteInput" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type WriteInput = DeepMutable<Schema.Schema.Type<typeof WriteInput>>

export const WriteResult = Schema.Struct({
  ok: Schema.Boolean,
  etag: Schema.String,
  mtimeMs: Schema.Number,
  bytes: NonNegativeInt,
})
  .annotate({ identifier: "FileWriteResult" })
  .pipe(withStatics((s) => ({ zod: zod(s) })))
export type WriteResult = DeepMutable<Schema.Schema.Type<typeof WriteResult>>

export class WriteError extends Error {
  constructor(
    readonly status: 400 | 403 | 409 | 413,
    message: string,
  ) {
    super(message)
    this.name = "FileWriteError"
  }
}

export const Event = {
  Edited: BusEvent.define(
    "file.edited",
    Schema.Struct({
      file: Schema.String,
    }),
  ),
}

const log = Log.create({ service: "file" })

const binary = new Set([
  "exe",
  "dll",
  "pdb",
  "bin",
  "so",
  "dylib",
  "o",
  "a",
  "lib",
  "wav",
  "mp3",
  "ogg",
  "oga",
  "ogv",
  "ogx",
  "flac",
  "aac",
  "wma",
  "m4a",
  "weba",
  "mp4",
  "avi",
  "mov",
  "wmv",
  "flv",
  "webm",
  "mkv",
  "zip",
  "tar",
  "gz",
  "gzip",
  "bz",
  "bz2",
  "bzip",
  "bzip2",
  "7z",
  "rar",
  "xz",
  "lz",
  "z",
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "dmg",
  "iso",
  "img",
  "vmdk",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  "sqlite",
  "db",
  "mdb",
  "apk",
  "ipa",
  "aab",
  "xapk",
  "app",
  "pkg",
  "deb",
  "rpm",
  "snap",
  "flatpak",
  "appimage",
  "msi",
  "msp",
  "jar",
  "war",
  "ear",
  "class",
  "kotlin_module",
  "dex",
  "vdex",
  "odex",
  "oat",
  "art",
  "wasm",
  "wat",
  "bc",
  "ll",
  "s",
  "ko",
  "sys",
  "drv",
  "efi",
  "rom",
  "com",
])

const image = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "ico",
  "tif",
  "tiff",
  "svg",
  "svgz",
  "avif",
  "apng",
  "jxl",
  "heic",
  "heif",
  "raw",
  "cr2",
  "nef",
  "arw",
  "dng",
  "orf",
  "raf",
  "pef",
  "x3f",
])

const text = new Set([
  "ts",
  "tsx",
  "mts",
  "cts",
  "mtsx",
  "ctsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "psm1",
  "cmd",
  "bat",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "yml",
  "toml",
  "md",
  "mdx",
  "txt",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "graphql",
  "gql",
  "sql",
  "ini",
  "cfg",
  "conf",
  "env",
])

const textName = new Set([
  "dockerfile",
  "makefile",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  ".eslintrc",
])

const mime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  svgz: "image/svg+xml",
  avif: "image/avif",
  apng: "image/apng",
  jxl: "image/jxl",
  heic: "image/heic",
  heif: "image/heif",
}

type Entry = { files: string[]; dirs: string[] }

const ext = (file: string) => path.extname(file).toLowerCase().slice(1)
const name = (file: string) => path.basename(file).toLowerCase()
const isImageByExtension = (file: string) => image.has(ext(file))
const isTextByExtension = (file: string) => text.has(ext(file))
const isTextByName = (file: string) => textName.has(name(file))
const isBinaryByExtension = (file: string) => binary.has(ext(file))
const isImage = (mimeType: string) => mimeType.startsWith("image/")
const getImageMimeType = (file: string) => mime[ext(file)] || "image/" + ext(file)

function shouldEncode(mimeType: string) {
  const type = mimeType.toLowerCase()
  log.debug("shouldEncode", { type })
  if (!type) return false
  if (type.startsWith("text/")) return false
  if (type.includes("charset=")) return false
  const top = type.split("/", 2)[0]
  return ["image", "audio", "video", "font", "model", "multipart"].includes(top)
}

const hidden = (item: string) => {
  const normalized = item.replaceAll("\\", "/").replace(/\/+$/, "")
  return normalized.split("/").some((part) => part.startsWith(".") && part.length > 1)
}

const MAX_WRITE_BYTES = 1024 * 1024
const WRITE_EXTENSIONS = new Set(["md"])

// Cap base64-encoded PDF previews so a large document does not blow up the
// JSON response / mobile client. Above this size the read falls back to the
// existing empty-binary behaviour and the UI shows its "cannot preview" state.
const MAX_PDF_PREVIEW_BYTES = 25 * 1024 * 1024
const isPdfByExtension = (file: string) => ext(file) === "pdf"

function etag(input: Uint8Array | string) {
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
    etag: etag(bytes),
  }
}

async function writeMarkdownExisting(root: string, input: WriteInput) {
  const file = assertSafeWritePath(input.path)
  const rootReal = await realpath(root)
  const full = path.join(rootReal, file)

  if (!isWithin(rootReal, full)) throw new WriteError(403, "Path escapes workspace")
  await assertNoSymlinkSegments(rootReal, file)

  // Read the target once to both check the etag and capture its permission bits.
  const [info, currentBytes] = await Promise.all([stat(full), Bun.file(full).bytes()])
  if (etag(currentBytes) !== input.etag) throw new WriteError(409, "File changed since it was read")

  // Preserve the existing file's permission bits so the atomic-rename write below
  // does not silently downgrade them. The temp file is created 0o600, so without
  // this a 0o644 .md would become 0o600 after the rename.
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
    // Final TOCTOU guard: re-verify the target is still a regular file (not a
    // symlink swapped in after assertNoSymlinkSegments) immediately before the
    // rename. The residual window between this lstat and the rename cannot be
    // closed portably without renameat2(RENAME_NOREPLACE/EXCHANGE), which is
    // Linux-only. The deployment target is a single-user Tailscale instance with
    // no concurrent local attacker, so this is defense in depth that shrinks the
    // exploitable window to microseconds rather than a complete close.
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
  } satisfies WriteResult
}

const sortHiddenLast = (items: string[], prefer: boolean) => {
  if (prefer) return items
  const visible: string[] = []
  const hiddenItems: string[] = []
  for (const item of items) {
    if (hidden(item)) hiddenItems.push(item)
    else visible.push(item)
  }
  return [...visible, ...hiddenItems]
}

interface State {
  cache: Entry
}

export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<Info[]>
  readonly read: (file: string) => Effect.Effect<Content>
  readonly write: (input: WriteInput) => Effect.Effect<WriteResult, WriteError>
  readonly list: (dir?: string) => Effect.Effect<Node[]>
  readonly search: (input: {
    query: string
    limit?: number
    dirs?: boolean
    type?: "file" | "directory"
  }) => Effect.Effect<string[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/File") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const appFs = yield* AppFileSystem.Service
    const rg = yield* Ripgrep.Service
    const git = yield* Git.Service
    const scope = yield* Scope.Scope

    const state = yield* InstanceState.make<State>(
      Effect.fn("File.state")(() =>
        Effect.succeed({
          cache: { files: [], dirs: [] } as Entry,
        }),
      ),
    )

    const scan = Effect.fn("File.scan")(function* () {
      const ctx = yield* InstanceState.context
      if (ctx.directory === path.parse(ctx.directory).root) return
      const isGlobalHome = ctx.directory === Global.Path.home && ctx.project.id === "global"
      const next: Entry = { files: [], dirs: [] }

      if (isGlobalHome) {
        const dirs = new Set<string>()
        const protectedNames = Protected.names()
        const ignoreNested = new Set(["node_modules", "dist", "build", "target", "vendor"])
        const shouldIgnoreName = (name: string) => name.startsWith(".") || protectedNames.has(name)
        const shouldIgnoreNested = (name: string) => name.startsWith(".") || ignoreNested.has(name)
        const top = yield* appFs.readDirectoryEntries(ctx.directory).pipe(Effect.orElseSucceed(() => []))

        for (const entry of top) {
          if (entry.type !== "directory") continue
          if (shouldIgnoreName(entry.name)) continue
          dirs.add(entry.name + "/")

          const base = path.join(ctx.directory, entry.name)
          const children = yield* appFs.readDirectoryEntries(base).pipe(Effect.orElseSucceed(() => []))
          for (const child of children) {
            if (child.type !== "directory") continue
            if (shouldIgnoreNested(child.name)) continue
            dirs.add(entry.name + "/" + child.name + "/")
          }
        }

        next.dirs = Array.from(dirs).toSorted()
      } else {
        const files = yield* rg.files({ cwd: ctx.directory }).pipe(
          Stream.runCollect,
          Effect.map((chunk) => [...chunk]),
        )
        const seen = new Set<string>()
        for (const file of files) {
          next.files.push(file)
          let current = file
          while (true) {
            const dir = path.dirname(current)
            if (dir === ".") break
            if (dir === current) break
            current = dir
            if (seen.has(dir)) continue
            seen.add(dir)
            next.dirs.push(dir + "/")
          }
        }
      }

      const s = yield* InstanceState.get(state)
      s.cache = next
    })

    let cachedScan = yield* Effect.cached(scan().pipe(Effect.catchCause(() => Effect.void)))

    const ensure = Effect.fn("File.ensure")(function* () {
      yield* cachedScan
      cachedScan = yield* Effect.cached(scan().pipe(Effect.catchCause(() => Effect.void)))
    })

    const gitText = Effect.fnUntraced(function* (args: string[]) {
      return (yield* git.run(args, { cwd: (yield* InstanceState.context).directory })).text()
    })

    const init = Effect.fn("File.init")(function* () {
      yield* ensure().pipe(Effect.forkIn(scope))
    })

    const status = Effect.fn("File.status")(function* () {
      const ctx = yield* InstanceState.context
      if (ctx.project.vcs !== "git") return []

      const diffOutput = yield* gitText([
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotepath=false",
        "diff",
        "--numstat",
        "HEAD",
      ])

      const changed: Info[] = []

      if (diffOutput.trim()) {
        for (const line of diffOutput.trim().split("\n")) {
          const [added, removed, file] = line.split("\t")
          changed.push({
            path: file,
            added: added === "-" ? 0 : parseInt(added, 10),
            removed: removed === "-" ? 0 : parseInt(removed, 10),
            status: "modified",
          })
        }
      }

      const untrackedOutput = yield* gitText([
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotepath=false",
        "ls-files",
        "--others",
        "--exclude-standard",
      ])

      if (untrackedOutput.trim()) {
        for (const file of untrackedOutput.trim().split("\n")) {
          const content = yield* appFs
            .readFileString(path.join(ctx.directory, file))
            .pipe(Effect.catch(() => Effect.succeed<string | undefined>(undefined)))
          if (content === undefined) continue
          changed.push({
            path: file,
            added: content.split("\n").length,
            removed: 0,
            status: "added",
          })
        }
      }

      const deletedOutput = yield* gitText([
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotepath=false",
        "diff",
        "--name-only",
        "--diff-filter=D",
        "HEAD",
      ])

      if (deletedOutput.trim()) {
        for (const file of deletedOutput.trim().split("\n")) {
          changed.push({
            path: file,
            added: 0,
            removed: 0,
            status: "deleted",
          })
        }
      }

      return changed.map((item) => {
        const full = path.isAbsolute(item.path) ? item.path : path.join(ctx.directory, item.path)
        return {
          ...item,
          path: path.relative(ctx.directory, full),
        }
      })
    })

    const read: Interface["read"] = Effect.fn("File.read")(function* (file: string) {
      using _ = log.time("read", { file })
      const ctx = yield* InstanceState.context
      const full = path.join(ctx.directory, file)

      if (!containsPath(full, ctx)) {
        throw new Error("Access denied: path escapes project directory")
      }

      if (isImageByExtension(file)) {
        const exists = yield* appFs.existsSafe(full)
        if (exists) {
          const bytes = yield* appFs.readFile(full).pipe(Effect.catch(() => Effect.succeed(new Uint8Array())))
          const meta = yield* Effect.tryPromise(() => fileMeta(full)).pipe(Effect.catch(() => Effect.succeed(undefined)))
          return {
            type: "text" as const,
            content: Buffer.from(bytes).toString("base64"),
            mimeType: getImageMimeType(file),
            encoding: "base64" as const,
            ...meta,
          }
        }
        return { type: "text" as const, content: "" }
      }

      // PDFs are returned as base64 (same shape as images) so the frontend
      // PdfPreview can decode them. Size-capped: oversized PDFs fall through to
      // the empty-binary behaviour below so we don't saturate the mobile client.
      if (isPdfByExtension(file)) {
        const exists = yield* appFs.existsSafe(full)
        if (!exists) return { type: "text" as const, content: "" }
        const info = yield* Effect.tryPromise(() => stat(full)).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (info && info.size > MAX_PDF_PREVIEW_BYTES) {
          return { type: "binary" as const, content: "", mimeType: "application/pdf" }
        }
        const bytes = yield* appFs.readFile(full).pipe(Effect.catch(() => Effect.succeed(new Uint8Array())))
        if (bytes.length > MAX_PDF_PREVIEW_BYTES) {
          return { type: "binary" as const, content: "", mimeType: "application/pdf" }
        }
        const meta = yield* Effect.tryPromise(() => fileMeta(full)).pipe(Effect.catch(() => Effect.succeed(undefined)))
        return {
          type: "text" as const,
          content: Buffer.from(bytes).toString("base64"),
          mimeType: "application/pdf",
          encoding: "base64" as const,
          ...meta,
        }
      }

      const knownText = isTextByExtension(file) || isTextByName(file)

      if (isBinaryByExtension(file) && !knownText) return { type: "binary" as const, content: "" }

      const exists = yield* appFs.existsSafe(full)
      if (!exists) return { type: "text" as const, content: "" }

      const mimeType = AppFileSystem.mimeType(full)
      const encode = knownText ? false : shouldEncode(mimeType)

      if (encode && !isImage(mimeType)) return { type: "binary" as const, content: "", mimeType }

      if (encode) {
        const bytes = yield* appFs.readFile(full).pipe(Effect.catch(() => Effect.succeed(new Uint8Array())))
        const meta = yield* Effect.tryPromise(() => fileMeta(full)).pipe(Effect.catch(() => Effect.succeed(undefined)))
        return {
          type: "text" as const,
          content: Buffer.from(bytes).toString("base64"),
          mimeType,
          encoding: "base64" as const,
          ...meta,
        }
      }

      const content = yield* appFs.readFileString(full).pipe(Effect.catch(() => Effect.succeed("")))
      const meta = yield* Effect.tryPromise(() => fileMeta(full)).pipe(Effect.catch(() => Effect.succeed(undefined)))

      if (ctx.project.vcs === "git") {
        let diff = yield* gitText(["-c", "core.fsmonitor=false", "diff", "--", file])
        if (!diff.trim()) {
          diff = yield* gitText(["-c", "core.fsmonitor=false", "diff", "--staged", "--", file])
        }
        if (diff.trim()) {
          const original = yield* git.show(ctx.directory, "HEAD", file)
          const patch = structuredPatch(file, file, original, content, "old", "new", {
            context: Infinity,
            ignoreWhitespace: true,
          })
          return { type: "text" as const, content, patch, diff: formatPatch(patch), ...meta }
        }
        return { type: "text" as const, content, ...meta }
      }

      return { type: "text" as const, content, ...meta }
    })

    const write: Interface["write"] = Effect.fn("File.write")(function* (input: WriteInput) {
      const ctx = yield* InstanceState.context
      return yield* Effect.tryPromise({
        try: () => writeMarkdownExisting(ctx.directory, input),
        catch: (error) =>
          error instanceof WriteError
            ? error
            : new WriteError(400, error instanceof Error ? error.message : String(error)),
      })
    })

    const list = Effect.fn("File.list")(function* (dir?: string) {
      const ctx = yield* InstanceState.context
      const exclude = [".git", ".DS_Store"]
      let ignored = (_: string) => false
      if (ctx.project.vcs === "git") {
        const ig = ignore()
        const gitignore = path.join(ctx.worktree, ".gitignore")
        const gitignoreText = yield* appFs.readFileString(gitignore).pipe(Effect.catch(() => Effect.succeed("")))
        if (gitignoreText) ig.add(gitignoreText)
        const ignoreFile = path.join(ctx.worktree, ".ignore")
        const ignoreText = yield* appFs.readFileString(ignoreFile).pipe(Effect.catch(() => Effect.succeed("")))
        if (ignoreText) ig.add(ignoreText)
        ignored = ig.ignores.bind(ig)
      }

      const resolved = dir ? path.join(ctx.directory, dir) : ctx.directory
      if (!containsPath(resolved, ctx)) {
        throw new Error("Access denied: path escapes project directory")
      }

      const entries = yield* appFs.readDirectoryEntries(resolved).pipe(Effect.orElseSucceed(() => []))

      const nodes: Node[] = []
      for (const entry of entries) {
        if (exclude.includes(entry.name)) continue
        const absolute = path.join(resolved, entry.name)
        const file = path.relative(ctx.directory, absolute)
        const type = entry.type === "directory" ? "directory" : "file"
        nodes.push({
          name: entry.name,
          path: file,
          absolute,
          type,
          ignored: ignored(type === "directory" ? file + "/" : file),
        })
      }
      return nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    })

    const search = Effect.fn("File.search")(function* (input: {
      query: string
      limit?: number
      dirs?: boolean
      type?: "file" | "directory"
    }) {
      yield* ensure()
      const { cache } = yield* InstanceState.get(state)

      const query = input.query.trim()
      const limit = input.limit ?? 100
      const kind = input.type ?? (input.dirs === false ? "file" : "all")
      log.info("search", { query, kind })

      const preferHidden = query.startsWith(".") || query.includes("/.")

      if (!query) {
        if (kind === "file") return cache.files.slice(0, limit)
        return sortHiddenLast(cache.dirs.toSorted(), preferHidden).slice(0, limit)
      }

      const items = kind === "file" ? cache.files : kind === "directory" ? cache.dirs : [...cache.files, ...cache.dirs]

      const searchLimit = kind === "directory" && !preferHidden ? limit * 20 : limit
      const sorted = fuzzysort.go(query, items, { limit: searchLimit }).map((item) => item.target)
      const output = kind === "directory" ? sortHiddenLast(sorted, preferHidden).slice(0, limit) : sorted

      log.info("search", { query, kind, results: output.length })
      return output
    })

    log.info("init")
    return Service.of({ init, status, read, write, list, search })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Ripgrep.defaultLayer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Git.defaultLayer),
)

export * as File from "."
