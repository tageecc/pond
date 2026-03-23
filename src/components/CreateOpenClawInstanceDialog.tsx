import { useState } from "react"
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
      <DialogContent className="border-app-border bg-app-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>新建 OpenClaw 实例</DialogTitle>
          <DialogDescription className="text-app-muted">
            将新建独立数据目录 <span className="font-mono text-app-text/80">~/.openclaw-&lt;短 id&gt;</span>
            ，与主实例 <span className="font-mono text-app-text/80">~/.openclaw</span>（default）隔离。
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
            取消
          </Button>
          <Button
            type="button"
            className="bg-claw-500 hover:bg-claw-600 text-white"
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? "创建中…" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
