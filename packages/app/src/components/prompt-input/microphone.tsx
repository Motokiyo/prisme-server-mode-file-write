import { createSignal, onCleanup, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { showToast } from "@opencode-ai/ui/toast"
import { Channel, invoke } from "@tauri-apps/api/core"
import { useSettings } from "@/context/settings"

interface DeepgramMessage {
  type?: string
  is_final?: boolean
  channel?: {
    alternatives?: Array<{ transcript?: string }>
  }
}

interface VoiceStartResponse {
  sample_rate: number
  channels: number
}

function MicIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="7.5" y="2.5" width="5" height="9.5" rx="2.5" />
      <path d="M4.5 9.5v.75A5.5 5.5 0 0 0 10 15.75v0a5.5 5.5 0 0 0 5.5-5.5V9.5" />
      <path d="M10 15.75V18" />
      <path d="M7 18h6" />
    </svg>
  )
}

function focusPromptEditor(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('[data-component="prompt-input"]')
  if (!el) return null
  el.focus()
  const sel = window.getSelection()
  if (sel && sel.rangeCount === 0) {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }
  return el
}

function insertTranscript(text: string) {
  if (!text) return
  const el = focusPromptEditor()
  if (!el) return
  const needsSpace = el.textContent && el.textContent.length > 0 && !el.textContent.endsWith(" ")
  const insert = (needsSpace ? " " : "") + text + " "
  const ok = document.execCommand("insertText", false, insert)
  if (!ok) {
    el.append(document.createTextNode(insert))
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function chunkToUint8(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (Array.isArray(chunk)) return Uint8Array.from(chunk as number[])
  if (chunk && typeof chunk === "object" && "byteLength" in (chunk as ArrayBufferView)) {
    const view = chunk as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  return new Uint8Array()
}

export function MicrophoneButton() {
  const settings = useSettings()
  const [recording, setRecording] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  let socket: WebSocket | null = null
  let stopping = false

  const cleanup = async () => {
    if (stopping) return
    stopping = true
    try {
      await invoke("voice_stop")
    } catch (err) {
      console.error("voice_stop:", err)
    }
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "CloseStream" }))
        }
        socket.close()
      } catch {
        // ignore
      }
      socket = null
    }
    setRecording(false)
    stopping = false
  }

  onCleanup(() => {
    void cleanup()
  })

  const start = async () => {
    if (busy() || recording()) return
    const apiKey = settings.voice.deepgramApiKey()
    if (!apiKey) {
      showToast({
        variant: "error",
        title: "Deepgram API key missing",
        description: "Add your Deepgram API key in Settings > General.",
      })
      return
    }

    setBusy(true)
    try {
      const chunkChannel = new Channel<unknown>()
      const { sample_rate } = await invoke<VoiceStartResponse>("voice_start", {
        onChunk: chunkChannel,
      })

      const params = new URLSearchParams({
        model: settings.voice.model() || "nova-3",
        language: settings.voice.language() || "fr",
        interim_results: "true",
        smart_format: "true",
        punctuate: "true",
        encoding: "linear16",
        sample_rate: String(sample_rate),
        channels: "1",
      })

      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, [
        "token",
        apiKey,
      ])
      socket = ws
      ws.binaryType = "arraybuffer"

      ws.onopen = () => {
        setRecording(true)
        setBusy(false)
        focusPromptEditor()
      }

      ws.onmessage = (message) => {
        try {
          const received = JSON.parse(message.data) as DeepgramMessage
          if (received.type !== "Results") return
          const transcript = received.channel?.alternatives?.[0]?.transcript ?? ""
          if (received.is_final && transcript.trim()) {
            insertTranscript(transcript.trim())
          }
        } catch {
          // ignore non-JSON metadata frames
        }
      }

      ws.onerror = () => {
        showToast({
          variant: "error",
          title: "Voice transcription failed",
          description: "Connection to Deepgram failed. Check your API key and network.",
        })
        void cleanup()
      }

      ws.onclose = () => {
        if (recording()) void cleanup()
      }

      chunkChannel.onmessage = (chunk) => {
        const bytes = chunkToUint8(chunk)
        if (bytes.byteLength === 0) return
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(bytes)
        }
      }
    } catch (err) {
      setBusy(false)
      showToast({
        variant: "error",
        title: "Microphone unavailable",
        description: err instanceof Error ? err.message : String(err),
      })
      void cleanup()
    }
  }

  const toggle = () => {
    if (recording() || busy()) void cleanup()
    else void start()
  }

  return (
    <Tooltip placement="top" value={recording() ? "Stop recording" : "Start voice input"}>
      <Button
        type="button"
        variant="ghost"
        class="size-8 p-0"
        classList={{ "text-red-500": recording() }}
        onClick={toggle}
        disabled={busy()}
        aria-label={recording() ? "Stop recording" : "Start voice input"}
        aria-pressed={recording()}
      >
        <Show when={recording()} fallback={<MicIcon class="size-4.5" />}>
          <span class="relative inline-flex size-3.5 rounded-sm bg-red-500">
            <span class="absolute inset-0 rounded-sm bg-red-500 opacity-60 animate-ping" />
          </span>
        </Show>
      </Button>
    </Tooltip>
  )
}
