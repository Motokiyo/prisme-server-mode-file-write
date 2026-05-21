/**
 * Detection + classification for file references that appear as inline code in
 * assistant chat messages (e.g. `notes/x.md` or `Resume.pdf`).
 *
 * The goal is to recognize a *conservative* set of file-like inline-code spans
 * and turn them into clickable links that open the file in the existing viewer.
 * Detection deliberately favours precision over recall: ambiguous tokens
 * (commands, identifiers without an extension, URLs, etc.) are NOT linkified.
 *
 * SECURITY: this module never opens anything. It only classifies a string. The
 * caller is responsible for opening files through the existing, workspace-scoped
 * code path. Any input that escapes the workspace (absolute paths, `..`
 * traversal, drive letters, URL schemes) is rejected here so it can never reach
 * an opener as a path — at most it is treated as a bare-name search candidate.
 */

/** Extensions we are confident represent files worth opening in the viewer. */
export const FILE_REFERENCE_EXTENSIONS = [
  "md",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "txt",
  "csv",
  "json",
  "svg",
  "webp",
  "gif",
] as const

export type FileReferenceExtension = (typeof FILE_REFERENCE_EXTENSIONS)[number]

const EXTENSION_SET = new Set<string>(FILE_REFERENCE_EXTENSIONS)

/**
 * A classified file reference.
 * - `path`: a relative path inside the workspace (contains a separator), safe to
 *   open directly through the existing workspace-scoped opener.
 * - `name`: a bare filename (no separator) that must be resolved via the
 *   workspace-scoped search before opening.
 */
export type FileReference =
  | { kind: "path"; value: string; basename: string; extension: string }
  | { kind: "name"; value: string; basename: string; extension: string }

// Reject anything that could escape the workspace or isn't a plain file token.
const URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/
// A single path segment: no separators, no whitespace, not empty, not "." / "..".
const SEGMENT = /^[^\s/\\]+$/

function extensionOf(basename: string): string | undefined {
  const dot = basename.lastIndexOf(".")
  if (dot <= 0) return undefined // no dot, or leading-dot dotfile like ".env"
  const ext = basename.slice(dot + 1).toLowerCase()
  if (!ext) return undefined
  return ext
}

/**
 * Returns true when a path is safe to treat as a workspace-relative path:
 * no absolute roots, no `..` traversal, no URL scheme, no drive letters.
 */
export function isWorkspaceSafePath(input: string): boolean {
  const text = input.trim()
  if (!text) return false
  if (URL_SCHEME.test(text)) return false
  if (WINDOWS_DRIVE.test(text)) return false
  if (text.startsWith("/") || text.startsWith("\\")) return false
  if (text.startsWith("~")) return false

  // Normalise separators only for segment inspection.
  const segments = text.replace(/\\/g, "/").split("/")
  for (const segment of segments) {
    if (segment === "" ) return false // empty segment => "//" or trailing slash
    if (segment === "." || segment === "..") return false
    if (!SEGMENT.test(segment)) return false
  }
  return true
}

/**
 * Classifies an inline-code span. Returns a `FileReference` when it looks like a
 * file we can open, or `undefined` when it should stay plain text.
 *
 * Conservative rules:
 * - The trimmed text must be a single token (no whitespace).
 * - It must be workspace-safe (see {@link isWorkspaceSafePath}). Absolute paths,
 *   `..` traversal, URLs and drive letters are rejected outright.
 * - It is a `path` when it contains a separator (the basename must still have a
 *   known extension OR the path has multiple segments with any final extension —
 *   we require a known extension to stay conservative).
 * - It is a `name` when it is a single segment ending in a known extension.
 */
export function classifyFileReference(input: string): FileReference | undefined {
  const text = input.trim()
  if (!text) return undefined
  if (/\s/.test(text)) return undefined
  if (!isWorkspaceSafePath(text)) return undefined

  const normalized = text.replace(/\\/g, "/")
  const hasSeparator = normalized.includes("/")
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1)
  if (!basename) return undefined

  const extension = extensionOf(basename)
  if (!extension) return undefined
  // Only linkify known, viewer-friendly extensions to keep precision high.
  if (!EXTENSION_SET.has(extension)) return undefined

  if (hasSeparator) {
    return { kind: "path", value: normalized, basename, extension }
  }
  return { kind: "name", value: normalized, basename, extension }
}
