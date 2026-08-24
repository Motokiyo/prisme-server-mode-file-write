import { describe, expect, test } from "bun:test"
import { createMemo, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import {
  createOpenFileReference,
  SESSION_OPEN_FILE_TAB,
  createOpenReviewFile,
  createOpenSessionFileTab,
  createSessionTabs,
  focusTerminalById,
  getTabReorderIndex,
  isTraversalPath,
  shouldShowFileTree,
} from "./helpers"
import type { FileReference } from "@opencode-ai/ui/context/file-reference"

describe("shouldShowFileTree", () => {
  test("does not reserve space for a disabled file tree", () => {
    expect(shouldShowFileTree({ visible: false, opened: true })).toBe(false)
    expect(shouldShowFileTree({ visible: true, opened: true })).toBe(true)
  })
})

describe("createOpenReviewFile", () => {
  test("opens and loads selected review file", () => {
    const calls: string[] = []
    const openReviewFile = createOpenReviewFile({
      showAllFiles: () => calls.push("show"),
      tabForPath: (path) => {
        calls.push(`tab:${path}`)
        return `file://${path}`
      },
      openTab: (tab) => calls.push(`open:${tab}`),
      setActive: (tab) => calls.push(`active:${tab}`),
      loadFile: (path) => calls.push(`load:${path}`),
    })

    openReviewFile("src/a.ts")

    expect(calls).toEqual(["show", "load:src/a.ts", "tab:src/a.ts", "open:file://src/a.ts", "active:file://src/a.ts"])
  })
})

describe("createOpenSessionFileTab", () => {
  test("activates the opened file tab", () => {
    const calls: string[] = []
    const openTab = createOpenSessionFileTab({
      normalizeTab: (value) => {
        calls.push(`normalize:${value}`)
        return `file://${value}`
      },
      openTab: (tab) => calls.push(`open:${tab}`),
      pathFromTab: (tab) => {
        calls.push(`path:${tab}`)
        return tab.slice("file://".length)
      },
      loadFile: (path) => calls.push(`load:${path}`),
      openReviewPanel: () => calls.push("review"),
      setActive: (tab) => calls.push(`active:${tab}`),
    })

    openTab("src/a.ts")

    expect(calls).toEqual([
      "normalize:src/a.ts",
      "open:file://src/a.ts",
      "path:file://src/a.ts",
      "load:src/a.ts",
      "review",
      "active:file://src/a.ts",
    ])
  })
})

describe("focusTerminalById", () => {
  test("focuses textarea when present", () => {
    document.body.innerHTML = `<div id="terminal-wrapper-one"><div data-component="terminal"><textarea></textarea></div></div>`

    const focused = focusTerminalById("one")

    expect(focused).toBe(true)
    expect(document.activeElement?.tagName).toBe("TEXTAREA")
  })

  test("falls back to terminal element focus", () => {
    document.body.innerHTML = `<div id="terminal-wrapper-two"><div data-component="terminal" tabindex="0"></div></div>`
    const terminal = document.querySelector('[data-component="terminal"]') as HTMLElement
    let pointerDown = false
    terminal.addEventListener("pointerdown", () => {
      pointerDown = true
    })

    const focused = focusTerminalById("two")

    expect(focused).toBe(true)
    expect(document.activeElement).toBe(terminal)
    expect(pointerDown).toBe(true)
  })
})

describe("getTabReorderIndex", () => {
  test("returns target index for valid drag reorder", () => {
    expect(getTabReorderIndex(["a", "b", "c"], "a", "c")).toBe(2)
  })

  test("returns undefined for unknown droppable id", () => {
    expect(getTabReorderIndex(["a", "b", "c"], "a", "missing")).toBeUndefined()
  })
})

describe("createSessionTabs", () => {
  test("normalizes the effective file tab", () => {
    createRoot((dispose) => {
      const [state] = createStore({
        active: undefined as string | undefined,
        all: ["file://src/a.ts", "context"],
      })
      const tabs = createMemo(() => ({ active: () => state.active, all: () => state.all }))
      const result = createSessionTabs({
        tabs,
        pathFromTab: (tab) => (tab.startsWith("file://") ? tab.slice("file://".length) : undefined),
        normalizeTab: (tab) => (tab.startsWith("file://") ? `norm:${tab.slice("file://".length)}` : tab),
      })

      expect(result.activeTab()).toBe("norm:src/a.ts")
      expect(result.activeFileTab()).toBe("norm:src/a.ts")
      expect(result.closableTab()).toBe("norm:src/a.ts")
      dispose()
    })
  })

  test("prefers context and review fallbacks when no file tab is active", () => {
    createRoot((dispose) => {
      const [state] = createStore({
        active: undefined as string | undefined,
        all: ["context"],
      })
      const tabs = createMemo(() => ({ active: () => state.active, all: () => state.all }))
      const result = createSessionTabs({
        tabs,
        pathFromTab: () => undefined,
        normalizeTab: (tab) => tab,
        review: () => true,
        hasReview: () => true,
      })

      expect(result.activeTab()).toBe("context")
      expect(result.closableTab()).toBe("context")
      dispose()
    })

    createRoot((dispose) => {
      const [state] = createStore({
        active: undefined as string | undefined,
        all: [],
      })
      const tabs = createMemo(() => ({ active: () => state.active, all: () => state.all }))
      const result = createSessionTabs({
        tabs,
        pathFromTab: () => undefined,
        normalizeTab: (tab) => tab,
        review: () => true,
        hasReview: () => true,
      })

      expect(result.activeTab()).toBe("review")
      expect(result.activeFileTab()).toBeUndefined()
      expect(result.closableTab()).toBeUndefined()
      dispose()
    })
  })

  test("exposes the Open File tab without treating it as a file tab", () => {
    createRoot((dispose) => {
      const [state] = createStore({
        active: SESSION_OPEN_FILE_TAB as string | undefined,
        all: ["file://src/a.ts", SESSION_OPEN_FILE_TAB],
      })
      const tabs = createMemo(() => ({ active: () => state.active, all: () => state.all }))
      const result = createSessionTabs({
        tabs,
        pathFromTab: (tab) => (tab.startsWith("file://") ? tab.slice("file://".length) : undefined),
        normalizeTab: (tab) => tab,
        fileBrowser: () => true,
      })

      expect(result.openFileOpen()).toBe(true)
      expect(result.panelTabs()).toEqual(["file://src/a.ts", SESSION_OPEN_FILE_TAB])
      expect(result.openedTabs()).toEqual(["file://src/a.ts"])
      expect(result.activeTab()).toBe(SESSION_OPEN_FILE_TAB)
      expect(result.activeFileTab()).toBeUndefined()
      expect(result.closableTab()).toBe(SESSION_OPEN_FILE_TAB)
      dispose()
    })
  })

  test("hides the Open File placeholder when the file browser is unavailable", () => {
    createRoot((dispose) => {
      const [state] = createStore({
        active: SESSION_OPEN_FILE_TAB as string | undefined,
        all: ["file://src/a.ts", SESSION_OPEN_FILE_TAB],
      })
      const tabs = createMemo(() => ({ active: () => state.active, all: () => state.all }))
      const result = createSessionTabs({
        tabs,
        pathFromTab: (tab) => (tab.startsWith("file://") ? tab.slice("file://".length) : undefined),
        normalizeTab: (tab) => tab,
        fileBrowser: () => false,
      })

      expect(result.openFileOpen()).toBe(false)
      expect(result.panelTabs()).toEqual(["file://src/a.ts"])
      expect(result.activeTab()).toBe("file://src/a.ts")
      dispose()
    })
  })
})

describe("isTraversalPath", () => {
  test("flags traversal and empty paths", () => {
    expect(isTraversalPath("")).toBe(true)
    expect(isTraversalPath("..")).toBe(true)
    expect(isTraversalPath("../secret.md")).toBe(true)
    expect(isTraversalPath("a/../b.md")).toBe(true)
    expect(isTraversalPath("a/..")).toBe(true)
  })

  test("allows clean workspace paths", () => {
    expect(isTraversalPath("notes/x.md")).toBe(false)
    expect(isTraversalPath("x.md")).toBe(false)
    expect(isTraversalPath("a/b/c.json")).toBe(false)
  })
})

describe("createOpenFileReference", () => {
  const pathRef = (value: string): FileReference => ({
    kind: "path",
    value,
    basename: value.slice(value.lastIndexOf("/") + 1),
    extension: value.slice(value.lastIndexOf(".") + 1),
  })
  const nameRef = (value: string): FileReference => ({
    kind: "name",
    value,
    basename: value,
    extension: value.slice(value.lastIndexOf(".") + 1),
  })

  const harness = (search: (q: string) => Promise<string[]>) => {
    const calls: string[] = []
    const open = createOpenFileReference({
      normalize: (p) => p, // identity: detector already produced a normalized path
      open: (p) => calls.push(`open:${p}`),
      search,
      notFound: () => calls.push("notFound"),
      showPicker: (q) => calls.push(`picker:${q}`),
    })
    return { calls, open }
  }

  test("opens a relative path directly without searching", async () => {
    const { calls, open } = harness(async () => {
      calls.push("search-should-not-run")
      return []
    })
    await open(pathRef("notes/x.md"))
    expect(calls).toEqual(["open:notes/x.md"])
  })

  test("reports notFound when a path normalizes to traversal", async () => {
    const calls: string[] = []
    const open = createOpenFileReference({
      normalize: () => "../secret.md", // simulate a normalize that yields traversal
      open: (p) => calls.push(`open:${p}`),
      search: async () => [],
      notFound: () => calls.push("notFound"),
      showPicker: (q) => calls.push(`picker:${q}`),
    })
    await open(pathRef("notes/x.md"))
    expect(calls).toEqual(["notFound"])
  })

  test("opens the single match for a bare name", async () => {
    const { calls, open } = harness(async () => ["docs/un.pdf"])
    await open(nameRef("un.pdf"))
    expect(calls).toEqual(["open:docs/un.pdf"])
  })

  test("opens the picker pre-filtered when multiple matches", async () => {
    const { calls, open } = harness(async () => ["a/un.pdf", "b/un.pdf"])
    await open(nameRef("un.pdf"))
    expect(calls).toEqual(["picker:un.pdf"])
  })

  test("reports notFound when no matches for a bare name", async () => {
    const { calls, open } = harness(async () => [])
    await open(nameRef("missing.pdf"))
    expect(calls).toEqual(["notFound"])
  })

  test("ignores empty entries returned by search", async () => {
    const { calls, open } = harness(async () => ["", "only/real.md"])
    await open(nameRef("real.md"))
    expect(calls).toEqual(["open:only/real.md"])
  })
})
