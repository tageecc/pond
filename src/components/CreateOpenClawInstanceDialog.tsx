import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../stores/appStore"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import { Button } from "./ui/button"

export function CreateOpenClawInstanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const createOpenClawInstance = useAppStore((s) => s.createOpenClawInstance)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setPending(true)
    try {
      await createOpenClawInstance()
      onOpenChange(false)
    } catch {
      // Errors surfaced via store toasts
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-app-border bg-app-surface sm:max-w-sm" style={{ cursor: pending ? 'wait' : 'auto' }}>
        <DialogHeader>
          <DialogTitle>{t("createInstance.title")}</DialogTitle>
          <DialogDescription className="text-app-muted">
            {t("createInstance.description", {
              short: t("createInstance.short"),
              default: t("createInstance.defaultPath"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-app-border"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-claw-500 hover:bg-claw-600 text-white"
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? t("createInstance.creating") : t("createInstance.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
