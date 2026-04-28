import { WebviewWindow, getCurrentWebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow"
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi"

export type SplitDirection = "vertical" | "horizontal"

const PANEL_LABEL_PREFIX = "panel-"

function nextPanelLabel(existing: string[]) {
  const used = new Set(existing)
  for (let i = 2; i < 1000; i++) {
    const label = `${PANEL_LABEL_PREFIX}${i}`
    if (!used.has(label)) return label
  }
  throw new Error("Too many panels open")
}

export async function openNewPanel(direction: SplitDirection) {
  const all = await getAllWebviewWindows()
  const existing = all.map((w: { label: string }) => w.label)
  const label = nextPanelLabel(existing)

  const current = getCurrentWebviewWindow()
  let position: LogicalPosition | undefined
  let size: LogicalSize | undefined
  try {
    const pos = await current.outerPosition()
    const sz = await current.outerSize()
    const scale = await current.scaleFactor()
    const x = pos.x / scale
    const y = pos.y / scale
    const w = sz.width / scale
    const h = sz.height / scale

    if (direction === "vertical") {
      position = new LogicalPosition(x + w / 2 + 12, y)
      size = new LogicalSize(Math.max(640, w), Math.max(480, h))
    } else {
      position = new LogicalPosition(x, y + h / 2 + 12)
      size = new LogicalSize(Math.max(640, w), Math.max(480, h))
    }
  } catch {
    // ignore positioning errors, Tauri will use defaults
  }

  const url = window.location.pathname + window.location.search + window.location.hash
  const win = new WebviewWindow(label, {
    url: url || "/",
    title: "Prisme",
    width: size?.width,
    height: size?.height,
    x: position?.x,
    y: position?.y,
    decorations: true,
    transparent: false,
    resizable: true,
    focus: true,
  })

  await new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve())
    win.once("tauri://error", (e: { payload: unknown }) => reject(new Error(String(e.payload))))
  })
}

export async function closeCurrentPanel(fallbackIfLast?: () => void) {
  const all = await getAllWebviewWindows()
  const visible = all.filter((w: { label: string }) => w.label.startsWith(PANEL_LABEL_PREFIX) || w.label === "main")
  if (visible.length <= 1) {
    if (fallbackIfLast) fallbackIfLast()
    return
  }
  const current = getCurrentWebviewWindow()
  await current.close()
}
