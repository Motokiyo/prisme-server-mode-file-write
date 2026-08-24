import { Dialog } from "@opencode-ai/ui/dialog"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { Keybind } from "@opencode-ai/ui/keybind"
import { List, type ListRef } from "@opencode-ai/ui/list"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { getDirectory, getFilename } from "@opencode-ai/core/util/path"
import { createMemo, createSignal, lazy, Match, Show, Switch } from "solid-js"
import { formatKeybind } from "@/context/command"
import { useServerSDK } from "@/context/server-sdk"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { useSessionLayout } from "@/pages/session/session-layout"
import { decode64 } from "@/utils/base64"
import { getRelativeTime } from "@/utils/time"
import {
  createCommandPaletteFileEntry,
  createCommandPaletteFileOpener,
  createCommandPaletteModel,
  uniqueCommandPaletteEntries,
  type CommandPaletteEntry,
} from "./command-palette"
import { DialogCommandPaletteV2 } from "./dialog-command-palette-v2"

const DialogSelectFileV2 = lazy(() =>
  import("./dialog-select-directory-v2").then((module) => ({ default: module.DialogSelectDirectoryV2 })),
)
type DialogSelectFileMode = "all" | "files"

const ENTRY_LIMIT = 5
const COMMON_COMMAND_IDS = [
  "session.new",
  "workspace.new",
  "session.previous",
  "session.next",
  "terminal.toggle",
  "review.toggle",
] as const

const uniqueEntries = (items: Entry[]) => {
  const seen = new Set<string>()
  const out: Entry[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

const createCommandEntry = (option: CommandOption, category: string): Entry => ({
  id: "command:" + option.id,
  type: "command",
  title: option.title,
  description: option.description,
  keybind: option.keybind,
  category,
  option,
})

const createFileEntry = (path: string, category: string): Entry => ({
  id: "file:" + path,
  type: "file",
  title: path,
  category,
  path,
})

const createSessionEntry = (
  input: {
    directory: string
    id: string
    title: string
    description: string
    archived?: number
    updated?: number
  },
  category: string,
): Entry => ({
  id: `session:${input.directory}:${input.id}`,
  type: "session",
  title: input.title,
  description: input.description,
  category,
  directory: input.directory,
  sessionID: input.id,
  archived: input.archived,
  updated: input.updated,
})

function createCommandEntries(props: {
  filesOnly: () => boolean
  command: ReturnType<typeof useCommand>
  language: ReturnType<typeof useLanguage>
}) {
  const allowed = createMemo(() => {
    if (props.filesOnly()) return []
    return props.command.options.filter(
      (option) => !option.disabled && !option.id.startsWith("suggested.") && option.id !== "file.open",
    )
  })

  const list = createMemo(() => {
    const category = props.language.t("palette.group.commands")
    return allowed().map((option) => createCommandEntry(option, category))
  })

  const picks = createMemo(() => {
    const all = allowed()
    const order = new Map<string, number>(COMMON_COMMAND_IDS.map((id, index) => [id, index]))
    const picked = all.filter((option) => order.has(option.id))
    const base = picked.length ? picked : all.slice(0, ENTRY_LIMIT)
    const sorted = picked.length ? [...base].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) : base
    const category = props.language.t("palette.group.commands")
    return sorted.map((option) => createCommandEntry(option, category))
  })

  return { allowed, list, picks }
}

function createFileEntries(props: {
  file: ReturnType<typeof useFile>
  tabs: () => ReturnType<ReturnType<typeof useLayout>["tabs"]>
  language: ReturnType<typeof useLanguage>
}) {
  const tabState = createSessionTabs({
    tabs: props.tabs,
    pathFromTab: props.file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? props.file.tab(tab) : tab),
  })
  const recent = createMemo(() => {
    const all = tabState.openedTabs()
    const active = tabState.activeFileTab()
    const order = active ? [active, ...all.filter((item) => item !== active)] : all
    const seen = new Set<string>()
    const category = props.language.t("palette.group.files")
    const items: Entry[] = []

    for (const item of order) {
      const path = props.file.pathFromTab(item)
      if (!path) continue
      if (seen.has(path)) continue
      seen.add(path)
      items.push(createFileEntry(path, category))
    }

    return items.slice(0, ENTRY_LIMIT)
  })

  const root = createMemo(() => {
    const category = props.language.t("palette.group.files")
    const nodes = props.file.tree.children("")
    const paths = nodes
      .filter((node) => node.type === "file")
      .map((node) => node.path)
      .sort((a, b) => a.localeCompare(b))
    return paths.slice(0, ENTRY_LIMIT).map((path) => createFileEntry(path, category))
  })

  return { recent, root }
}

function createSessionEntries(props: {
  workspaces: () => string[]
  label: (directory: string) => string
  globalSDK: ReturnType<typeof useGlobalSDK>
  language: ReturnType<typeof useLanguage>
}) {
  const state: {
    token: number
    inflight: Promise<Entry[]> | undefined
    cached: Entry[] | undefined
  } = {
    token: 0,
    inflight: undefined,
    cached: undefined,
  }

  const sessions = (text: string) => {
    const query = text.trim()
    if (!query) {
      state.token += 1
      state.inflight = undefined
      state.cached = undefined
      return [] as Entry[]
    }

    if (state.cached) return state.cached
    if (state.inflight) return state.inflight

    const current = state.token
    const dirs = props.workspaces()
    if (dirs.length === 0) return [] as Entry[]

    state.inflight = Promise.all(
      dirs.map((directory) => {
        const description = props.label(directory)
        return props.globalSDK.client.session
          .list({ directory, roots: true })
          .then((x) =>
            (x.data ?? [])
              .filter((s) => !!s?.id)
              .map((s) => ({
                id: s.id,
                title: s.title ?? props.language.t("command.session.new"),
                description,
                directory,
                archived: s.time?.archived,
                updated: s.time?.updated,
              })),
          )
          .catch(
            () =>
              [] as {
                id: string
                title: string
                description: string
                directory: string
                archived?: number
                updated?: number
              }[],
          )
      }),
    )
      .then((results) => {
        if (state.token !== current) return [] as Entry[]
        const seen = new Set<string>()
        const category = props.language.t("command.category.session")
        const next = results
          .flat()
          .filter((item) => {
            const key = `${item.directory}:${item.id}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map((item) => createSessionEntry(item, category))
        state.cached = next
        return next
      })
      .catch(() => [] as Entry[])
      .finally(() => {
        state.inflight = undefined
      })

    return state.inflight
  }

  return { sessions }
}

export function DialogSelectFile(props: {
  mode?: DialogSelectFileMode
  onOpenFile?: (path: string) => void
  initialQuery?: string
}) {
  const command = useCommand()
  const language = useLanguage()
  const layout = useLayout()
  const file = useFile()
  const dialog = useDialog()
  const navigate = useNavigate()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const { params, tabs, view } = useSessionLayout()
export function DialogSelectFile(props: { mode?: DialogSelectFileMode; onOpenFile?: (path: string) => void }) {
  const platform = usePlatform()
  const settings = useSettings()
  const filesOnly = () => props.mode === "files"

  if (!filesOnly() && settings.general.newLayoutDesigns()) {
    return <DialogCommandPaletteV2 onOpenFile={props.onOpenFile} />
  }

  if (filesOnly() && platform.platform === "desktop" && settings.general.newLayoutDesigns()) {
    return <DialogSelectFileDesktopV2 onOpenFile={props.onOpenFile} />
  }

  return <DialogSelectFileLegacy filesOnly={filesOnly} onOpenFile={props.onOpenFile} />
}

function DialogSelectFileDesktopV2(props: { onOpenFile?: (path: string) => void }) {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const { params } = useSessionLayout()
  const projectDirectory = createMemo(() => decode64(params.dir) ?? "")
  const openFile = createCommandPaletteFileOpener(props.onOpenFile)

  return (
    <DialogSelectFileV2
      server={serverSDK().server}
      mode="file"
      start={projectDirectory()}
      title={language.t("session.header.searchFiles")}
      onSelect={(result) => {
        if (typeof result !== "string") return
        openFile(result)
      }}
    />
  )
}

function DialogSelectFileLegacy(props: { filesOnly: () => boolean; onOpenFile?: (path: string) => void }) {
  const palette = createCommandPaletteModel(props)
  const [grouped, setGrouped] = createSignal(false)

  const items = async (text: string) => {
    const query = text.trim()
    setGrouped(query.length > 0)

    if (!query && props.filesOnly()) {
      const loaded = palette.file.tree.state("")?.loaded
      const pending = loaded ? Promise.resolve() : palette.file.tree.list("")
      const next = uniqueCommandPaletteEntries([...palette.recentFileEntries(), ...palette.rootFileEntries()])

      if (loaded || next.length > 0) {
        void pending
        return next
      }

      await pending
      return uniqueCommandPaletteEntries([...palette.recentFileEntries(), ...palette.rootFileEntries()])
    }

    if (!query) return [...palette.preferredCommandEntries(), ...palette.recentFileEntries()]

    if (props.filesOnly()) {
      const files = await palette.file.searchFiles(query)
      const category = palette.language.t("palette.group.files")
      return files.map((path) => createCommandPaletteFileEntry(path, category))
    }

    const [files, nextSessions] = await Promise.all([
      palette.file.searchFiles(query),
      Promise.resolve(palette.sessions(query)),
    ])
    const category = palette.language.t("palette.group.files")
    const entries = files.map((path) => createCommandPaletteFileEntry(path, category))
    return [...palette.commandEntries(), ...nextSessions, ...entries]
  }

  const handleMove = (item: Entry | undefined) => {
    state.cleanup?.()
    if (!item) return
    if (item.type !== "command") return
    state.cleanup = item.option?.onHighlight?.()
  }

  const open = (path: string) => {
    const value = file.tab(path)
    void tabs().open(value)
    void file.load(path)
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
    layout.fileTree.setTab("all")
    props.onOpenFile?.(path)
    tabs().setActive(value)
  }

  const handleSelect = (item: Entry | undefined) => {
    if (!item) return
    state.committed = true
    state.cleanup = undefined
    dialog.close()

    if (item.type === "command") {
      item.option?.onSelect?.("palette")
      return
    }

    if (item.type === "session") {
      if (!item.directory || !item.sessionID) return
      navigate(`/${base64Encode(item.directory)}/session/${item.sessionID}`)
      return
    }

    if (!item.path) return
    open(item.path)
  }

  onCleanup(() => {
    if (state.committed) return
    state.cleanup?.()
  })

  const applyInitialQuery = (ref: ListRef) => {
    const query = props.initialQuery?.trim()
    if (!query) return
    // Pre-fill the search so the palette opens scoped to the referenced name,
    // while staying fully editable by the user.
    queueMicrotask(() => ref.setFilter(query))
  }

  return (
    <Dialog class="pt-3 pb-0 !max-h-[480px]" transition>
      <List
        ref={applyInitialQuery}
  return (
    <Dialog class="pt-3 pb-0 !max-h-[480px]" transition>
      <List
        class="px-3"
        search={{
          placeholder: props.filesOnly()
            ? palette.language.t("session.header.searchFiles")
            : palette.language.t("palette.search.placeholder"),
          autofocus: true,
          hideIcon: true,
        }}
        emptyMessage={palette.language.t("palette.empty")}
        loadingMessage={palette.language.t("common.loading")}
        items={items}
        key={(item) => item.id}
        filterKeys={["title", "description", "category"]}
        skipFilter={(item) => item.type === "file"}
        groupBy={grouped() ? (item) => item.category : () => ""}
        onMove={(item: CommandPaletteEntry | undefined) => palette.highlight(item)}
        onSelect={(item: CommandPaletteEntry | undefined) => palette.select(item)}
      >
        {(item) => (
          <Switch
            fallback={
              <div class="w-full flex items-center justify-between rounded-md pl-1">
                <div class="flex items-center gap-x-3 grow min-w-0">
                  <FileIcon node={{ path: item.path ?? "", type: "file" }} class="shrink-0 size-4" />
                  <div class="flex items-center text-14-regular">
                    <span class="text-text-weak whitespace-nowrap overflow-hidden overflow-ellipsis truncate min-w-0">
                      {getDirectory(item.path ?? "")}
                    </span>
                    <span class="text-text-strong whitespace-nowrap">{getFilename(item.path ?? "")}</span>
                  </div>
                </div>
              </div>
            }
          >
            <Match when={item.type === "command"}>
              <div class="w-full flex items-center justify-between gap-4">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-14-regular text-text-strong whitespace-nowrap">{item.title}</span>
                  <Show when={item.description}>
                    <span class="text-14-regular text-text-weak truncate">{item.description}</span>
                  </Show>
                </div>
                <Show when={item.keybind}>
                  <Keybind class="rounded-[4px]">{formatKeybind(item.keybind ?? "", palette.language.t)}</Keybind>
                </Show>
              </div>
            </Match>
            <Match when={item.type === "session"}>
              <div class="w-full flex items-center justify-between rounded-md pl-1">
                <div class="flex items-center gap-x-3 grow min-w-0">
                  <Icon name="bubble-5" size="small" class="shrink-0 text-icon-weak" />
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="text-14-regular text-text-strong truncate"
                      classList={{ "opacity-70": !!item.archived }}
                    >
                      {item.title}
                    </span>
                    <Show when={item.description}>
                      <span
                        class="text-14-regular text-text-weak truncate"
                        classList={{ "opacity-70": !!item.archived }}
                      >
                        {item.description}
                      </span>
                    </Show>
                  </div>
                </div>
                <Show when={item.updated}>
                  <span class="text-12-regular text-text-weak whitespace-nowrap ml-2">
                    {getRelativeTime(new Date(item.updated!).toISOString(), palette.language.t)}
                  </span>
                </Show>
              </div>
            </Match>
          </Switch>
        )}
      </List>
    </Dialog>
  )
}
