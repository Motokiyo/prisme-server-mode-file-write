export type ArtifactKind = "markdown" | "pdf" | "image" | "audio" | "video" | "diagram" | "text" | "binary"

const markdownExtensions = new Set(["md", "mdx", "markdown"])
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff", "heic", "svg"])
const audioExtensions = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"])
const videoExtensions = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv"])
const diagramExtensions = new Set(["mmd", "mermaid", "dot", "gv", "puml", "plantuml"])
const textExtensions = new Set([
  "txt",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "toml",
  "xml",
  "html",
  "css",
  "scss",
  "js",
  "jsx",
  "ts",
  "tsx",
  "rs",
  "go",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "swift",
  "kt",
  "sql",
  "sh",
  "zsh",
  "fish",
])

function artifactKindFromMime(mimeType?: string): ArtifactKind | undefined {
  const mime = mimeType?.split(";", 1)[0]?.trim().toLowerCase()
  if (!mime) return
  if (mime === "text/markdown" || mime === "text/x-markdown") return "markdown"
  if (mime === "application/pdf") return "pdf"
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("text/")) return "text"
  if (
    mime === "application/json" ||
    mime === "application/ld+json" ||
    mime === "application/xml" ||
    mime === "application/yaml" ||
    mime === "application/toml" ||
    mime === "application/javascript" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  ) {
    return "text"
  }
  return
}

export function artifactKindFromPath(path: string, mimeType?: string): ArtifactKind {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  if (markdownExtensions.has(ext)) return "markdown"
  if (ext === "pdf") return "pdf"
  if (imageExtensions.has(ext)) return "image"
  if (audioExtensions.has(ext)) return "audio"
  if (videoExtensions.has(ext)) return "video"
  if (diagramExtensions.has(ext)) return "diagram"
  if (textExtensions.has(ext)) return "text"
  const mimeKind = artifactKindFromMime(mimeType)
  if (mimeKind) return mimeKind
  return "binary"
}
