import { createMemo, createSignal, Show, createEffect, on } from "solid-js"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { MarkdownEditor } from "./markdown-editor"

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"])

function getExtension(path: string) {
  const last = path.lastIndexOf(".")
  if (last === -1) return ""
  return path.slice(last + 1).toLowerCase()
}

function joinAbsolute(scope: string, relative: string) {
  if (!scope) return relative
  if (scope.endsWith("/") || scope.endsWith("\\")) return scope + relative
  if (relative.startsWith("/") || relative.startsWith("\\")) return scope + relative
  return scope + "/" + relative
}

export interface FileEditorProps {
  path: string
  initialContent: string
}

export function FileEditor(props: FileEditorProps) {
  const sdk = useSDK()
  const ext = createMemo(() => getExtension(props.path))
  const isMarkdown = createMemo(() => MARKDOWN_EXTENSIONS.has(ext()))
  const absolutePath = createMemo(() => joinAbsolute(sdk.directory, props.path))

  const [dirty, setDirty] = createSignal(false)
  const [savingState, setSavingState] = createSignal<"idle" | "saving" | "saved" | "error">("idle")
  const [draft, setDraft] = createSignal(props.initialContent)

  createEffect(
    on(
      () => props.path,
      () => {
        setDraft(props.initialContent)
        setDirty(false)
        setSavingState("idle")
      },
      { defer: true },
    ),
  )

  let saveTimer: number | undefined

  const persist = async (content: string) => {
    setSavingState("saving")
    try {
      await writeTextFile(absolutePath(), content)
      setSavingState("saved")
      setDirty(false)
    } catch (err) {
      setSavingState("error")
      showToast({
        variant: "error",
        title: "Failed to save file",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const scheduleSave = (content: string) => {
    setDraft(content)
    setDirty(true)
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined
      void persist(content)
    }, 600)
  }

  const statusLabel = () => {
    if (savingState() === "saving") return "Saving..."
    if (savingState() === "error") return "Save failed"
    if (dirty()) return "Unsaved"
    if (savingState() === "saved") return "Saved"
    return ""
  }

  return (
    <div class="file-editor relative h-full flex flex-col">
      <Show when={statusLabel()}>
        <div class="absolute top-1 right-3 z-20 px-2 py-0.5 text-11-regular text-text-weak rounded">
          {statusLabel()}
        </div>
      </Show>
      <Show
        when={isMarkdown()}
        fallback={
          <textarea
            class="flex-1 w-full p-6 outline-none bg-background-base text-text-base resize-none"
            style={{ "font-family": "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)", "font-size": "13px", "line-height": "1.6" }}
            value={draft()}
            onInput={(e) => scheduleSave(e.currentTarget.value)}
            spellcheck={false}
          />
        }
      >
        <MarkdownEditor content={draft()} onChange={(md) => scheduleSave(md)} />
      </Show>
    </div>
  )
}
