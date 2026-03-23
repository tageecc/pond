import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../stores/appStore"
import { invoke } from "@tauri-apps/api/core"
import {
  Play,
  Square,
  RotateCw,
  Loader2,
  RefreshCw,
  Cpu,
  HardDrive,
  Zap,
  CalendarOff,
  Hash,
  MessageCircle,
} from "lucide-react"
import { LineChart, Line } from "./charts"
import { cn, getAgentDisplayName } from "../lib/utils"
import { getAgentIds } from "../lib/openclawAgentsModels"
import { prettyTokens } from "../lib/format"
import { useCurrency } from "../hooks/useCurrency"
import { PageHeader } from "./PageHeader"
import { Button } from "./ui/button"
import { ContentLayout } from "./ContentLayout"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "./ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip"
import { toast } from "sonner"

function formatUptime(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const CHART_COLOR_CPU = "hsl(var(--chart-1))"
const CHART_COLOR_RAM = "hsl(var(--chart-2))"

export function Dashboard() {
  const { t } = useTranslation()
  const {
    agentGateways,
    gatewayError,
    startAgentGateway,
    stopAgentGateway,
    restartAgentGateway,
    refreshAgentGatewayInfo,
    loadAllGatewayStatuses,
    setGatewayError,
    openclawConfig,
    setCurrentView,
    todaySpend,
    cronJobs,
    fetchTodaySpend,
    fetchCronJobs,
    tokenStats,
    fetchTokenStats,
    chatSessions,
    fetchChatSessions,
    systemInfo,
    cpuHistory,
    memHistory,
    applySystemMetrics,
  } = useAppStore()
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [restartingId, setRestartingId] = useState<string | null>(null)
  const { exchangeRate, currency, toggleCurrency, formatCurrency } = useCurrency()

  useEffect(() => {
    // Sync usage from session files, then refresh dashboard widgets
    const syncAndRefresh = async () => {
      try {
        await invoke("sync_usage_from_sessions")
      } catch {
        // Sync failed; still refresh from local cache
      }
      // Refresh widgets
      fetchTodaySpend()
      fetchCronJobs()
      fetchTokenStats()
      fetchChatSessions()
    }

    // Initial sync
    syncAndRefresh()

    // Usage changes slowly; 5 min is enough
    const interval = setInterval(syncAndRefresh, 300000)
    return () => clearInterval(interval)
  }, [fetchTodaySpend, fetchCronJobs, fetchTokenStats, fetchChatSessions])

  useEffect(() => {
    const t = setInterval(() => {
      const latest = useAppStore.getState().agentGateways
      for (const [key, gw] of Object.entries(latest)) {
        if (gw.status === "running") refreshAgentGatewayInfo(key)
      }
    }, 3000)
    return () => clearInterval(t)
  }, [refreshAgentGatewayInfo])

  useEffect(() => {
    let cancelled = false
    async function fetchSystemInfo() {
      try {
        const info = await invoke<import("../types").SystemInfo>("get_system_info")
        if (!cancelled && info) applySystemMetrics(info)
      } catch (_) {}
    }
    fetchSystemInfo()
    const t = setInterval(fetchSystemInfo, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [applySystemMetrics])

  const handleAgentStart = async (agentId: string) => {
    try {
      setGatewayError(null)
      await startAgentGateway(agentId)
      const name = getAgentDisplayName(agentId, useAppStore.getState().instanceDisplayNames ?? {})
      toast.success(t("dashboard.toastGatewayStarted", { name }))
    } catch (e) {
      setGatewayError(e instanceof Error ? e.message : String(e))
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const handleAgentStop = async (agentId: string) => {
    setStoppingId(agentId)
    setGatewayError(null)
    try {
      await stopAgentGateway(agentId)
      const name = getAgentDisplayName(agentId, useAppStore.getState().instanceDisplayNames ?? {})
      toast.success(t("dashboard.toastGatewayStopped", { name }))
    } catch (e) {
      setGatewayError(e instanceof Error ? e.message : String(e))
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setStoppingId(null)
    }
  }
  const handleAgentRestart = async (agentId: string) => {
    setRestartingId(agentId)
    setGatewayError(null)
    try {
      await restartAgentGateway(agentId)
      const name = getAgentDisplayName(agentId, useAppStore.getState().instanceDisplayNames ?? {})
      toast.success(t("dashboard.toastGatewayRestarted", { name }))
    } catch (e) {
      setGatewayError(e instanceof Error ? e.message : String(e))
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRestartingId(null)
    }
  }
  const handleStartAll = async () => {
    await useAppStore.getState().loadAllGatewayStatuses()
    const latest = useAppStore.getState()
    const ids = latest.instanceIds.length > 0 ? latest.instanceIds : (getAgentIds(latest.openclawConfig).length ? getAgentIds(latest.openclawConfig) : ["default"])
    let started = 0
    for (const id of ids) {
      const gw = latest.agentGateways[id ?? 'default']
      if (!gw || gw.status === "stopped" || gw.status === "error") {
        try {
          await startAgentGateway(id)
          started++
        } catch (_) {}
      }
    }
    if (started > 0) toast.success(t("dashboard.toastStartedN", { n: started }))
  }
  const handleStopAll = async () => {
    await useAppStore.getState().loadAllGatewayStatuses()
    const latest = useAppStore.getState().agentGateways
    let stopped = 0
    for (const [key, gw] of Object.entries(latest)) {
      if (gw.status === "running" || gw.status === "starting") {
        try {
          await stopAgentGateway(key)
          stopped++
        } catch (_) {}
      }
    }
    if (stopped > 0) toast.success(t("dashboard.toastStoppedN", { n: stopped }))
  }

  const instanceIds = useAppStore((s) => s.instanceIds)
  const instanceDisplayNames = useAppStore((s) => s.instanceDisplayNames)
  const agents = instanceIds.length > 0 ? instanceIds : (getAgentIds(openclawConfig).length ? getAgentIds(openclawConfig) : ["default"])
  const displayNames = (instanceDisplayNames ?? {}) as Record<string, string>
  const totalAgents = agents.length
  const runningGwCount = Object.values(agentGateways).filter(g => g.status === 'running').length
  const startingGwCount = Object.values(agentGateways).filter(g => g.status === 'starting').length
  const allRunning = runningGwCount >= totalAgents
  const anyStarting = startingGwCount > 0
  const memPercent = systemInfo && systemInfo.memory_total_mb > 0
    ? (systemInfo.memory_used_mb / systemInfo.memory_total_mb) * 100 : 0

  const totalTokens = (tokenStats?.totalInput ?? 0) + (tokenStats?.totalOutput ?? 0)

  return (
    <TooltipProvider delayDuration={200}>
    <ContentLayout>
        <PageHeader
          title={t("dashboard.title")}
          subtitle={t("dashboard.subtitle", { rate: exchangeRate })}
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-app-muted"
              onClick={async () => {
                await loadAllGatewayStatuses()
                try {
                  await invoke<any>("sync_usage_from_sessions")
                  fetchTodaySpend()
                  fetchTokenStats()
                } catch (e) {
                  console.warn("[Dashboard] refresh usage failed:", e)
                }
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("dashboard.refresh")}</span>
            </Button>
          }
        />

        {gatewayError && (
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 py-3 pl-4 pr-3 text-sm text-destructive">
            <span>{gatewayError}</span>
            <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => setGatewayError(null)}>{t("dashboard.close")}</Button>
          </div>
        )}

        {/* System metrics */}
        <div className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {/* CPU */}
          <Card className="bg-app-surface overflow-hidden">
            <CardContent className="flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 sm:h-10 sm:w-10">
                <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-app-muted sm:text-xs">CPU</p>
                <p className="truncate text-base font-semibold tabular-nums text-app-text sm:text-lg">
                  {systemInfo != null ? `${systemInfo.cpu_usage_percent.toFixed(0)}%` : "—"}
                </p>
              </div>
              <div className="h-10 w-16 shrink-0 sm:w-20">
                <LineChart
                  data={cpuHistory.map((item, i) => ({ date: new Date(Date.now() - (cpuHistory.length - i) * 1000), value: item.value }))}
                  margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
                  className="h-full w-full"
                  animationDuration={0}
                >
                  <Line 
                    dataKey="value" 
                    stroke={CHART_COLOR_CPU} 
                    strokeWidth={1.5} 
                    showHighlight={false}
                    animate={false}
                  />
                </LineChart>
              </div>
            </CardContent>
          </Card>
          {/* Memory */}
          <Card className="bg-app-surface overflow-hidden">
            <CardContent className="flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 sm:h-10 sm:w-10">
                <HardDrive className="h-4 w-4 text-violet-600 dark:text-violet-400 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-app-muted sm:text-xs">
                  {systemInfo ? `${(systemInfo.memory_used_mb / 1024).toFixed(1)}/${(systemInfo.memory_total_mb / 1024).toFixed(0)}G` : t("dashboard.memory")}
                </p>
                <p className="truncate text-base font-semibold tabular-nums text-app-text sm:text-lg">
                  {systemInfo != null ? `${memPercent.toFixed(0)}%` : "—"}
                </p>
              </div>
              <div className="h-10 w-16 shrink-0 sm:w-20">
                <LineChart
                  data={memHistory.map((item, i) => ({ date: new Date(Date.now() - (memHistory.length - i) * 1000), value: item.value }))}
                  margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
                  className="h-full w-full"
                  animationDuration={0}
                >
                  <Line 
                    dataKey="value" 
                    stroke={CHART_COLOR_RAM} 
                    strokeWidth={1.5} 
                    showHighlight={false}
                    animate={false}
                  />
                </LineChart>
              </div>
            </CardContent>
          </Card>
          {/* Today spend */}
          <Card className="bg-app-surface overflow-hidden">
            <CardContent className="flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 sm:h-10 sm:w-10">
                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[11px] text-app-muted sm:text-xs">{t("dashboard.todaySpend")}</p>
                  <button
                    onClick={toggleCurrency}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-app-hover hover:bg-app-hover-strong text-app-muted hover:text-app-text transition-colors"
                    title={t("dashboard.toggleCurrency")}
                  >
                    {currency}
                  </button>
                </div>
                <p className="truncate text-base font-semibold tabular-nums text-app-text sm:text-lg">
                  {todaySpend != null ? formatCurrency(todaySpend.todayUsd) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
          {/* Token stats */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="bg-app-surface overflow-hidden cursor-default">
                <CardContent className="flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 sm:h-10 sm:w-10">
                    <Hash className="h-4 w-4 text-emerald-600 dark:text-emerald-400 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-app-muted sm:text-xs">{t("dashboard.tokenUsage")}</p>
                    <p className="truncate text-base font-semibold tabular-nums text-app-text sm:text-lg">
                      {prettyTokens(totalTokens)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs space-y-1 p-3">
              {tokenStats && Object.keys(tokenStats.agents).length > 0 ? (
                <>
                  <p className="mb-1.5 text-[11px] font-medium text-zinc-300">{t("dashboard.tokenByAgent")}</p>
                  {Object.entries(tokenStats.agents).map(([aid, t]) => (
                    <div key={aid} className="flex items-center justify-between gap-4 text-[11px]">
                      <span className="text-zinc-400 truncate">{getAgentDisplayName(aid, displayNames)}</span>
                      <span className="tabular-nums text-zinc-200 shrink-0">
                        {prettyTokens(t.input)} in / {prettyTokens(t.output)} out
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-[11px] text-zinc-400">{t("dashboard.noTokenRecords")}</p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* OpenClaw instances */}
        <Card className="shrink-0 bg-app-surface">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-4 pb-3 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <CardTitle className="text-sm font-medium text-app-text">{t("dashboard.instancesTitle")}</CardTitle>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                runningGwCount > 0 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-app-elevated text-app-muted"
              )}>
                {t("dashboard.runningCount", { running: runningGwCount, total: totalAgents })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {!allRunning && (
                <Button
                  size="sm"
                  className="h-7 gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700 border-0 shadow-sm sm:gap-1.5 sm:px-3"
                  disabled={anyStarting}
                  onClick={handleStartAll}
                >
                  {anyStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  {t("dashboard.startAll")}
                </Button>
              )}
              {runningGwCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 rounded-lg border-app-border px-2.5 text-xs font-medium text-app-muted hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 sm:gap-1.5 sm:px-3"
                  onClick={handleStopAll}
                >
                  <Square className="h-3 w-3" />
                  {t("dashboard.stopAll")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-0 sm:px-6">
            <div className="divide-y divide-app-border/60 rounded-xl border border-app-border/60 overflow-hidden">
              {agents.map((id) => {
                const key = id ?? 'default'
                const gw = agentGateways[key]
                const gwStatus = gw?.status ?? "stopped"
                const gwRunning = gwStatus === "running"
                const gwStarting = gwStatus === "starting"
                const gwStopping = stoppingId === key
                const gwRestarting = restartingId === key
                const gwPort = gw?.port ?? 18789
                const gwUptime = gw?.uptimeSeconds
                const gwExecState = gw?.executionState
                const gwLastActivity = gw?.lastActivity
                const name = getAgentDisplayName(id, displayNames)
                
                // Execution badge next to running gateway
                const getExecStateInfo = () => {
                  if (!gwExecState || gwExecState === "idle") return null
                  const timeSinceActivity = gwLastActivity ? Date.now() - gwLastActivity : 0
                  // No activity for 10s → treat as idle/complete for badge
                  if (timeSinceActivity > 10000 && gwExecState !== "error") return null
                  
                  switch (gwExecState) {
                    case "thinking":
                      return { label: t("dashboard.execThinking"), color: "text-blue-500", bgColor: "bg-blue-500/10" }
                    case "executing_tool":
                      return { label: t("dashboard.execRunning"), color: "text-amber-500", bgColor: "bg-amber-500/10" }
                    case "done":
                      return { label: t("dashboard.execDone"), color: "text-emerald-500", bgColor: "bg-emerald-500/10" }
                    case "error":
                      return { label: t("dashboard.execError"), color: "text-red-500", bgColor: "bg-red-500/10" }
                    default:
                      return null
                  }
                }
                const execStateInfo = getExecStateInfo()
                
                return (
                  <div key={id} className={cn(
                    "flex items-center gap-3 px-3 py-2.5 transition-colors sm:gap-4 sm:px-4 sm:py-3",
                    gwRunning ? "bg-emerald-500/[0.03]" : gwStarting ? "bg-amber-500/[0.03]" : "bg-transparent"
                  )}>
                    <div className="relative flex shrink-0 items-center justify-center">
                      <span className={cn(
                        "h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3",
                        gwRunning ? "bg-emerald-500" : gwStarting ? "bg-amber-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-600"
                      )} />
                      {gwRunning && <span className="absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full bg-emerald-500/30 sm:h-3 sm:w-3" />}
                    </div>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setCurrentView("agents", id)}
                      title={t("dashboard.openAgentSettings")}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="truncate text-xs font-semibold text-app-text sm:text-sm">{name}</span>
                        <span className={cn(
                          "shrink-0 rounded-md px-1 py-0.5 text-[9px] font-semibold sm:px-1.5 sm:text-[10px]",
                          gwRunning ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : gwStarting ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        )}>
                          {gwRunning ? t("dashboard.statusRunning") : gwStarting ? t("dashboard.statusStarting") : t("dashboard.statusStopped")}
                        </span>
                        {gwRunning && execStateInfo && (
                          <span className={cn(
                            "shrink-0 rounded-md px-1 py-0.5 text-[9px] font-semibold sm:px-1.5 sm:text-[10px] flex items-center gap-1",
                            execStateInfo.bgColor,
                            execStateInfo.color
                          )}>
                            <span className={cn(
                              "h-1 w-1 rounded-full animate-pulse",
                              execStateInfo.color.replace("text-", "bg-")
                            )} />
                            {execStateInfo.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-app-muted sm:gap-2 sm:text-[11px]">
                        <span>{t("dashboard.port")} <span className="font-mono">{gwPort}</span></span>
                        {gwRunning && gwUptime != null && (
                          <>
                            <span className="text-app-border">·</span>
                            <span>{formatUptime(gwUptime)}</span>
                          </>
                        )}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                      {gwRunning ? (
                        <>
                          {/* Stop with confirm */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-400 hover:bg-red-500/10 hover:text-red-500"
                                disabled={gwStopping}
                                title={t("dashboard.stop")}
                              >
                                {gwStopping
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Square className="h-3.5 w-3.5" />}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="end" className="w-auto p-3">
                              <p className="mb-2 text-xs text-app-text">{t("dashboard.stopConfirm", { name })}</p>
                              <div className="flex gap-2">
                                <PopoverClose asChild>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-app-muted">{t("dashboard.cancel")}</Button>
                                </PopoverClose>
                                <PopoverClose asChild>
                                  <Button
                                    size="sm"
                                    className="h-7 bg-red-600 text-xs text-white hover:bg-red-700 border-0"
                                    onClick={() => handleAgentStop(key)}
                                  >
                                    {t("dashboard.confirmStop")}
                                  </Button>
                                </PopoverClose>
                              </div>
                            </PopoverContent>
                          </Popover>
                          {/* Restart */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-amber-500 hover:bg-amber-500/10 hover:text-amber-600"
                            onClick={() => handleAgentRestart(key)}
                            disabled={gwRestarting}
                            title={t("dashboard.restart")}
                          >
                            {gwRestarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-700 border-0 sm:gap-1.5 sm:px-3 sm:text-xs"
                          onClick={() => handleAgentStart(key)}
                          disabled={gwStarting}
                        >
                          {gwStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          <span className="hidden sm:inline">{gwStarting ? t("dashboard.statusStarting") : t("dashboard.start")}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Cron + active sessions */}
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
          {/* Cron jobs */}
          <Card className="bg-app-surface">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-app-muted">{t("dashboard.cronTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {cronJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-1.5 opacity-40">
                  <CalendarOff className="h-6 w-6 text-app-muted" strokeWidth={1.5} />
                  <span className="text-xs text-app-muted">{t("dashboard.noCron")}</span>
                  <span className="text-[10px] text-app-muted/60">{t("dashboard.cronHint")}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const groups: Record<string, { name: string; jobs: typeof cronJobs }> = {}
                    for (const job of cronJobs) {
                      if (!groups[job.agentId]) {
                        groups[job.agentId] = { name: job.agentName, jobs: [] }
                      }
                      groups[job.agentId].jobs.push(job)
                    }
                    return Object.entries(groups).map(([agentId, { name: agentName, jobs }]) => (
                      <div key={agentId}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn(
                            "inline-block h-2 w-2 rounded-full",
                            agentId === "default" ? "bg-claw-500" : "bg-blue-500"
                          )} />
                          <span className="text-xs font-medium text-app-muted">{agentName}</span>
                          <span className="text-[10px] text-app-muted/50">{t("dashboard.cronItems", { count: jobs.length })}</span>
                        </div>
                        <ul className="space-y-1.5 pl-4 border-l-2 border-app-border/40">
                          {jobs.map((job) => (
                            <li key={job.id} className="rounded-md border border-app-border/40 bg-app-elevated/30 py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                                  job.enabled ? "bg-emerald-500" : "bg-zinc-400"
                                )} />
                                <span className="text-sm font-medium text-app-text truncate">{job.name}</span>
                                <code className="text-[10px] font-mono text-app-muted bg-app-surface px-1.5 py-0.5 rounded shrink-0">{job.schedule}</code>
                              </div>
                              {job.description && (
                                <p className="text-xs text-app-muted mt-0.5 truncate pl-3.5">{job.description}</p>
                              )}
                              {job.enabled && job.nextRunAt && (
                                <p className="text-[11px] text-app-muted/60 mt-0.5 pl-3.5">{t("dashboard.cronNextRun", { time: job.nextRunAt })}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active sessions */}
          <Card className="bg-app-surface">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-app-muted">{t("dashboard.sessionsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {chatSessions.length === 0 ? (
                <p className="py-4 text-center text-sm text-app-muted">{t("dashboard.noSessions")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {chatSessions.slice(0, 8).map((s) => {
                    const displayName = getAgentDisplayName(s.instanceId, displayNames)
                    return (
                      <li key={s.sessionKey}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 rounded-lg border border-app-border/60 bg-app-elevated px-3 py-2.5 text-left transition-colors hover:bg-app-hover"
                          onClick={() => setCurrentView("chat", s.instanceId)}
                        >
                          <MessageCircle className="h-4 w-4 shrink-0 text-claw-500" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-app-text truncate">{displayName}</span>
                              <span className="rounded bg-app-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-app-muted shrink-0">
                                {t("dashboard.messagesCount", { count: s.messageCount })}
                              </span>
                            </div>
                            {s.lastPreview && (
                              <p className="mt-0.5 truncate text-xs text-app-muted">{s.lastPreview}</p>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
    </ContentLayout>
    </TooltipProvider>
  )
}
