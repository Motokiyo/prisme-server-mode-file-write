import { createSignal, onCleanup, Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"

type MicrophoneButtonProps = {
  disabled?: boolean
  onTranscript: (text: string) => void
}

type DeepgramMessage = {
  type?: string
  is_final?: boolean
  speech_final?: boolean
  channel?: {
    alternatives?: Array<{
      transcript?: string
    }>
  }
}

function pcm16(samples: Float32Array) {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}

function deepgramURL(input: { model: string; language: string; sampleRate: number }) {
  const params = new URLSearchParams({
    model: input.model,
    language: input.language,
    encoding: "linear16",
    sample_rate: String(input.sampleRate),
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
  })
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`
}

export function MicrophoneButton(props: MicrophoneButtonProps) {
  const language = useLanguage()
  const settings = useSettings()
  const [recording, setRecording] = createSignal(false)

  let stream: MediaStream | undefined
  let audio: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let processor: ScriptProcessorNode | undefined
  let socket: WebSocket | undefined

  const stop = () => {
    setRecording(false)
    processor?.disconnect()
    source?.disconnect()
    stream?.getTracks().forEach((track) => track.stop())
    void audio?.close().catch(() => undefined)
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close()
    processor = undefined
    source = undefined
    stream = undefined
    audio = undefined
    socket = undefined
  }

  const start = async () => {
    const apiKey = settings.voice.deepgramApiKey().trim()
    if (!apiKey) {
      showToast({
        variant: "error",
        title: language.t("voice.error.missingKey.title"),
        description: language.t("voice.error.missingKey.description"),
      })
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      audio = new AudioContext()
      source = audio.createMediaStreamSource(stream)
      processor = audio.createScriptProcessor(4096, 1, 1)
      socket = new WebSocket(
        deepgramURL({
          model: settings.voice.model().trim() || "nova-3",
          language: settings.voice.language().trim() || "fr",
          sampleRate: audio.sampleRate,
        }),
        ["token", apiKey],
      )

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as DeepgramMessage
          const transcript = data.channel?.alternatives?.[0]?.transcript?.trim()
          if (!transcript || !(data.is_final || data.speech_final)) return
          props.onTranscript(`${transcript} `)
        } catch {
          return
        }
      }

      socket.onerror = () => {
        showToast({
          variant: "error",
          title: language.t("voice.error.connection.title"),
          description: language.t("voice.error.connection.description"),
        })
        stop()
      }

      processor.onaudioprocess = (event) => {
        event.outputBuffer.getChannelData(0).fill(0)
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        socket.send(pcm16(event.inputBuffer.getChannelData(0)))
      }

      source.connect(processor)
      processor.connect(audio.destination)
      setRecording(true)
    } catch (err) {
      stop()
      showToast({
        variant: "error",
        title: language.t("voice.error.microphone.title"),
        description: err instanceof Error ? err.message : language.t("voice.error.microphone.description"),
      })
    }
  }

  onCleanup(stop)

  return (
    <Tooltip
      placement="top"
      value={recording() ? language.t("voice.action.stop") : language.t("voice.action.start")}
    >
      <IconButton
        data-action="prompt-microphone"
        type="button"
        disabled={props.disabled}
        icon={recording() ? "stop" : "microphone"}
        variant={recording() ? "primary" : "ghost"}
        class="size-8"
        aria-label={recording() ? language.t("voice.action.stop") : language.t("voice.action.start")}
        onClick={() => {
          if (recording()) {
            stop()
            return
          }
          void start()
        }}
      />
      <Show when={recording()}>
        <span class="sr-only">{language.t("voice.state.recording")}</span>
      </Show>
    </Tooltip>
  )
}
