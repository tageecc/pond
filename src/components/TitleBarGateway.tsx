import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Play, RotateCw, Square } from "lucide-react"
import { toast } from "sonner"
import { useAppStore } from "../stores/appStore"
import { resolveClawteamInstanceId } from "../lib/clawteamInstanceId"
import { cn } from "../lib/utils"
import { Button } from "./ui/button"

const DEFAULT_GATEWAY_PORT = 18789

export function TitleBarGateway() {
  const { t } = useTranslation()
  const instanceIds = useAppStore((s) => s.instanceIds)
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId)
  const startAgentGateway = useAppStore((s) => s.startAgentGateway)
  const stopAgentGateway = useAppStore((s) => s.stopAgentGateway)
  const restartAgentGateway = useAppStore((s) => s.restartAgentGateway)
  const loadAllGatewayStatuses = useAppStore((s) => s.loadAllGatewayStatuses)

  const [busy, setBusy] = useState<"idle" | "start" | "stop" | "restart">(
    "idle",
  )

  const instanceId =
    resolveClawteamInstanceId(instanceIds, selectedInstanceId) ??
    "default"

  const gatewayKey =
    !instanceId || instanceId === "default" ? "default" : instanceId
  const gwEntry = useAppStore((s) => s.agentGateways[gatewayKey])
  const port = gwEntry?.port ?? DEFAULT_GATEWAY_PORT
  const agentGatewayStatus = gwEntry?.status ?? "stopped"
  const running = agentGatewayStatus === "running"
  const starting = agentGatewayStatus === "starting"
  const stopped = !running && !starting
  const disabled = busy !== "idle"

  const run = async (
    kind: "start" | "stop" | "restart",
    fn: () => Promise<void>,
  ) => {
    setBusy(kind)
    try {
      await fn()
      await loadAllGatewayStatuses()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy("idle")
    }
  }

  const statusTitle = running
    ? t("titleBarGateway.statusRunning", { port })
    : starting
      ? t("titleBarGateway.statusStarting")
      : t("titleBarGateway.statusStopped")

  return (
    <div
      className="flex max-w-[min(100vw-8rem,280px)] items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={statusTitle}
      title={statusTitle}
      data-tauri-drag-region="false"
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          running && "bg-emerald-500",
          starting && "animate-pulse bg-amber-500",
          stopped && "bg-zinc-400 dark:bg-zinc-500",
        )}
        aria-hidden
      />
      <p className="min-w-0 truncate text-[11px] leading-none text-app-muted">
        {running ? (
          <>
            <span className="text-emerald-600 dark:text-emerald-400">
              {t("titleBarGateway.running")}
            </span>
            <span className="text-app-border/60"> · </span>
            <span>{t("common.port")}</span>{" "}
            <span className="font-mono tabular-nums text-app-text">{port}</span>
          </>
        ) : starting ? (
          <span className="text-amber-600 dark:text-amber-400">
            {t("titleBarGateway.starting")}
          </span>
        ) : (
          t("titleBarGateway.stopped")
        )}
      </p>
      <div className="flex shrink-0 items-center">
        {running && (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-app-muted hover:bg-app-hover/70 hover:text-app-text"
              disabled={disabled}
              title={t("titleBarGateway.stop")}
              onClick={() => run("stop", () => stopAgentGateway(instanceId))}
            >
              {busy === "stop" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-app-muted hover:bg-app-hover/70 hover:text-app-text"
              disabled={disabled}
              title={t("titleBarGateway.restart")}
              onClick={() =>
                run("restart", () => restartAgentGateway(instanceId))
              }
            >
              {busy === "restart" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </>
        )}
        {starting && (
          <span className="flex h-7 w-7 items-center justify-center text-app-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          </span>
        )}
        {stopped && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-claw-600 hover:bg-claw-500/10 hover:text-claw-700 dark:text-claw-400 dark:hover:text-claw-300"
            disabled={disabled}
            title={t("titleBarGateway.start")}
            onClick={() => run("start", () => startAgentGateway(instanceId))}
          >
            {busy === "start" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
