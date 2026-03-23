import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Eraser, Terminal } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

const MAX_LINES = 500

/** Matches backend: `[instanceId] …` prefix (file tail + gateway child stdout/stderr) */
function logPayloadInstanceId(payload: string): string | null {
  if (!payload.startsWith("[")) return null
  const end = payload.indexOf("]")
  if (end < 1) return null
  return payload.slice(1, end)
}

export function InstanceGatewayLogPanel({ instanceId }: { instanceId: string | null }) {
  const [logs, setLogs] = useState<string[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [tailLive, setTailLive] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const id = instanceId ?? "default"

  useEffect(() => {
    if (!autoScroll) return
    logContainerRef.current?.scrollTo({
      top: logContainerRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [logs.length, autoScroll])

  useEffect(() => {
    if (!autoRefresh) {
      setTailLive(false)
      void invoke("stop_tail_gateway_log")
      return
    }

    setTailLive(false)
    let cancelled = false
    let unlisten: (() => void) | undefined

    void (async () => {
      unlisten = await listen<string>("gateway-log", (e) => {
        if (cancelled) return
        if (logPayloadInstanceId(e.payload) !== id) return
        setLogs((prev) => [...prev.slice(-(MAX_LINES - 1)), e.payload].slice(-MAX_LINES))
      })
      if (cancelled) {
        unlisten()
        return
      }
      setLogs([])
      try {
        await invoke("start_tail_gateway_log", { instanceId: id })
        if (!cancelled) setTailLive(true)
      } catch {
        if (!cancelled) setTailLive(false)
      }
    })()

    return () => {
      cancelled = true
      setTailLive(false)
      unlisten?.()
      void invoke("stop_tail_gateway_log")
    }
  }, [autoRefresh, id])

  const emptyHint = !autoRefresh
    ? "开启「实时更新」拉取当前实例的日志；开启「自动贴底」则新日志时自动滚到底部"
    : !tailLive
      ? "正在连接当前实例的 Gateway 日志文件…"
      : "暂无展示行；有新写入时会出现在这里（清空仅影响本页缓冲区）"

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app-surface">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b border-app-border bg-app-elevated/50 py-2 pl-3 pr-2 sm:py-2.5 sm:pl-4 sm:pr-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-app-muted" />
          <CardTitle className="text-sm font-medium text-app-text">Gateway 日志</CardTitle>
          <span className="font-mono text-[11px] text-app-muted">({logs.length})</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-app-muted hover:text-app-text"
            disabled={logs.length === 0}
            title="仅清空本页缓冲区，不删除磁盘上的日志文件"
            onClick={() => setLogs([])}
          >
            <Eraser className="h-3.5 w-3.5" />
            清空
          </Button>
          <label
            className="flex cursor-pointer items-center gap-1.5 text-[11px] text-app-muted"
            title="实时拉取当前实例的 Gateway 日志文件"
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-app-border"
            />
            实时更新
          </label>
          <label
            className="flex cursor-pointer items-center gap-1.5 text-[11px] text-app-muted"
            title="有新日志时自动滚动到底部"
          >
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-app-border"
            />
            自动贴底
          </label>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0 flex flex-col">
        <div
          ref={logContainerRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#0d0d0f] px-4 py-3 font-mono text-xs leading-relaxed text-zinc-400 scrollbar-hide"
        >
          {logs.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-2 text-center text-sm text-zinc-600">
              {emptyHint}
            </p>
          ) : (
            logs.map((log, i) => (
              <div key={`${i}-${log.slice(0, 32)}`} className="whitespace-pre-wrap break-all">
                {log}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
