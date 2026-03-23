import { useTranslation } from "react-i18next"
import { useAppStore } from "../stores/appStore"
import { GlobalInstanceSwitcher } from "./GlobalInstanceSwitcher"
import { cn } from "../lib/utils"
import {
  AGENT_CONFIG_NAV_GROUPS,
  TEAM_NAV_GROUP,
  type AgentConfigSectionId,
} from "../constants/agentConfigNav"
import {
  MessageCircle,
  Bot,
  Radio,
  Zap,
  Clock,
  FileText,
  Code,
  Globe,
  Bell,
  GitMerge,
  Terminal,
  UserCircle,
  LayoutDashboard,
} from "lucide-react"

const SIDEBAR_WIDTH = 212

const SECTION_ICONS: Record<AgentConfigSectionId, React.ElementType> = {
  model: Bot,
  channels: Radio,
  skills: Zap,
  session: Clock,
  team_agents: UserCircle,
  team_space: LayoutDashboard,
  workspace: FileText,
  browser: Globe,
  wakeup: Bell,
  hooks: GitMerge,
  logs: Terminal,
  advanced: Code,
}

export function InstanceSidebar() {
  const { t } = useTranslation()
  const currentView = useAppStore((s) => s.currentView)
  const agentConfigSection = useAppStore((s) => s.agentConfigSection)
  const openclawConfig = useAppStore((s) => s.openclawConfig)
  const agentsCount = openclawConfig?.agents?.list?.length ?? 0
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setAgentConfigSection = useAppStore((s) => s.setAgentConfigSection)

  const goToConfig = (section: AgentConfigSectionId) => {
    setCurrentView("agents")
    setAgentConfigSection(section)
  }

  return (
    <aside
      className={cn(
        "pond-panel-chrome relative z-[1] flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden py-3.5 pl-3 pr-2.5",
        "sidebar-glass",
      )}
      style={{ width: SIDEBAR_WIDTH }}
      aria-label={t("sidebar.ariaInstance")}
    >
      <div className="mb-3.5 shrink-0 px-1 [&_button]:w-full [&_button]:justify-between">
        <GlobalInstanceSwitcher />
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-1"
        aria-label={t("sidebar.ariaCurrentInstance")}
      >
        <button
          type="button"
          onClick={() => setCurrentView("chat")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-[color,background-color,box-shadow] duration-200",
            currentView === "chat"
              ? "bg-claw-500/[0.14] text-claw-700 ring-1 ring-inset ring-claw-500/20 dark:text-claw-300 dark:ring-claw-400/25"
              : "text-app-muted hover:bg-app-hover/70 hover:text-app-text",
          )}
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("nav.chat")}</span>
        </button>

        <div
          className="mx-1 my-2.5 h-px bg-gradient-to-r from-transparent via-app-border/70 to-transparent"
          role="separator"
        />
        <div className="flex flex-col gap-0.5">
          <p className="select-none px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-app-muted opacity-[0.42] dark:opacity-[0.38]">
            {t(`navGroups.${TEAM_NAV_GROUP.groupKey}`)}
          </p>
          {TEAM_NAV_GROUP.items.map(({ id }) => {
            const Icon = SECTION_ICONS[id]
            const active =
              currentView === "agents" && agentConfigSection === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => goToConfig(id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-[color,background-color,box-shadow] duration-200",
                  active
                    ? "bg-claw-500/[0.14] text-claw-700 ring-1 ring-inset ring-claw-500/20 dark:text-claw-300 dark:ring-claw-400/25"
                    : "text-app-muted hover:bg-app-hover/70 hover:text-app-text",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {t(`navSections.${id}`)}
                </span>
                {id === "team_agents" && (
                  <span
                    className="shrink-0 rounded-md border border-app-border/40 bg-app-elevated/60 px-1.5 py-px text-[10px] tabular-nums text-app-muted/80 dark:border-app-border/30 dark:bg-app-elevated/40"
                    title={t("sidebar.roleCountTitle")}
                  >
                    {agentsCount > 0 ? agentsCount : "—"}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {AGENT_CONFIG_NAV_GROUPS.map((g) => (
          <div key={g.groupKey} className="flex flex-col gap-0.5">
            <p
              className={cn(
                "mt-2 select-none border-t border-app-border/30 px-3 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-app-muted opacity-[0.42] dark:border-app-border/25 dark:opacity-[0.38]",
              )}
            >
              {t(`navGroups.${g.groupKey}`)}
            </p>
            {g.items.map(({ id }) => {
              const Icon = SECTION_ICONS[id]
              const active =
                currentView === "agents" && agentConfigSection === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => goToConfig(id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-[color,background-color,box-shadow] duration-200",
                    active
                      ? "bg-claw-500/[0.14] text-claw-700 ring-1 ring-inset ring-claw-500/20 dark:text-claw-300 dark:ring-claw-400/25"
                      : "text-app-muted hover:bg-app-hover/70 hover:text-app-text",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`navSections.${id}`)}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export { SIDEBAR_WIDTH }
