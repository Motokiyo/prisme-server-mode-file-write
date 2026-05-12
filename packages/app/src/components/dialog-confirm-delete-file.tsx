import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { createSignal } from "solid-js"
import { useLanguage } from "@/context/language"

export function DialogConfirmDeleteFile(props: {
  filename: string
  kind?: "file" | "directory"
  onConfirm: () => Promise<void> | void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const [submitting, setSubmitting] = createSignal(false)

  const titleKey = () => (props.kind === "directory" ? "dialog.directory.delete.title" : "dialog.file.delete.title")
  const descriptionKey = () =>
    props.kind === "directory" ? "dialog.directory.delete.description" : "dialog.file.delete.description"
  const confirmKey = () =>
    props.kind === "directory" ? "dialog.directory.delete.confirm" : "dialog.file.delete.confirm"

  async function handleConfirm() {
    if (submitting()) return
    setSubmitting(true)
    try {
      await props.onConfirm()
      dialog.close()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog fit title={language.t(titleKey())} class="w-full max-w-[420px] mx-auto">
      <div class="flex flex-col gap-6 p-6 pt-0">
        <p class="text-13-regular text-text-base">
          {language.t(descriptionKey(), { name: props.filename })}
        </p>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="button" variant="primary" size="large" onClick={handleConfirm} disabled={submitting()}>
            {submitting() ? language.t("common.saving") : language.t(confirmKey())}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
