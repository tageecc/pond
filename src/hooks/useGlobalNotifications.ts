import { useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { toast } from "sonner"
import { useAppStore } from "../stores/appStore"

/**
 * Global toasts for Tauri events (Gateway, WS health, approvals, logs).
 */
export function useGlobalNotifications() {
  useEffect(() => {
    const unlisteners: Array<() => void> = []

    // ws-health
    listen<any>("ws-health", (event) => {
      const payload = event.payload
      // Notify on unhealthy/degraded
      if (payload.status === "unhealthy" || payload.status === "degraded") {
        toast.warning("Agent 健康检查异常", {
          description: payload.message || "请检查 Agent 运行状态",
          duration: 5000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    // ws-tick (heartbeat)
    listen<any>("ws-tick", (event) => {
      const payload = event.payload
      if (payload.warning || payload.error) {
        toast.error("Agent 心跳异常", {
          description: payload.warning || payload.error || "网关可能无响应",
          duration: 5000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    // Approval requested
    listen<any>("ws-approval-requested", (event) => {
      const payload = event.payload
      const toolName = payload.toolName || payload.tool || "未知工具"
      const reason = payload.reason || payload.message || "需要您的确认"
      
      toast.warning(`需要审批：${toolName}`, {
        description: reason,
        duration: 10000,
        action: {
          label: "查看详情",
          onClick: () => {
            // Jump to chat
            useAppStore.getState().setCurrentView("chat")
          },
        },
      })
    }).then((unlisten) => unlisteners.push(unlisten))

    // Approval resolved
    listen<any>("ws-approval-resolved", (event) => {
      const payload = event.payload
      const approved = payload.approved !== false
      const toolName = payload.toolName || payload.tool || "工具"
      
      if (approved) {
        toast.success(`已批准：${toolName}`, {
          description: "Agent 将继续执行",
          duration: 3000,
        })
      } else {
        toast.info(`已拒绝：${toolName}`, {
          description: "Agent 已取消该操作",
          duration: 3000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    // gateway-status
    listen<any>("gateway-status", (event) => {
      const payload = event.payload
      const agentId = payload.agent_id || "default"
      const status = payload.status
      const source = payload.source

      const instanceDisplayNames = useAppStore.getState().instanceDisplayNames ?? {}
      const displayName = instanceDisplayNames[agentId] || agentId

      // Skip on dashboard to avoid duplicate toasts
      const currentView = useAppStore.getState().currentView
      if (currentView === "dashboard") return

      // Ignore transient "starting"
      if (status === "starting") return

      if (status === "running") {
        toast.success(`Agent 已启动`, {
          description: `「${displayName}」Gateway 运行在端口 ${payload.port}`,
          duration: 3000,
        })
      } else if (status === "error") {
        toast.error(`Agent 启动失败`, {
          description: `「${displayName}」: ${payload.message || "未知错误"}`,
          duration: 5000,
        })
      } else if (status === "stopped" && source === "user") {
        // User-initiated stop only; silent on reload exit
        toast.info(`Agent 已停止`, {
          description: `「${displayName}」Gateway 已关闭`,
          duration: 3000,
        })
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    // gateway-log stream: surface hard errors
    listen<string>("gateway-log", (event) => {
      const log = event.payload
      
      // [ERROR]/[FATAL] lines
      if (log.includes("[ERROR]") || log.includes("[FATAL]")) {
        const match = log.match(/\[ERROR\]\s*(.+)/) || log.match(/\[FATAL\]\s*(.+)/)
        if (match) {
          const errorMsg = match[1].trim()
          
          // Skip noisy transient errors
          if (
            errorMsg.includes("ECONNREFUSED") ||
            errorMsg.includes("Connection reset") ||
            errorMsg.includes("timeout")
          ) {
            return // Already surfaced elsewhere
          }

          toast.error("Gateway 错误", {
            description: errorMsg.slice(0, 100),
            duration: 5000,
          })
        }
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, []) // Register once on mount
}
