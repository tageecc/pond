import { useState } from "react"
import { useTranslation } from "react-i18next"
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
import { pondInstanceIdsList, resolvePondInstanceId } from "../lib/pondInstanceId"

export function GlobalInstanceSwitcher() {
  const { t } = useTranslation()
  const instanceIds = useAppStore((s) => s.instanceIds)
  const instanceDisplayNames = useAppStore((s) => s.instanceDisplayNames) ?? {}
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId)
  const switchInstance = useAppStore((s) => s.switchInstance)

  const [createOpen, setCreateOpen] = useState(false)

  const agents = pondInstanceIdsList(instanceIds)
  const currentId = resolvePondInstanceId(instanceIds, selectedInstanceId)
  const displayNames = instanceDisplayNames as Record<string, string>

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-xl border border-app-border/80 bg-app-surface px-3 py-2.5 text-sm font-medium text-app-text shadow-sm transition-colors",
            "hover:bg-app-hover hover:border-app-border outline-none focus:ring-2 focus:ring-claw-500/30 focus:ring-offset-1 focus:ring-offset-transparent"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-claw-500/10 text-claw-600 dark:text-claw-400">
            <Users className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {currentId ? getAgentDisplayName(currentId, displayNames) : t("instanceSwitcher.placeholder")}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-app-muted transition-transform group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[260px] flex flex-col gap-1.5 rounded-xl border-app-border/80 bg-app-surface p-2 shadow-lg">
          {agents.map((id) => {
            const name = getAgentDisplayName(id, displayNames)
            const selected = currentId === id
            return (
              <DropdownMenuItem
                key={id}
                onClick={() => switchInstance(id).catch(() => {})}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors",
                  "focus:bg-app-hover data-[highlighted]:bg-app-hover",
                  selected && "bg-claw-500/10 ring-1 ring-claw-500/20"
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  selected ? "bg-claw-500/20 text-claw-600 dark:text-claw-400" : "bg-app-elevated text-app-muted"
                )}>
                  <Users className="h-4 w-4" />
                </span>
                <p className={cn(
                  "min-w-0 flex-1 truncate text-left text-sm font-medium",
                  selected && "text-claw-600 dark:text-claw-400"
                )}>{name}</p>
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
            {t("instanceSwitcher.createNew")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOpenClawInstanceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
