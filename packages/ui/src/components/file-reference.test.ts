import { describe, expect, test } from "bun:test"
import { classifyFileReference, isWorkspaceSafePath } from "./file-reference"

describe("classifyFileReference", () => {
  test("classifies a bare filename with a known extension as a name", () => {
    expect(classifyFileReference("Resume_Reachy_Care_Inria_Flowers.pdf")).toEqual({
      kind: "name",
      value: "Resume_Reachy_Care_Inria_Flowers.pdf",
      basename: "Resume_Reachy_Care_Inria_Flowers.pdf",
      extension: "pdf",
    })
    expect(classifyFileReference("un.pdf")).toMatchObject({ kind: "name", extension: "pdf" })
    expect(classifyFileReference("data.csv")).toMatchObject({ kind: "name", extension: "csv" })
    expect(classifyFileReference("image.PNG")).toMatchObject({ kind: "name", extension: "png" })
  })

  test("classifies a relative path with a known extension as a path", () => {
    expect(classifyFileReference("notes/x.md")).toEqual({
      kind: "path",
      value: "notes/x.md",
      basename: "x.md",
      extension: "md",
    })
    expect(classifyFileReference("a/b/c.json")).toMatchObject({ kind: "path", basename: "c.json", extension: "json" })
    expect(classifyFileReference("src\\app\\main.svg")).toMatchObject({
      kind: "path",
      value: "src/app/main.svg",
      extension: "svg",
    })
  })

  test("trims surrounding whitespace", () => {
    expect(classifyFileReference("  notes/x.md  ")).toMatchObject({ kind: "path", value: "notes/x.md" })
  })

  test("rejects code without a known file extension", () => {
    expect(classifyFileReference("npm install")).toBeUndefined()
    expect(classifyFileReference("getUserById")).toBeUndefined()
    expect(classifyFileReference("const x = 1")).toBeUndefined()
    expect(classifyFileReference("README")).toBeUndefined()
    expect(classifyFileReference("file.exe")).toBeUndefined() // unknown extension
    expect(classifyFileReference("script.sh")).toBeUndefined() // unknown extension
    expect(classifyFileReference("v1.2.3")).toBeUndefined() // version-like, unknown ext "3"
  })

  test("rejects dotfiles without an extension", () => {
    expect(classifyFileReference(".env")).toBeUndefined()
    expect(classifyFileReference(".gitignore")).toBeUndefined()
  })

  test("rejects empty / whitespace-containing input", () => {
    expect(classifyFileReference("")).toBeUndefined()
    expect(classifyFileReference("   ")).toBeUndefined()
    expect(classifyFileReference("my file.pdf")).toBeUndefined()
  })

  // --- SECURITY: traversal / absolute paths must never be linkified ---

  test("rejects parent-directory traversal", () => {
    expect(classifyFileReference("../secret.md")).toBeUndefined()
    expect(classifyFileReference("../../etc/passwd.txt")).toBeUndefined()
    expect(classifyFileReference("notes/../../secret.md")).toBeUndefined()
    expect(classifyFileReference("a/b/../c.md")).toBeUndefined()
    expect(classifyFileReference("..\\secret.md")).toBeUndefined()
  })

  test("rejects absolute paths", () => {
    expect(classifyFileReference("/etc/passwd.txt")).toBeUndefined()
    expect(classifyFileReference("/Users/alex/secret.md")).toBeUndefined()
    expect(classifyFileReference("\\Windows\\system.txt")).toBeUndefined()
  })

  test("rejects Windows drive letters", () => {
    expect(classifyFileReference("C:/Users/alex/secret.md")).toBeUndefined()
    expect(classifyFileReference("D:\\data\\x.csv")).toBeUndefined()
  })

  test("rejects home-relative and URL-scheme references", () => {
    expect(classifyFileReference("~/secret.md")).toBeUndefined()
    expect(classifyFileReference("file:///etc/passwd.txt")).toBeUndefined()
    expect(classifyFileReference("https://example.com/x.pdf")).toBeUndefined()
  })

  test("rejects a leading ./ current-dir prefix (kept conservative)", () => {
    // Leading "." segment is rejected; the link would otherwise duplicate the
    // existing relative-path handling ambiguously. Bare names / clean relative
    // paths still work.
    expect(classifyFileReference("./notes/x.md")).toBeUndefined()
  })
})

describe("isWorkspaceSafePath", () => {
  test("accepts clean relative paths and bare names", () => {
    expect(isWorkspaceSafePath("x.md")).toBe(true)
    expect(isWorkspaceSafePath("notes/x.md")).toBe(true)
    expect(isWorkspaceSafePath("a/b/c.json")).toBe(true)
  })

  test("rejects traversal, absolute paths, drives, URLs and tilde", () => {
    expect(isWorkspaceSafePath("../x.md")).toBe(false)
    expect(isWorkspaceSafePath("a/../b.md")).toBe(false)
    expect(isWorkspaceSafePath("/etc/x.md")).toBe(false)
    expect(isWorkspaceSafePath("C:/x.md")).toBe(false)
    expect(isWorkspaceSafePath("~/x.md")).toBe(false)
    expect(isWorkspaceSafePath("https://x/y.md")).toBe(false)
    expect(isWorkspaceSafePath("a//b.md")).toBe(false)
    expect(isWorkspaceSafePath("")).toBe(false)
  })
})
