import { describe, expect, test } from "bun:test"
import { artifactKindFromPath } from "./artifact-kind"

describe("artifactKindFromPath", () => {
  test("detects common artifact types", () => {
    expect(artifactKindFromPath("note.md")).toBe("markdown")
    expect(artifactKindFromPath("brief.pdf")).toBe("pdf")
    expect(artifactKindFromPath("image.png")).toBe("image")
    expect(artifactKindFromPath("voice.mp3")).toBe("audio")
    expect(artifactKindFromPath("demo.mp4")).toBe("video")
    expect(artifactKindFromPath("flow.mmd")).toBe("diagram")
    expect(artifactKindFromPath("graph.dot")).toBe("diagram")
    expect(artifactKindFromPath("src/main.ts")).toBe("text")
    expect(artifactKindFromPath("archive.zip")).toBe("binary")
  })

  test("falls back to MIME type when the extension is not useful", () => {
    expect(artifactKindFromPath("download", "application/pdf")).toBe("pdf")
    expect(artifactKindFromPath("asset.bin", "image/png")).toBe("image")
    expect(artifactKindFromPath("recording", "audio/mpeg")).toBe("audio")
    expect(artifactKindFromPath("payload", "application/json; charset=utf-8")).toBe("text")
  })
})
