import { useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../stores/appStore"

/**
 * Global toasts for Tauri events (Gateway, WS health, approvals, logs).
 */
export function useGlobalNotifications() {
  const { t } = useTranslation()

  useEffect(() => {
    const unlisteners: Array<() => void> = []

    listen<Record<string, unknown>>("ws-health", (event) => {
      const payload = event.payload
      if (payload.status === "unhealthy" || payload.status === "degraded") {
        toast.warning(t("notifications.wsHealthWarning"), {
          description:
            (payload.message as string) || t("notifications.wsHealthDesc"),
          duration: 5000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    listen<Record<string, unknown>>("ws-tick", (event) => {
      const payload = event.payload
      if (payload.warning || payload.error) {
        toast.error(t("notifications.wsTickError"), {
          description:
            (payload.warning as string) ||
            (payload.error as string) ||
            t("notifications.wsTickDesc"),
          duration: 5000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    listen<Record<string, unknown>>("ws-approval-requested", (event) => {
      const payload = event.payload
      const toolName =
        (payload.toolName as string) ||
        (payload.tool as string) ||
        t("notifications.unknownTool")
      const reason =
        (payload.reason as string) ||
        (payload.message as string) ||
        t("notifications.needConfirm")

      toast.warning(t("notifications.approvalNeeded", { tool: toolName }), {
        description: reason,
        duration: 10000,
        action: {
          label: t("notifications.viewDetails"),
          onClick: () => {
            useAppStore.getState().setCurrentView("chat")
          },
        },
      })
    }).then((unlisten) => unlisteners.push(unlisten))

    listen<Record<string, unknown>>("ws-approval-resolved", (event) => {
      const payload = event.payload
      const approved = payload.approved !== false
      const toolName =
        (payload.toolName as string) ||
        (payload.tool as string) ||
        t("notifications.toolFallback")

      if (approved) {
        toast.success(t("notifications.approved", { tool: toolName }), {
          description: t("notifications.approvedDesc"),
          duration: 3000,
        })
      } else {
        toast.info(t("notifications.rejected", { tool: toolName }), {
          description: t("notifications.rejectedDesc"),
          duration: 3000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    listen<Record<string, unknown>>("gateway-status", (event) => {
      const payload = event.payload
      const agentId = (payload.agent_id as string) || "default"
      const status = payload.status as string
      const source = payload.source as string

      const instanceDisplayNames = useAppStore.getState().instanceDisplayNames ?? {}
      const displayName = instanceDisplayNames[agentId] || agentId

      const currentView = useAppStore.getState().currentView
      if (currentView === "dashboard") return

      if (status === "starting") return

      if (status === "running") {
        toast.success(t("notifications.agentStarted"), {
          description: t("notifications.agentRunningOnPort", {
            name: displayName,
            port: payload.port as number,
          }),
          duration: 3000,
        })
      } else if (status === "error") {
        toast.error(t("notifications.agentStartFailed"), {
          description: t("notifications.agentStartFailedDesc", {
            name: displayName,
            message: (payload.message as string) || t("notifications.unknownError"),
          }),
          duration: 5000,
        })
      } else if (status === "stopped" && source === "user") {
        toast.info(t("notifications.agentStopped"), {
          description: t("notifications.agentStoppedDesc", { name: displayName }),
          duration: 3000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    listen<string>("gateway-log", (event) => {
      const log = event.payload

      if (log.includes("[ERROR]") || log.includes("[FATAL]")) {
        const match = log.match(/\[ERROR\]\s*(.+)/) || log.match(/\[FATAL\]\s*(.+)/)
        if (match) {
          const errorMsg = match[1].trim()

          if (
            errorMsg.includes("ECONNREFUSED") ||
            errorMsg.includes("Connection reset") ||
            errorMsg.includes("timeout")
          ) {
            return
          }

          toast.error(t("notifications.gatewayError"), {
            description: errorMsg.slice(0, 100),
            duration: 5000,
          })
        }
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [t])
}
