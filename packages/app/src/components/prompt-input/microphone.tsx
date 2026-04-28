import { createSignal, onCleanup, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { showToast } from "@opencode-ai/ui/toast"
import { useSettings } from "@/context/settings"

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

interface DeepgramFinalMessage {
  type?: string
  is_final?: boolean
  channel?: {
    alternatives?: Array<{ transcript?: string }>
  }
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
  const trimmed = text
  const needsSpace = el.textContent && el.textContent.length > 0 && !el.textContent.endsWith(" ")
  const insert = (needsSpace ? " " : "") + trimmed + " "
  const ok = document.execCommand("insertText", false, insert)
  if (!ok) {
    el.append(document.createTextNode(insert))
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

export function MicrophoneButton() {
  const settings = useSettings()
  const [recording, setRecording] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  let socket: WebSocket | null = null
  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null

  const cleanup = () => {
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop()
      } catch {
        // ignore
      }
    }
    recorder = null
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
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
  }

  onCleanup(cleanup)

  const start = async () => {
    if (busy() || recording()) return
    const apiKey = settings.voice.deepgramApiKey()
    if (!apiKey) {
      showToast({
        variant: "error",
        title: "Deepgram API key missing",
        description: "Add your Deepgram API key in Settings > General > Voice.",
      })
      return
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      showToast({
        variant: "error",
        title: "Voice input not available",
        description:
          "navigator.mediaDevices is not exposed by this WebView. Voice input on macOS Tauri WebKit requires a build flag that is currently disabled to avoid a system crash.",
      })
      return
    }
    setBusy(true)
    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })
      stream = audio

      const params = new URLSearchParams({
        model: settings.voice.model() || "nova-3",
        language: settings.voice.language() || "fr",
        interim_results: "true",
        smart_format: "true",
        punctuate: "true",
        vad_events: "true",
        encoding: "opus",
      })

      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ["token", apiKey])
      socket = ws

      ws.onopen = () => {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : ""
        const r = new MediaRecorder(audio, mimeType ? { mimeType } : undefined)
        recorder = r
        r.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data)
          }
        })
        r.start(250)
        setRecording(true)
        setBusy(false)
        focusPromptEditor()
      }

      ws.onmessage = (message) => {
        try {
          const received = JSON.parse(message.data) as DeepgramFinalMessage
          if (received.type !== "Results") return
          const transcript = received.channel?.alternatives?.[0]?.transcript ?? ""
          if (received.is_final && transcript.trim()) {
            insertTranscript(transcript.trim())
          }
        } catch {
          // ignore non-JSON
        }
      }

      ws.onerror = () => {
        showToast({
          variant: "error",
          title: "Voice transcription failed",
          description: "Connection to Deepgram failed. Check your API key and network.",
        })
        cleanup()
      }

      ws.onclose = () => {
        cleanup()
      }
    } catch (err) {
      setBusy(false)
      showToast({
        variant: "error",
        title: "Microphone access denied",
        description: err instanceof Error ? err.message : String(err),
      })
      cleanup()
    }
  }

  const toggle = () => {
    if (recording()) cleanup()
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
          <span class="relative inline-flex size-3 rounded-full bg-red-500">
            <span class="absolute inset-0 rounded-full bg-red-500 opacity-60 animate-ping" />
          </span>
        </Show>
      </Button>
    </Tooltip>
  )
}
