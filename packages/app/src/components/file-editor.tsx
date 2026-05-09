import { createMemo, createSignal, Show, onCleanup, onMount } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { usePlatform } from "@/context/platform"
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

interface SingleEditorProps {
  path: string
  initialContent: string
  absolutePath: string
  isMarkdown: boolean
}

function SingleFileEditor(props: SingleEditorProps) {
  const platform = usePlatform()
  const [dirty, setDirty] = createSignal(false)
  const [savingState, setSavingState] = createSignal<"idle" | "saving" | "saved" | "error">("idle")

  let saveTimer: number | undefined
  let latest = props.initialContent

  const persist = async (content: string) => {
    setSavingState("saving")
    try {
      if (!platform.writeTextFile) throw new Error("This platform cannot write files.")
      await platform.writeTextFile(props.absolutePath, content)
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
    if (!props.isMarkdown) return
    latest = content
    setDirty(true)
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined
      void persist(latest)
    }, 800)
  }

  const flushSave = () => {
    if (!props.isMarkdown || !dirty()) return
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
      saveTimer = undefined
    }
    void persist(latest)
  }

  onMount(() => {
    window.addEventListener("beforeunload", flushSave)
  })

  onCleanup(() => {
    window.removeEventListener("beforeunload", flushSave)
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
      saveTimer = undefined
    }
    if (props.isMarkdown && dirty()) void persist(latest)
  })

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
        <div class="absolute top-1 right-3 z-20 px-2 py-0.5 text-11-regular text-text-weak rounded pointer-events-none">
          {statusLabel()}
        </div>
      </Show>
      <Show
        when={props.isMarkdown}
        fallback={
          <textarea
            class="flex-1 w-full p-6 outline-none bg-background-base text-text-base resize-none"
            style={{
              "font-family": "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              "font-size": "13px",
              "line-height": "1.6",
            }}
            value={props.initialContent}
            onInput={(e) => scheduleSave(e.currentTarget.value)}
            readonly
            spellcheck={false}
          />
        }
      >
        <MarkdownEditor initialContent={props.initialContent} onChange={(md) => scheduleSave(md)} />
      </Show>
    </div>
  )
}

export function FileEditor(props: FileEditorProps) {
  const sdk = useSDK()
  const ext = createMemo(() => getExtension(props.path))
  const isMarkdown = createMemo(() => MARKDOWN_EXTENSIONS.has(ext()))
  const absolutePath = createMemo(() => joinAbsolute(sdk.directory, props.path))

  return (
    <Show when={props.path} keyed>
      {(path) => (
        <SingleFileEditor
          path={path}
          initialContent={props.initialContent}
          absolutePath={absolutePath()}
          isMarkdown={isMarkdown()}
        />
      )}
    </Show>
  )
}
