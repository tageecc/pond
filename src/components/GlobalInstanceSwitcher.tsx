import { useState } from "react"
import { useAppStore } from "../stores/appStore"
import { getAgentDisplayName } from "../lib/utils"
import { Check, ChevronDown, Plus, Users } from "lucide-react"
import { cn } from "../lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { CreateOpenClawInstanceDialog } from "./CreateOpenClawInstanceDialog"
import type { ChannelInstanceConfig, OpenClawConfig } from "../types"
import { pondInstanceIdsList, resolvePondInstanceId } from "../lib/pondInstanceId"
import { OPENCLAW_CHANNEL_ID_SET } from "../constants/openclawChannels"

function boundChannelsFor(config: OpenClawConfig | null, agentId: string): number {
  if (!config?.channels) return 0
  const ch = config.channels
  return Object.keys(ch).filter((id) => {
    if (!OPENCLAW_CHANNEL_ID_SET.has(id)) return false
    const raw = ch[id]
    if (!raw || typeof raw !== "object") return false
    return (raw as ChannelInstanceConfig).agentId === agentId
  }).length
}

export function GlobalInstanceSwitcher() {
  const instanceIds = useAppStore((s) => s.instanceIds)
  const instanceDisplayNames = useAppStore((s) => s.instanceDisplayNames) ?? {}
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId)
  const switchInstance = useAppStore((s) => s.switchInstance)
  const openclawConfig = useAppStore((s) => s.openclawConfig)
  const instanceSkillCounts = useAppStore((s) => s.instanceSkillCounts)

  const [createOpen, setCreateOpen] = useState(false)

  const agents = pondInstanceIdsList(instanceIds, openclawConfig)
  const currentId = resolvePondInstanceId(instanceIds, selectedInstanceId, openclawConfig)
  const displayNames = instanceDisplayNames as Record<string, string>

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-xl border border-app-border/80 bg-app-surface/80 px-3 py-2.5 text-sm font-medium text-app-text shadow-sm transition-colors",
            "hover:bg-app-hover hover:border-app-border outline-none focus:ring-2 focus:ring-claw-500/30 focus:ring-offset-1 focus:ring-offset-transparent"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-claw-500/10 text-claw-600 dark:text-claw-400">
            <Users className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {currentId ? getAgentDisplayName(currentId, displayNames) : "选择实例"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-app-muted transition-transform group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[260px] flex flex-col gap-1.5 rounded-xl border-app-border/80 bg-app-surface p-2 shadow-lg">
          {agents.map((id) => {
            const name = getAgentDisplayName(id, displayNames)
            const channelCount = boundChannelsFor(openclawConfig, id)
            const skillCount = instanceSkillCounts[id]
            const skillLabel = skillCount != null ? `${skillCount} 技能` : '—'
            const selected = currentId === id
            return (
              <DropdownMenuItem
                key={id}
                onClick={() => switchInstance(id).catch(() => {})}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 outline-none transition-colors",
                  "focus:bg-app-hover data-[highlighted]:bg-app-hover",
                  selected && "bg-claw-500/10 ring-1 ring-claw-500/20"
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  selected ? "bg-claw-500/20 text-claw-600 dark:text-claw-400" : "bg-app-elevated/80 text-app-muted"
                )}>
                  <Users className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <p className={cn(
                    "truncate text-sm font-medium",
                    selected && "text-claw-600 dark:text-claw-400"
                  )}>{name}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-app-muted">
                    <span>{channelCount} 渠道</span>
                    <span aria-hidden>·</span>
                    <span>{skillLabel}</span>
                  </div>
                </div>
                {selected && (
                  <Check className="h-4 w-4 shrink-0 text-claw-600 dark:text-claw-400" />
                )}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator className="bg-app-border/80" />
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-claw-600 dark:text-claw-400 outline-none focus:bg-claw-500/10 data-[highlighted]:bg-claw-500/10"
            onSelect={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 shrink-0" />
            新建 OpenClaw 实例
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOpenClawInstanceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
