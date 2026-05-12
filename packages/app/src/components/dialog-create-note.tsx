import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { createSignal } from "solid-js"
import { useLanguage } from "@/context/language"

export function DialogCreateNote(props: {
  defaultName: string
  onConfirm: (name: string) => Promise<void> | void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const [name, setName] = createSignal(props.defaultName)
  const [submitting, setSubmitting] = createSignal(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (submitting()) return
    const trimmed = name().trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      await props.onConfirm(trimmed)
      dialog.close()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog fit title={language.t("dialog.note.create.title")} class="w-full max-w-[420px] mx-auto">
      <form onSubmit={handleSubmit} class="flex flex-col gap-6 p-6 pt-0">
        <TextField
          autofocus
          type="text"
          label={language.t("dialog.note.create.name.label")}
          placeholder={language.t("dialog.note.create.name.placeholder")}
          value={name()}
          onChange={(v) => setName(v)}
        />
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={submitting() || !name().trim()}>
            {submitting() ? language.t("common.saving") : language.t("dialog.note.create.confirm")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
