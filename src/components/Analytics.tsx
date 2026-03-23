import { useEffect, useState } from "react"
import { useAppStore } from "../stores/appStore"
import { invoke } from "@tauri-apps/api/core"
import { ContentLayout } from "./ContentLayout"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { motion } from "framer-motion"
import { Hash, DollarSign, Users, RefreshCw, MessageSquare } from "lucide-react"
import {
  LineChart,
  Line,
  Grid,
  XAxis as BklitXAxis,
  ChartTooltip,
  BarChart,
  Bar,
  RingChart,
  Ring,
  RingCenter,
} from "./charts"
import { prettyTokens } from "../lib/format"
import { useCurrency } from "../hooks/useCurrency"
import { PageHeader } from "./PageHeader"
import { getAgentDisplayName } from "../lib/utils"
import type { DailySpendEntry, TokenDailyEntry } from "../types"

const TOKEN_TREND_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 76%, 36%)",
  "hsl(262, 83%, 58%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
]

/** Per-agent usage from tokenStats (labels use displayName) */
function buildAgentUsageData(
  tokenStats: { agents: Record<string, { input: number; output: number }> } | null,
  displayNames: Record<string, string>
): Array<{ name: string; input: number; output: number; value: number }> {
  if (!tokenStats?.agents) return []
  return Object.entries(tokenStats.agents).map(([agentId, t]) => {
    const input = t.input ?? 0
    const output = t.output ?? 0
    return {
      name: getAgentDisplayName(agentId, displayNames),
      input,
      output,
      value: input + output,
    }
  })
}

/** Ring chart rows: label, value, maxValue */
function toRingData(
  agentUsage: Array<{ name: string; value: number }>
): Array<{ label: string; value: number; maxValue: number }> {
  if (agentUsage.length === 0) return []
  const maxVal = Math.max(...agentUsage.map((d) => d.value), 1)
  return agentUsage.slice(0, 8).map((d) => ({
    label: d.name,
    value: d.value,
    maxValue: maxVal,
  }))
}

export function Analytics() {
  const {
    todaySpend,
    tokenStats,
    chatSessions,
    fetchTodaySpend,
    fetchTokenStats,
    fetchChatSessions,
    instanceDisplayNames,
  } = useAppStore()
  const { currency, exchangeRate, toggleCurrency, formatCurrency } = useCurrency()
  const [timeRange, setTimeRange] = useState<string>("7d")
  const [dailyHistory, setDailyHistory] = useState<DailySpendEntry[]>([])
  const [tokenDailyHistory, setTokenDailyHistory] = useState<TokenDailyEntry[]>([])
  const [loadingCharts, setLoadingCharts] = useState(false)

  const displayNames = (instanceDisplayNames ?? {}) as Record<string, string>

  useEffect(() => {
    const load = async () => {
      await invoke("sync_usage_from_sessions")
      fetchTodaySpend()
      fetchTokenStats()
      fetchChatSessions()
    }
    load()
  }, [fetchTodaySpend, fetchTokenStats, fetchChatSessions])

  useEffect(() => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
    setLoadingCharts(true)
    Promise.all([
      invoke<DailySpendEntry[]>("get_spend_daily_history", { days }),
      invoke<TokenDailyEntry[]>("get_token_daily_history", { days }),
    ])
      .then(([spend, token]) => {
        setDailyHistory(spend)
        setTokenDailyHistory(token)
      })
      .catch(() => {
        setDailyHistory([])
        setTokenDailyHistory([])
      })
      .finally(() => setLoadingCharts(false))
  }, [timeRange])

  const agentUsageData = buildAgentUsageData(tokenStats, displayNames)
  const ringData = toRingData(agentUsageData)

  const totalInput = tokenStats?.totalInput ?? 0
  const totalOutput = tokenStats?.totalOutput ?? 0
  const totalTokens = totalInput + totalOutput
  const costChartData = dailyHistory.map((d) => ({
    date: new Date(d.date + "T12:00:00"),
    value: d.usd,
  }))

  const tokenTrendAgentIds = [
    ...new Set(
      tokenDailyHistory.flatMap((d) => Object.keys(d.agents ?? {}))
    ),
  ]
  const tokenTrendData = tokenDailyHistory.map((d) => {
    const row: Record<string, unknown> = {
      date: new Date(d.date + "T12:00:00"),
    }
    for (const id of tokenTrendAgentIds) {
      const t = d.agents?.[id]
      row[id] = (t?.input ?? 0) + (t?.output ?? 0)
    }
    return row
  })

  const inputPct =
    totalTokens > 0 ? Math.round((totalInput / totalTokens) * 100) : 0
  const outputPct = totalTokens > 0 ? 100 - inputPct : 0

  return (
    <ContentLayout>
      <PageHeader
        title="数据分析"
        subtitle={`Token 与成本统计（来自 OpenClaw 会话） · 参考汇率 1 USD = ${exchangeRate} CNY`}
        actions={
          <>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 h-8 text-xs border-app-border bg-app-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">近 7 天</SelectItem>
                <SelectItem value="30d">近 30 天</SelectItem>
                <SelectItem value="90d">近 90 天</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={toggleCurrency}
              className="rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-xs font-medium text-app-text hover:bg-app-hover transition-colors h-8"
            >
              {currency}
            </button>
          </>
        }
      />

      <div className="space-y-6">
        {/* KPI cards: equal height, one-line subtitle */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0 }}>
            <Card className="bg-app-surface h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-app-muted">今日消费</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <DollarSign className="h-4 w-4 text-amber-500" />
                </div>
              </CardHeader>
              <CardContent className="min-h-[72px]">
                <div className="text-2xl font-bold text-app-text tabular-nums">
                  {todaySpend != null ? formatCurrency(todaySpend.todayUsd) : "—"}
                </div>
                <p className="text-xs text-app-muted mt-1 truncate" title="今日累计（USD 同步自会话）">今日累计</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <Card className="bg-app-surface h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-app-muted">总 Token</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Hash className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent className="min-h-[72px]">
                <div className="text-2xl font-bold text-app-text tabular-nums">
                  {prettyTokens(totalTokens)}
                </div>
                <p className="text-xs text-app-muted mt-1 truncate" title="Input+Output 累计所有 Agent">Input+Output 累计</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <Card className="bg-app-surface h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-app-muted">活跃 Agent</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent className="min-h-[72px]">
                <div className="text-2xl font-bold text-app-text tabular-nums">
                  {tokenStats?.agents ? Object.keys(tokenStats.agents).length : 0}
                </div>
                <p className="text-xs text-app-muted mt-1 truncate">已产生用量</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <Card className="bg-app-surface h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-app-muted">会话消息</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                  <MessageSquare className="h-4 w-4 text-violet-500" />
                </div>
              </CardHeader>
              <CardContent className="min-h-[72px]">
                <div className="text-2xl font-bold text-app-text tabular-nums">
                  {(chatSessions ?? []).reduce((n, s) => n + (s.messageCount ?? 0), 0)}
                </div>
                <p className="text-xs text-app-muted mt-1 truncate" title="当前会话消息总条数">当前会话总条数</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Cost trend (daily) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="bg-app-surface overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold text-app-text">
                  成本趋势
                </CardTitle>
                <p className="text-sm text-app-muted mt-0.5">
                  每日消费（{currency}）· 数据来自 spend 记录与今日累计
                </p>
              </div>
              {loadingCharts && (
                <RefreshCw className="h-4 w-4 animate-spin text-app-muted" />
              )}
            </CardHeader>
            <CardContent className="pt-0 pb-6">
              {costChartData.length === 0 && !loadingCharts ? (
                <div className="flex flex-col items-center justify-center py-12 text-app-muted">
                  <p className="text-sm">暂无按日消费数据</p>
                  <p className="text-xs mt-1">使用 Agent 并同步会话后会出现趋势</p>
                </div>
              ) : costChartData.length > 0 ? (
                <LineChart
                  data={costChartData}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  aspectRatio="4 / 1"
                >
                  <Grid horizontal />
                  <Line
                    dataKey="value"
                    stroke="hsl(38, 92%, 50%)"
                    strokeWidth={2.5}
                  />
                  <BklitXAxis numTicks={Math.min(7, costChartData.length)} />
                  <ChartTooltip
                    rows={(point) => [
                      {
                        color: "hsl(38, 92%, 50%)",
                        label: "消费",
                        value: formatCurrency((point.value as number) ?? 0),
                      },
                    ]}
                  />
                </LineChart>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>

        {/* Token trend by agent */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Card className="bg-app-surface overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold text-app-text">
                  Token 用量趋势
                </CardTitle>
                <p className="text-sm text-app-muted mt-0.5">
                  按日累计，每 Agent 一条线
                </p>
              </div>
              {loadingCharts && (
                <RefreshCw className="h-4 w-4 animate-spin text-app-muted" />
              )}
            </CardHeader>
            <CardContent className="pt-0 pb-6">
              {tokenTrendData.length === 0 && !loadingCharts ? (
                <div className="flex flex-col items-center justify-center py-12 text-app-muted">
                  <p className="text-sm">暂无按日 Token 数据</p>
                  <p className="text-xs mt-1">使用 Agent 并产生会话后会出现趋势</p>
                </div>
              ) : tokenTrendData.length > 0 ? (
                <LineChart
                  data={tokenTrendData}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  aspectRatio="4 / 1"
                >
                  <Grid horizontal />
                  {tokenTrendAgentIds.map((agentId, i) => (
                    <Line
                      key={agentId}
                      dataKey={agentId}
                      stroke={TOKEN_TREND_COLORS[i % TOKEN_TREND_COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                  <BklitXAxis numTicks={Math.min(7, tokenTrendData.length)} />
                  <ChartTooltip
                    rows={(point) =>
                      tokenTrendAgentIds
                        .map((id, idx) => ({
                          color:
                            TOKEN_TREND_COLORS[idx % TOKEN_TREND_COLORS.length],
                          label: getAgentDisplayName(id, displayNames),
                          value: prettyTokens((point[id] as number) ?? 0),
                        }))
                        .filter((_, idx) => ((point[tokenTrendAgentIds[idx]] as number) ?? 0) > 0)
                    }
                  />
                </LineChart>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Token by agent — ring */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex"
          >
            <Card className="bg-app-surface overflow-hidden flex-1 flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-app-text">
                  按 Agent 分类用量
                </CardTitle>
                <p className="text-sm text-app-muted">Token 占比（累计）</p>
              </CardHeader>
              <CardContent className="pt-0 pb-4 flex-1 flex items-center justify-center min-h-[260px]">
                {ringData.length > 0 ? (
                  <div className="w-full flex justify-center">
                    <RingChart
                      data={ringData}
                      size={240}
                      strokeWidth={12}
                      ringGap={6}
                      baseInnerRadius={50}
                    >
                      {ringData.map((_, idx) => (
                        <Ring key={idx} index={idx} />
                      ))}
                      <RingCenter
                        defaultLabel="总使用"
                        formatOptions={{ notation: "standard" }}
                      />
                    </RingChart>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-app-muted text-sm">
                    <p>暂无 Agent 使用数据</p>
                    <p className="text-xs mt-1">同步会话后显示</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Input vs output by agent — bar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex"
          >
            <Card className="bg-app-surface overflow-hidden flex-1 flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-app-text">
                  Input vs Output
                </CardTitle>
                <p className="text-sm text-app-muted">
                  按 Agent 对比（累计）
                  {totalTokens > 0 && (
                    <span className="ml-1.5 text-app-muted/80">
                      · 总量 Input {inputPct}% / Output {outputPct}%
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="pt-0 pb-4 flex-1 min-h-[260px]">
                {agentUsageData.length > 0 ? (
                  <BarChart
                    data={agentUsageData}
                    xDataKey="name"
                    margin={{ top: 10, right: 20, bottom: 30, left: 50 }}
                    aspectRatio="2 / 1"
                  >
                    <Grid horizontal />
                    <Bar
                      dataKey="input"
                      fill="hsl(217, 91%, 60%)"
                    />
                    <Bar
                      dataKey="output"
                      fill="hsl(142, 76%, 36%)"
                    />
                    <ChartTooltip
                      rows={(point) => [
                        {
                          color: "hsl(217, 91%, 60%)",
                          label: "Input",
                          value: prettyTokens((point.input as number) ?? 0),
                        },
                        {
                          color: "hsl(142, 76%, 36%)",
                          label: "Output",
                          value: prettyTokens((point.output as number) ?? 0),
                        },
                      ]}
                    />
                  </BarChart>
                ) : (
                  <div className="flex flex-col items-center justify-center text-app-muted h-full text-sm">
                    <p>暂无数据</p>
                    <p className="text-xs mt-1">同步会话后显示</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </ContentLayout>
  )
}
