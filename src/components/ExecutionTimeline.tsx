import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Clock, CheckCircle2, XCircle, Loader2, MessageSquare, Wrench, Brain, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

/** Step kind */
export type ExecutionStepType = "message" | "tool_call" | "thinking" | "approval" | "completion"

/** Step status */
export type ExecutionStepStatus = "pending" | "running" | "completed" | "failed"

/** One timeline step */
export interface ExecutionStep {
  id: string
  /** Live: Date; restored from JSON may be ISO string */
  timestamp: Date | string
  type: ExecutionStepType
  content: string
  status: ExecutionStepStatus
  duration?: number // ms
  metadata?: {
    toolName?: string
    toolArgs?: string
    toolResult?: string
    error?: string
  }
}

interface ExecutionTimelineProps {
  steps: ExecutionStep[]
  isExecuting?: boolean
  className?: string
  /** Embedded in Dialog: no outer Card (parent supplies title) */
  embedded?: boolean
}

function getStepIcon(type: ExecutionStepType, status: ExecutionStepStatus) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin" />
  }
  if (status === "failed") {
    return <XCircle className="h-4 w-4" />
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4" />
  }

  switch (type) {
    case "message":
      return <MessageSquare className="h-4 w-4" />
    case "tool_call":
      return <Wrench className="h-4 w-4" />
    case "thinking":
      return <Brain className="h-4 w-4" />
    case "approval":
      return <Clock className="h-4 w-4" />
    case "completion":
      return <CheckCircle2 className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

function getStepColor(type: ExecutionStepType, status: ExecutionStepStatus) {
  if (status === "running") return "text-blue-500"
  if (status === "failed") return "text-red-500"
  if (status === "completed") return "text-emerald-500"

  switch (type) {
    case "tool_call":
      return "text-amber-500"
    case "thinking":
      return "text-purple-500"
    case "approval":
      return "text-orange-500"
    default:
      return "text-app-muted"
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function formatTimestamp(date: Date | string, locale: string): string {
  const d = date instanceof Date ? date : new Date(date)
  const loc = locale.startsWith("zh") ? "zh-CN" : "en-US"
  return d.toLocaleTimeString(loc, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function StepItem({
  step,
  isLast,
}: {
  step: ExecutionStep
  isLast: boolean
}) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const hasMetadata = step.metadata && (
    step.metadata.toolName || 
    step.metadata.toolArgs || 
    step.metadata.toolResult || 
    step.metadata.error
  )

  return (
    <div className="relative flex gap-3 pb-4">
      {/* Vertical connector */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 h-full w-px bg-app-border" />
      )}

      {/* Icon */}
      <div className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-app-surface",
        getStepColor(step.type, step.status),
        step.status === "completed" && "border-emerald-500/20 bg-emerald-500/10",
        step.status === "running" && "border-blue-500/20 bg-blue-500/10",
        step.status === "failed" && "border-red-500/20 bg-red-500/10",
        step.status === "pending" && "border-app-border"
      )}>
        {getStepIcon(step.type, step.status)}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn(
            "font-medium",
            getStepColor(step.type, step.status)
          )}>
            {t(`executionTimeline.stepTypes.${step.type}`)}
          </span>
          <span className="text-[11px] text-app-muted">
            {formatTimestamp(step.timestamp, i18n.language)}
          </span>
          {step.duration !== undefined && (
            <>
              <span className="text-app-border">·</span>
              <span className="text-[11px] text-app-muted">
                {formatDuration(step.duration)}
              </span>
            </>
          )}
        </div>

        <p className="mt-0.5 text-sm text-app-text break-words">
          {step.content}
        </p>

        {/* Expandable metadata */}
        {hasMetadata && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-app-muted hover:text-app-text"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? t("executionTimeline.collapseDetails") : t("executionTimeline.expandDetails")}
            </Button>

            {expanded && (
              <div className="mt-2 space-y-2 rounded-lg border border-app-border bg-app-elevated/50 p-3 text-xs">
                {step.metadata?.toolName && (
                  <div>
                    <span className="font-medium text-app-muted">{t("executionTimeline.toolName")}</span>
                    <span className="font-mono text-app-text">{step.metadata.toolName}</span>
                  </div>
                )}
                {step.metadata?.toolArgs && (
                  <div>
                    <span className="font-medium text-app-muted">{t("executionTimeline.args")}</span>
                    <pre className="mt-1 overflow-x-auto rounded bg-app-bg p-2 font-mono text-[11px] text-app-text">
                      {step.metadata.toolArgs}
                    </pre>
                  </div>
                )}
                {step.metadata?.toolResult && (
                  <div>
                    <span className="font-medium text-app-muted">{t("executionTimeline.result")}</span>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-app-bg p-2 font-mono text-[11px] text-app-text">
                      {step.metadata.toolResult}
                    </pre>
                  </div>
                )}
                {step.metadata?.error && (
                  <div>
                    <span className="font-medium text-red-500">{t("executionTimeline.error")}</span>
                    <pre className="mt-1 overflow-x-auto rounded bg-red-500/5 p-2 font-mono text-[11px] text-red-500">
                      {step.metadata.error}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineStatsBar({
  steps,
  isExecuting,
  showHeading = true,
}: {
  steps: ExecutionStep[]
  isExecuting?: boolean
  showHeading?: boolean
}) {
  const { t } = useTranslation()
  const totalDuration = steps.reduce((sum, step) => sum + (step.duration || 0), 0)
  const completedSteps = steps.filter((s) => s.status === "completed").length
  const failedSteps = steps.filter((s) => s.status === "failed").length

  const stats = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-muted">
      {isExecuting && (
        <div className="flex items-center gap-1.5 text-blue-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{t("executionTimeline.running")}</span>
        </div>
      )}
      <span>
        {t("executionTimeline.stepsProgress", {
          completed: completedSteps,
          total: steps.length,
        })}
      </span>
      {failedSteps > 0 && (
        <span className="text-red-500">
          {t("executionTimeline.errorsCount", { n: failedSteps })}
        </span>
      )}
      {totalDuration > 0 && (
        <>
          <span className="text-app-border">·</span>
          <span>
            {t("executionTimeline.totalDuration", {
              duration: formatDuration(totalDuration),
            })}
          </span>
        </>
      )}
    </div>
  )

  if (!showHeading) {
    return <div className="border-b border-app-border/40 pb-3">{stats}</div>
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border/40 pb-3">
      <span className="text-sm font-medium text-app-text">{t("executionTimeline.title")}</span>
      {stats}
    </div>
  )
}

export function ExecutionTimeline({
  steps,
  isExecuting,
  className,
  embedded,
}: ExecutionTimelineProps) {
  const { t } = useTranslation()

  if (steps.length === 0) {
    if (embedded) {
      return null
    }
    return (
      <Card className={cn("bg-app-surface", className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Clock className="h-8 w-8 text-app-muted opacity-40" />
          <p className="mt-3 text-sm text-app-muted">{t("executionTimeline.emptyTitle")}</p>
          <p className="mt-1 text-xs text-app-muted/60">{t("executionTimeline.emptyHint")}</p>
        </CardContent>
      </Card>
    )
  }

  const list = (
    <div className="space-y-0">
      {steps.map((step, index) => (
        <StepItem key={step.id} step={step} isLast={index === steps.length - 1} />
      ))}
    </div>
  )

  if (embedded) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <TimelineStatsBar steps={steps} isExecuting={isExecuting} showHeading={false} />
        <div className="mt-3 min-h-0 max-h-[min(65vh,560px)] flex-1 overflow-y-auto pr-1">
          {list}
        </div>
      </div>
    )
  }

  const totalDuration = steps.reduce((sum, step) => sum + (step.duration || 0), 0)
  const completedSteps = steps.filter((s) => s.status === "completed").length
  const failedSteps = steps.filter((s) => s.status === "failed").length

  return (
    <Card className={cn("bg-app-surface", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-app-text">
            {t("executionTimeline.title")}
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-app-muted">
            {isExecuting && (
              <div className="flex items-center gap-1.5 text-blue-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{t("executionTimeline.running")}</span>
              </div>
            )}
            <span>
              {t("executionTimeline.stepsProgress", {
                completed: completedSteps,
                total: steps.length,
              })}
            </span>
            {failedSteps > 0 && (
              <span className="text-red-500">
                {t("executionTimeline.errorsCount", { n: failedSteps })}
              </span>
            )}
            {totalDuration > 0 && (
              <>
                <span className="text-app-border">·</span>
                <span>
                  {t("executionTimeline.totalDuration", {
                    duration: formatDuration(totalDuration),
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto">{list}</CardContent>
    </Card>
  )
}
