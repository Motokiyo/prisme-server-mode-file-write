import type { FileContent } from "@opencode-ai/sdk/v2"
import { getFilename } from "@opencode-ai/core/util/path"
import { sampledChecksum } from "@opencode-ai/core/util/encode"
import { Button } from "@opencode-ai/ui/button"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import pdfWorkerURL from "pdfjs-dist/build/pdf.worker.mjs?url"
import { FileEditor } from "@/components/file-editor"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { artifactKindFromPath, type ArtifactKind } from "@/pages/session/artifact-kind"
import "./artifact-viewer.css"

type DiagramNode = {
  id: string
  label: string
  x: number
  y: number
}

type DiagramEdge = {
  from: string
  to: string
}

function binaryStringToBytes(binary: string) {
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function dataURLToBytes(dataURL: string) {
  const [header, payload] = dataURL.split(",", 2)
  if (!header || !payload) return
  const raw = header.includes(";base64") ? atob(payload) : decodeURIComponent(payload)
  return {
    mime: header.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream",
    bytes: binaryStringToBytes(raw),
  }
}

function dataURLToBlobURL(dataURL: string) {
  const data = dataURLToBytes(dataURL)
  if (!data) return
  return URL.createObjectURL(new Blob([data.bytes], { type: data.mime }))
}

function contentToBlobURL(content: FileContent | undefined, fallbackMime: string) {
  if (!content?.content) return
  if (content.content.startsWith("data:")) return dataURLToBlobURL(content.content)

  const mime = content.mimeType ?? fallbackMime
  if (content.encoding === "base64") {
    const bytes = binaryStringToBytes(atob(content.content))
    return URL.createObjectURL(new Blob([bytes], { type: mime }))
  }

  return URL.createObjectURL(new Blob([content.content], { type: mime }))
}

function contentToBytes(content: FileContent | undefined) {
  if (!content?.content) return
  if (content.content.startsWith("data:")) return dataURLToBytes(content.content)?.bytes
  if (content.encoding === "base64") return binaryStringToBytes(atob(content.content))
  return new TextEncoder().encode(content.content)
}

function mimeForKind(kind: ArtifactKind) {
  if (kind === "pdf") return "application/pdf"
  if (kind === "image") return "image/*"
  if (kind === "audio") return "audio/*"
  if (kind === "video") return "video/*"
  return "application/octet-stream"
}

function kindLabel(kind: ArtifactKind) {
  if (kind === "markdown") return "Markdown"
  if (kind === "pdf") return "PDF"
  if (kind === "image") return "Image"
  if (kind === "audio") return "Audio"
  if (kind === "video") return "Video"
  if (kind === "diagram") return "Diagram"
  if (kind === "text") return "Text"
  return "Binary"
}

function iconForKind(kind: ArtifactKind): Parameters<typeof Icon>[0]["name"] {
  if (kind === "image") return "photo"
  if (kind === "text" || kind === "diagram" || kind === "markdown") return "code-lines"
  if (kind === "binary") return "archive"
  return "open-file"
}

function contentBytes(content: FileContent | undefined) {
  if (!content?.content) return
  if (content.encoding === "base64") return Math.floor((content.content.length * 3) / 4)
  if (typeof TextEncoder === "function") return new TextEncoder().encode(content.content).byteLength
  return content.content.length
}

function formatBytes(value: number | undefined) {
  if (value === undefined) return
  if (value < 1024) return `${value} B`
  const units = ["KB", "MB", "GB"]
  let next = value / 1024
  for (const unit of units) {
    if (next < 1024) return `${next.toFixed(next >= 10 ? 0 : 1)} ${unit}`
    next = next / 1024
  }
  return `${next.toFixed(1)} TB`
}

function ArtifactHeader(props: {
  path: string
  kind: ArtifactKind
  content?: FileContent
  loading?: boolean
  controls?: JSX.Element
  onReload: () => void
}) {
  const filename = createMemo(() => getFilename(props.path))
  const size = createMemo(() => formatBytes(contentBytes(props.content)))
  return (
    <div class="artifact-toolbar">
      <div class="artifact-title">
        <Icon name={iconForKind(props.kind)} size="small" class="text-icon-weak-base shrink-0" />
        <div class="artifact-title-text">
          <div class="artifact-title-name">{filename()}</div>
          <div class="artifact-title-meta">
            <span>{kindLabel(props.kind)}</span>
            <Show when={props.content?.mimeType}>
              {(mime) => <span>{mime()}</span>}
            </Show>
            <Show when={size()}>
              {(value) => <span>{value()}</span>}
            </Show>
            <Show when={props.loading}>
              <span>Loading</span>
            </Show>
          </div>
        </div>
      </div>
      <div class="artifact-toolbar-actions">
        {props.controls}
        <IconButton icon="reset" variant="ghost" aria-label="Reload artifact" onClick={props.onReload} />
      </div>
    </div>
  )
}

function BinaryFallback(props: { path: string; content?: FileContent }) {
  const filename = createMemo(() => getFilename(props.path))
  const size = createMemo(() => formatBytes(contentBytes(props.content)))
  return (
    <div class="artifact-empty">
      <Icon name="open-file" class="size-8 text-text-weak" />
      <div class="text-14-medium text-text-base">{filename()}</div>
      <div class="text-12-regular text-text-weak">
        {props.content?.mimeType ?? size() ?? "This file cannot be previewed yet."}
      </div>
    </div>
  )
}

function TextPreview(props: { path?: string; content: string }) {
  const fileComponent = useFileComponent()
  const cacheKey = createMemo(() => sampledChecksum(props.content))

  return (
    <Show
      when={props.path}
      fallback={
        <div class="artifact-text-preview">
          <pre>{props.content}</pre>
        </div>
      }
    >
      {(path) => (
        <div class="artifact-file-preview">
          <Dynamic
            component={fileComponent}
            mode="text"
            file={{
              name: path(),
              contents: props.content,
              cacheKey: cacheKey(),
            }}
            class="select-text"
          />
        </div>
      )}
    </Show>
  )
}

function parseDiagramNode(raw: string) {
  const value = raw.trim().replace(/^["']|["']$/g, "")
  const match = value.match(/^([A-Za-z0-9_:-]+)(?:\[(.+?)\]|\((.+?)\)|\{(.+?)\})?$/)
  if (!match) return { id: value, label: value }
  return {
    id: match[1],
    label: match[2] ?? match[3] ?? match[4] ?? match[1],
  }
}

function parseSimpleMermaid(source: string) {
  const nodes = new Map<string, { id: string; label: string }>()
  const edges: DiagramEdge[] = []
  const lines = source.replaceAll(";", "\n").split("\n")

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith("%%") || line.startsWith("//") || line.startsWith("@")) continue
    if (/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt)\b/i.test(line)) continue
    const match = line.match(/^(.+?)\s*(?:-->|---?>|->|--|==>|-.->|->>|-->>)\s*(?:\|[^|]*\|\s*)?(.+?)\s*$/)
    if (!match) continue
    const from = parseDiagramNode(match[1])
    const to = parseDiagramNode(match[2].replace(/:.+$/, ""))
    if (!from.id || !to.id) continue
    nodes.set(from.id, from)
    nodes.set(to.id, to)
    edges.push({ from: from.id, to: to.id })
  }

  const ordered = Array.from(nodes.values()).slice(0, 32)
  const positioned: DiagramNode[] = ordered.map((node, index) => ({
    ...node,
    x: index % 2 === 0 ? 90 : 350,
    y: 48 + Math.floor(index / 2) * 86,
  }))
  return { nodes: positioned, edges: edges.slice(0, 48) }
}

function FallbackDiagramPreview(props: { path: string; content: string }) {
  const diagram = createMemo(() => parseSimpleMermaid(props.content))
  const byID = createMemo(() => new Map(diagram().nodes.map((node) => [node.id, node])))
  const height = createMemo(() => Math.max(260, 120 + Math.ceil(diagram().nodes.length / 2) * 86))
  const family = createMemo(() => {
    const ext = props.path.split(".").pop()?.toLowerCase()
    if (ext === "dot" || ext === "gv") return "Graphviz source"
    if (ext === "puml" || ext === "plantuml") return "PlantUML source"
    return "Mermaid source"
  })

  return (
    <div class="artifact-diagram-preview">
      <Show
        when={diagram().nodes.length > 0}
        fallback={
          <div class="artifact-diagram-source">
            <div class="artifact-diagram-source-title">{family()}</div>
            <TextPreview content={props.content} />
          </div>
        }
      >
        <div class="artifact-diagram-canvas">
          <svg viewBox={`0 0 560 ${height()}`} role="img" aria-label={getFilename(props.path)}>
            <defs>
              <marker id="artifact-diagram-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
              </marker>
            </defs>
            <For each={diagram().edges}>
              {(edge) => {
                const from = createMemo(() => byID().get(edge.from))
                const to = createMemo(() => byID().get(edge.to))
                return (
                  <Show when={from() && to()}>
                    <path
                      class="artifact-diagram-edge"
                      d={`M${from()!.x + 70},${from()!.y + 38} C${from()!.x + 70},${from()!.y + 64} ${to()!.x + 70},${to()!.y - 26} ${to()!.x + 70},${to()!.y}`}
                      marker-end="url(#artifact-diagram-arrow)"
                    />
                  </Show>
                )
              }}
            </For>
            <For each={diagram().nodes}>
              {(node) => (
                <g class="artifact-diagram-node">
                  <rect x={node.x} y={node.y} width="140" height="38" rx="6" />
                  <text x={node.x + 70} y={node.y + 24}>
                    {node.label}
                  </text>
                </g>
              )}
            </For>
          </svg>
        </div>
        <div class="artifact-diagram-source">
          <div class="artifact-diagram-source-title">{family()}</div>
          <TextPreview content={props.content} />
        </div>
      </Show>
    </div>
  )
}

function canRenderMermaid(path: string) {
  const ext = path.split(".").pop()?.toLowerCase()
  return ext === "mmd" || ext === "mermaid"
}

function MermaidDiagramPreview(props: { path: string; content: string }) {
  const [svg, setSvg] = createSignal<string | undefined>()
  const [error, setError] = createSignal<string | undefined>()
  const [loading, setLoading] = createSignal(false)
  let renderVersion = 0

  createEffect(
    on(
      () => [props.path, props.content] as const,
      async ([path, source]) => {
        const version = ++renderVersion
        setSvg(undefined)
        setError(undefined)

        if (!canRenderMermaid(path) || !source.trim()) return

        setLoading(true)
        try {
          const mod = await import("mermaid")
          const mermaid = mod.default
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            fontFamily: "inherit",
          })
          const checksum = sampledChecksum(source) ?? String(source.length)
          const id = `artifact-mermaid-${checksum.replace(/[^a-zA-Z0-9_-]/g, "")}-${version}`
          const result = await mermaid.render(id, source)
          if (version !== renderVersion) return
          setSvg(result.svg)
        } catch (err) {
          if (version !== renderVersion) return
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          if (version === renderVersion) setLoading(false)
        }
      },
      { defer: false },
    ),
  )

  return (
    <Show when={svg()} fallback={<FallbackDiagramPreview path={props.path} content={props.content} />}>
      {(rendered) => (
        <div class="artifact-diagram-preview">
          <div class="artifact-mermaid-canvas">
            <Show when={loading()}>
              <div class="artifact-diagram-status">Rendering</div>
            </Show>
            <div class="artifact-mermaid-svg" innerHTML={rendered()} />
            <Show when={error()}>
              {(message) => <div class="artifact-diagram-status">{message()}</div>}
            </Show>
          </div>
          <div class="artifact-diagram-source">
            <div class="artifact-diagram-source-title">Mermaid source</div>
            <TextPreview content={props.content} />
          </div>
        </div>
      )}
    </Show>
  )
}

function PdfPage(props: {
  document: import("pdfjs-dist").PDFDocumentProxy
  pageNumber: number
  zoom: number
  fitWidth: boolean
  containerWidth: number
}) {
  let canvas: HTMLCanvasElement | undefined
  const [error, setError] = createSignal<string | undefined>()
  let renderVersion = 0
  let renderTask: { cancel: () => void; promise: Promise<unknown> } | undefined

  createEffect(
    on(
      () => [props.document, props.pageNumber, props.zoom, props.fitWidth, props.containerWidth] as const,
      async ([document, pageNumber, zoom, fitWidth, containerWidth]) => {
        const version = ++renderVersion
        const target = canvas
        if (!target) return

        renderTask?.cancel()
        renderTask = undefined
        setError(undefined)

        try {
          const page = await document.getPage(pageNumber)
          if (version !== renderVersion) return
          const base = page.getViewport({ scale: 1 })
          const available = Math.max(240, containerWidth - 48)
          const scale = fitWidth ? available / base.width : zoom
          const viewport = page.getViewport({ scale })
          const context = target.getContext("2d")
          if (!context) return

          const outputScale = Math.max(1, window.devicePixelRatio || 1)
          target.width = Math.floor(viewport.width * outputScale)
          target.height = Math.floor(viewport.height * outputScale)
          target.style.width = `${viewport.width}px`
          target.style.height = `${viewport.height}px`

          context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
          context.clearRect(0, 0, viewport.width, viewport.height)

          renderTask = page.render({ canvas: target, canvasContext: context, viewport })
          await renderTask.promise
        } catch (err) {
          if (version !== renderVersion) return
          if (err instanceof Error && err.name === "RenderingCancelledException") return
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          if (version === renderVersion) renderTask = undefined
        }
      },
      { defer: false },
    ),
  )

  onCleanup(() => {
    renderVersion++
    renderTask?.cancel()
  })

  return (
    <div class="artifact-pdf-page">
      <canvas ref={canvas} />
      <Show when={error()}>
        {(message) => <div class="artifact-diagram-status">{message()}</div>}
      </Show>
    </div>
  )
}

function PdfPreview(props: { content?: FileContent; zoom: number; fitWidth: boolean }) {
  let container: HTMLDivElement | undefined
  const language = useLanguage()
  const [document, setDocument] = createSignal<import("pdfjs-dist").PDFDocumentProxy | undefined>()
  const [error, setError] = createSignal<string | undefined>()
  const [containerWidth, setContainerWidth] = createSignal(0)
  let loadVersion = 0
  let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | undefined

  onMount(() => {
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    observer.observe(container)
    setContainerWidth(container.getBoundingClientRect().width)
    onCleanup(() => observer.disconnect())
  })

  createEffect(
    on(
      () => props.content?.content,
      async () => {
        const version = ++loadVersion
        const bytes = contentToBytes(props.content)
        document()?.destroy()
        loadingTask?.destroy()
        setDocument(undefined)
        setError(undefined)
        if (!bytes) return

        try {
          const pdfjs = await import("pdfjs-dist")
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerURL
          loadingTask = pdfjs.getDocument({ data: bytes })
          const loaded = await loadingTask.promise
          if (version !== loadVersion) {
            loaded.destroy()
            return
          }
          setDocument(loaded)
        } catch (err) {
          if (version !== loadVersion) return
          setError(err instanceof Error ? err.message : String(err))
        }
      },
      { defer: false },
    ),
  )

  onCleanup(() => {
    loadVersion++
    loadingTask?.destroy()
    document()?.destroy()
  })

  const pages = createMemo(() => {
    const count = document()?.numPages ?? 0
    return Array.from({ length: count }, (_, index) => index + 1)
  })

  return (
    <div ref={container} class="artifact-pdf-viewer">
      <Switch>
        <Match when={error()}>
          {(message) => (
            <div class="artifact-empty">
              <Icon name="warning" class="size-8 text-text-weak" />
              <div class="text-14-medium text-text-base">{language.t("common.requestFailed")}</div>
              <div class="text-12-regular text-text-weak max-w-120 text-center">{message()}</div>
            </div>
          )}
        </Match>
        <Match when={document()}>
          {(pdf) => (
            <>
              <div class="artifact-pdf-count">{pages().length} pages</div>
              <For each={pages()}>
                {(pageNumber) => (
                  <PdfPage
                    document={pdf()}
                    pageNumber={pageNumber}
                    zoom={props.zoom}
                    fitWidth={props.fitWidth}
                    containerWidth={containerWidth()}
                  />
                )}
              </For>
            </>
          )}
        </Match>
        <Match when={true}>
          <div class="artifact-empty">{language.t("common.loading")}...</div>
        </Match>
      </Switch>
    </div>
  )
}

function MediaPreview(props: {
  kind: ArtifactKind
  path: string
  content?: FileContent
  zoom: number
  fitWidth: boolean
}) {
  const [url, setUrl] = createSignal<string | undefined>()

  createEffect(
    on(
      () => [props.kind, props.content?.content, props.content?.encoding, props.content?.mimeType] as const,
      () => {
        const next = contentToBlobURL(props.content, mimeForKind(props.kind))
        setUrl(next)
        onCleanup(() => {
          if (next) URL.revokeObjectURL(next)
        })
      },
    ),
  )

  return (
    <Show when={url()} fallback={<BinaryFallback path={props.path} content={props.content} />}>
      {(src) => (
        <div class="artifact-media-preview">
          <Switch>
            <Match when={props.kind === "image"}>
              <div class="artifact-image-frame" data-fit-width={props.fitWidth ? "true" : "false"}>
                <img src={src()} alt={props.path} style={{ transform: `scale(${props.fitWidth ? 1 : props.zoom})` }} />
              </div>
            </Match>
            <Match when={props.kind === "audio"}>
              <audio class="artifact-audio" src={src()} controls preload="metadata" />
            </Match>
            <Match when={props.kind === "video"}>
              <video class="artifact-video" src={src()} controls preload="metadata" />
            </Match>
          </Switch>
        </div>
      )}
    </Show>
  )
}

export function ArtifactViewer(props: { path: string }) {
  const file = useFile()
  const language = useLanguage()
  const path = createMemo(() => props.path)
  const state = createMemo(() => (path() ? file.get(path()) : undefined))
  const content = createMemo(() => state()?.content)
  const kind = createMemo(() => artifactKindFromPath(path(), content()?.mimeType ?? undefined))
  const [zoom, setZoom] = createSignal(1)
  const [fitWidth, setFitWidth] = createSignal(true)

  createEffect(
    on(path, () => {
      setZoom(1)
      setFitWidth(true)
    }),
  )

  createEffect(
    on(path, (target) => {
      if (!target) return
      void file.load(target)
    }),
  )

  const reload = () => {
    const target = path()
    if (!target) return
    void file.load(target, { force: true })
  }

  const zoomControls = () => (
    <Show when={kind() === "pdf" || kind() === "image"}>
      <div class="artifact-zoom-controls">
        <IconButton icon="dash" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} />
        <div class="artifact-zoom-value">{fitWidth() ? "Fit" : `${Math.round(zoom() * 100)}%`}</div>
        <IconButton
          icon="plus-small"
          variant="ghost"
          aria-label="Zoom in"
          onClick={() => {
            setFitWidth(false)
            setZoom((value) => Math.min(4, value + 0.25))
          }}
        />
        <Button size="small" variant={fitWidth() ? "primary" : "secondary"} onClick={() => setFitWidth((value) => !value)}>
          Fit width
        </Button>
      </div>
    </Show>
  )

  return (
    <div class="artifact-viewer">
      <Show when={kind() !== "markdown"}>
        <ArtifactHeader
          path={path()}
          kind={kind()}
          content={content()}
          loading={state()?.loading}
          controls={zoomControls()}
          onReload={reload}
        />
      </Show>
      <div class="artifact-body">
        <Switch>
          <Match when={state()?.loading && !content()}>
            <div class="artifact-empty">{language.t("common.loading")}...</div>
          </Match>
          <Match when={state()?.error}>
            {(err) => (
              <div class="artifact-empty">
                <Icon name="warning" class="size-8 text-text-weak" />
                <div class="text-14-medium text-text-base">{language.t("common.requestFailed")}</div>
                <div class="text-12-regular text-text-weak max-w-120 text-center">{err()}</div>
                <Button size="small" variant="secondary" onClick={reload}>
                  Retry
                </Button>
              </div>
            )}
          </Match>
          <Match when={content()}>
            {(value) => (
              <Switch>
                <Match when={kind() === "markdown"}>
                  <FileEditor path={path()} initialContent={value().content ?? ""} />
                </Match>
                <Match when={kind() === "diagram"}>
                  <MermaidDiagramPreview path={path()} content={value().content ?? ""} />
                </Match>
                <Match when={kind() === "text"}>
                  <TextPreview path={path()} content={value().content ?? ""} />
                </Match>
                <Match when={kind() === "pdf"}>
                  <PdfPreview content={value()} zoom={zoom()} fitWidth={fitWidth()} />
                </Match>
                <Match when={kind() === "image" || kind() === "audio" || kind() === "video"}>
                  <MediaPreview kind={kind()} path={path()} content={value()} zoom={zoom()} fitWidth={fitWidth()} />
                </Match>
                <Match when={true}>
                  <BinaryFallback path={path()} content={value()} />
                </Match>
              </Switch>
            )}
          </Match>
          <Match when={true}>
            <div class="artifact-empty">{language.t("common.loading")}...</div>
          </Match>
        </Switch>
      </div>
    </div>
  )
}
