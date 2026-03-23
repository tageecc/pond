import { useState, useEffect, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { toast } from "sonner"
import { useAppStore } from "../stores/appStore"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Switch } from "./ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import {
  Users,
  UserCircle,
  LayoutDashboard,
  Plus,
  Trash2,
  Save,
  Loader2,
  FileText,
  FolderOpen,
  Heart,
  Clock,
  Wrench,
  Bot,
  Download,
  ChevronDown,
  Star,
  TestTube,
  ExternalLink,
  Globe,
  MessageCircle,
  HelpCircle,
  Info,
  RotateCw,
  Crown,
  ListTodo,
  CheckCircle2,
  Circle,
  XCircle,
  Sparkles,
  Radio,
  Search,
} from "lucide-react"
import { cn, getAgentDisplayName } from "../lib/utils"
import type {
  OpenClawConfig,
  OpenClawAgentsShape,
  LLMModelConfig,
  BrowserConfig,
  BrowserProfileConfig,
  TeamMeta,
  TeamMetaEditForm,
  TeamTask,
  MultiAgentActivityRow,
} from "../types"
import { isValidOpenClawAgentId, normalizeAgentsListOrder } from "../lib/agentsList"
import { isUnifiedDmContinuity } from "../lib/chatSessionKeys"
import {
  normalizeAgentListModelForPersist,
  primaryRefToFlatModelInstanceId,
} from "../lib/openclawAgentModelRef"
import { resolveTeamLeaderAgentId, TEAM_LEADER_AGENT_ID } from "../lib/teamLeader"
import { getAgentIds } from "../lib/openclawAgentsModels"
import { agentsModelsToFlatView, flatViewToAgentsModels } from "../lib/openclawAgentsModels"
import { PROVIDERS, getProvider } from "../constants/providers"
import { ModelIdField } from "./ModelIdField"
import { CreateOpenClawInstanceDialog } from "./CreateOpenClawInstanceDialog"
import { InstanceGatewayLogPanel } from "./InstanceGatewayLogPanel"
import { ChannelManager, getInternalHooksFromConfig, HooksManager } from "./ConfigWizard"
import type { HooksInternalConfig } from "../types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
/** OpenClaw workspace guide files (see https://docs.openclaw.ai/concepts/agent-workspace) */
const WORKSPACE_FILE_LABELS: Record<string, string> = {
  "AGENTS.md": "操作指令与记忆",
  "SOUL.md": "人设、边界、语气",
  "TOOLS.md": "工具说明与约定",
  "IDENTITY.md": "名称、风格、表情",
  "USER.md": "用户档案与称呼",
  "BOOT.md": "启动检查清单",
  "HEARTBEAT.md": "心跳任务清单",
  "BOOTSTRAP.md": "首次运行仪式",
}

const TOOL_PROFILES = [
  { value: "full", label: "Full - 无限制", desc: "所有工具均可用" },
  { value: "coding", label: "Coding - 编程场景", desc: "文件系统 + 运行时 + 会话 + 记忆" },
  { value: "messaging", label: "Messaging - 纯消息", desc: "仅会话和消息工具" },
  { value: "minimal", label: "Minimal - 最小化", desc: "仅状态查询工具" },
]

const CHROME_EXT_STORE_URL = "https://chromewebstore.google.com/detail/openclaw-browser-relay/nglingapjinhecnfejdcpihlpneeadjp"

function ChromeExtensionGuide() {
  const openStore = async () => {
    try {
      await openUrl(CHROME_EXT_STORE_URL)
    } catch {
      window.open(CHROME_EXT_STORE_URL, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <div className="rounded-lg border border-app-border bg-app-elevated/40 px-3 py-2.5 flex items-center justify-between gap-3">
      <p className="text-sm text-app-text">
        Chrome 模式需安装 OpenClaw Browser Relay 扩展，安装后在目标标签页点击扩展图标即可附加控制。
      </p>
      <Button size="sm" className="bg-claw-500 hover:bg-claw-600 text-white shrink-0" onClick={openStore}>
        <ExternalLink className="h-3.5 w-3.5 mr-1" />
        去安装
      </Button>
    </div>
  )
}

export function AgentView() {
  const {
    openclawConfig,
    loadConfigs,
    loadInstanceConfig,
    saveOpenClawConfig,
    refreshInstanceDisplayName,
    enabledSkills,
    skillsForInstance,
    loadSkills,
    setCurrentView,
    fetchChatSessions,
    fetchCronJobs,
    chatSessions,
    cronJobs,
    getEffectiveGatewayInfo,
    restartAgentGateway,
  } = useAppStore()

  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [workspaceFileList, setWorkspaceFileList] = useState<{ name: string; exists: boolean }[]>([])
  /** Backend copy when no guide files exist (we do not auto-create files) */
  const [workspaceFilesGuide, setWorkspaceFilesGuide] = useState<string | null>(null)
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState<string>("")
  const [workspaceFileContent, setWorkspaceFileContent] = useState("")
  const [workspaceFileSaving, setWorkspaceFileSaving] = useState(false)
  const [workspaceFileError, setWorkspaceFileError] = useState<string | null>(null)
  /** OpenClaw agents.list[].id; null = instance default workspace/ */
  const [workspaceOpenclawRoleId, setWorkspaceOpenclawRoleId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rawConfig, setRawConfig] = useState("")
  const [rawConfigError, setRawConfigError] = useState<string | null>(null)
  const [rawConfigSaving, setRawConfigSaving] = useState(false)
  const [rawConfigPath, setRawConfigPath] = useState("")
  const [discoveredAgents, setDiscoveredAgents] = useState<{ id: string; name: string; configPath: string }[]>([])
  const [importing, setImporting] = useState(false)

  const [agentSession, setAgentSession] = useState({
    dmScope: "main",
    resetMode: "off" as "off" | "never" | "daily" | "idle",
    atHour: 4,
    idleMinutes: 120,
  })
  /** Main continuity + explicit rotation off: same session across channels */
  const [sessionUnifiedContinuity, setSessionUnifiedContinuity] = useState(false)
  /** OpenClaw: `__defaults__` → agents.defaults.heartbeat; else agents.list[].id */
  const [heartbeatScope, setHeartbeatScope] = useState<string>("__defaults__")
  const [agentHeartbeat, setAgentHeartbeat] = useState({
    every: "",
    target: "none",
    lightContext: false,
    activeStart: "",
    activeEnd: "",
    to: "",
    accountId: "",
    directPolicy: "allow" as "allow" | "block",
  })
  const [agentTools, setAgentTools] = useState({ profile: "coding" })
  const [skillInstallInput, setSkillInstallInput] = useState("")
  const [skillListQuery, setSkillListQuery] = useState("")
  const [installingSkill, setInstallingSkill] = useState(false)
  const [uninstallingSkillId, setUninstallingSkillId] = useState<string | null>(null)
  // Model section state
  const [modelSelectedId, setModelSelectedId] = useState<string | null>(null)
  const [modelProvider, setModelProvider] = useState("openai")
  const [modelApiKey, setModelApiKey] = useState("")
  const [modelBaseURL, setModelBaseURL] = useState("")
  const [modelModel, setModelModel] = useState("")
  const [modelSaving, setModelSaving] = useState(false)
  const [modelSaveMsg, setModelSaveMsg] = useState<string | null>(null)
  const [modelSaveError, setModelSaveError] = useState<string | null>(null)
  const [modelTesting, setModelTesting] = useState(false)
  const [modelTestMsg, setModelTestMsg] = useState<string | null>(null)
  // Browser: openclaw (managed profile) or chrome (extension relay)
  const [browserEnabled, setBrowserEnabled] = useState(true)
  const [browserMode, setBrowserMode] = useState<"openclaw" | "chrome">("openclaw")
  const [browserUserDataDir, setBrowserUserDataDir] = useState("")
  const [browserColor, setBrowserColor] = useState("")
  const [browserExecutablePath, setBrowserExecutablePath] = useState("")
  const [browserHeadless, setBrowserHeadless] = useState(false)
  const [browserNoSandbox, setBrowserNoSandbox] = useState(false)
  const [browserAttachOnly, setBrowserAttachOnly] = useState(false)
  const [browserCommandLoading, setBrowserCommandLoading] = useState(false)
  const [browserSaving, setBrowserSaving] = useState(false)
  const [browserDefaultUserDataDir, setBrowserDefaultUserDataDir] = useState("")
  const [browserExecutablePlaceholder, setBrowserExecutablePlaceholder] = useState("")
  const [teamTasks, setTeamTasks] = useState<TeamTask[]>([])
  const [teamDashboardLoading, setTeamDashboardLoading] = useState(false)
  const [teamActivity, setTeamActivity] = useState<MultiAgentActivityRow[]>([])
  const [teamActivityError, setTeamActivityError] = useState<string | null>(null)
  const [newTeamTaskTitle, setNewTeamTaskTitle] = useState("")
  /** open = unclaimed pool; assigned = direct assign + claim */
  const [newTeamTaskAssignMode, setNewTeamTaskAssignMode] = useState<"open" | "assigned">("assigned")
  const [teamRoleAgentId, setTeamRoleAgentId] = useState("")
  const [teamTodoFilter, setTeamTodoFilter] = useState<"all" | "open" | "claimed" | "done" | "failed">("all")
  const [teamTaskUpdatingId, setTeamTaskUpdatingId] = useState<string | null>(null)
  const [teamTaskFailDialogTaskId, setTeamTaskFailDialogTaskId] = useState<string | null>(null)
  const [teamTaskFailReasonInput, setTeamTaskFailReasonInput] = useState("")
  const [teamEditMeta, setTeamEditMeta] = useState<TeamMetaEditForm>({ members: [] })
  const [teamFetchLoading, setTeamFetchLoading] = useState(false)
  const [teamFetchError, setTeamFetchError] = useState<string | null>(null)
  const [teamSaving, setTeamSaving] = useState(false)
  /** null loading; false not initialized; true enabled */
  const [teamSpaceInitialized, setTeamSpaceInitialized] = useState<boolean | null>(null)
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false)
  const [newRoleIdInput, setNewRoleIdInput] = useState("")
  const [newRoleModelKey, setNewRoleModelKey] = useState("")
  const [roleListSaving, setRoleListSaving] = useState(false)
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null)
  // Single source: store.selectedInstanceId (declare before callbacks that use it)
  const instanceIds = useAppStore((s) => s.instanceIds)
  const instanceDisplayNames = useAppStore((s) => s.instanceDisplayNames)
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId)
  const agentConfigSection = useAppStore((s) => s.agentConfigSection)
  const teamSpaceTab = useAppStore((s) => s.teamSpaceTab)
  const setTeamSpaceTab = useAppStore((s) => s.setTeamSpaceTab)
  const setAgentConfigSection = useAppStore((s) => s.setAgentConfigSection)
  const switchInstance = useAppStore((s) => s.switchInstance)
  const agents = instanceIds.length > 0 ? instanceIds : (getAgentIds(openclawConfig).length ? getAgentIds(openclawConfig) : ["default"])
  const displayNames = (instanceDisplayNames ?? {}) as Record<string, string>
  const selectedId = (selectedInstanceId && agents.includes(selectedInstanceId)) ? selectedInstanceId : (agents[0] ?? null)

  const filteredSkillsAll = useMemo(() => {
    if (!skillsForInstance?.all?.length) return []
    const q = skillListQuery.trim().toLowerCase()
    if (!q) return skillsForInstance.all
    return skillsForInstance.all.filter((row) => {
      const hay = [row.name, row.description, row.source, row.homepage ?? ""].join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [skillsForInstance, skillListQuery])

  useEffect(() => {
    setSkillListQuery("")
  }, [selectedId])

  const teamLeaderAgentId = useMemo(
    () => resolveTeamLeaderAgentId(openclawConfig?.agents?.list ?? []),
    [openclawConfig?.agents?.list],
  )

  const heartbeatRoleIds = useMemo(
    () => getAgentIds(openclawConfig ?? undefined),
    [openclawConfig],
  )

  /** Only roles with their own workspace are edited separately (matches resolve_workspace_dir) */
  const workspaceOverrideAgents = useMemo(() => {
    const list = openclawConfig?.agents?.list
    if (!Array.isArray(list)) return []
    return list.filter(
      (a) =>
        typeof a?.id === "string" &&
        a.id.trim() !== "" &&
        typeof a.workspace === "string" &&
        a.workspace.trim() !== "",
    )
  }, [openclawConfig?.agents?.list])

  const teamTasksView = useMemo(() => {
    const statusOrder: Record<string, number> = { open: 0, claimed: 1, failed: 2, done: 3 }
    let open = 0
    let claimed = 0
    let done = 0
    let failed = 0
    for (const t of teamTasks) {
      if (t.status === "open") open += 1
      else if (t.status === "claimed") claimed += 1
      else if (t.status === "done") done += 1
      else if (t.status === "failed") failed += 1
    }
    const total = open + claimed + done + failed
    const stats = {
      open,
      claimed,
      done,
      failed,
      total,
      progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
    }
    const filtered =
      teamTodoFilter === "all" ? teamTasks : teamTasks.filter((t) => t.status === teamTodoFilter)
    const sortedTasks = [...filtered].sort(
      (a, b) =>
        (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || b.updatedAtMs - a.updatedAtMs
    )
    return { stats, sortedTasks }
  }, [teamTasks, teamTodoFilter])

  const { stats: teamTaskStats, sortedTasks: teamTaskList } = teamTasksView

  const loadAgentRawConfig = useCallback(async (agentId: string) => {
    try {
      const raw = await invoke<string>("load_agent_raw_config", { agentId })
      setRawConfig(raw)
      setRawConfigError(null)
      try {
        const pathStr = await invoke<string>("get_agent_config_path", { agentId })
        setRawConfigPath(pathStr)
      } catch { setRawConfigPath("") }
    } catch (e) {
      setRawConfig("{}")
      setRawConfigError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handleSaveRawConfig = async () => {
    if (!selectedId) return
    setRawConfigSaving(true)
    setRawConfigError(null)
    try {
      JSON.parse(rawConfig) // validate
      await invoke("save_agent_raw_config", { agentId: selectedId, rawJson: rawConfig })
      await loadInstanceConfig(selectedId)
      setSaveMsg("实例配置已保存")
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setRawConfigError(e instanceof Error ? e.message : String(e))
    } finally {
      setRawConfigSaving(false)
    }
  }

  const patchAgentConfig = useCallback(async (patch: Partial<any>) => {
    if (!selectedId) return
    try {
      const raw = await invoke<string>("load_agent_raw_config", { agentId: selectedId })
      const config = JSON.parse(raw)

      const deepMerge = (target: any, source: any): any => {
        const output = { ...target }
        for (const key in source) {
          if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
            output[key] = deepMerge(target[key] || {}, source[key])
          } else {
            output[key] = source[key]
          }
        }
        return output
      }

      const merged = deepMerge(config, patch)
      const updated = JSON.stringify(merged, null, 2)
      await invoke("save_agent_raw_config", { agentId: selectedId, rawJson: updated })
      setRawConfig(updated)
      await loadInstanceConfig(selectedId)
      return true
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      return false
    }
  }, [selectedId, loadInstanceConfig])

  const loadWorkspaceFileList = useCallback(async () => {
    try {
      const result = await invoke<{ files: { name: string; exists: boolean }[]; guide?: string | null }>(
        "list_agent_workspace_files",
        {
          agentId: selectedId ?? undefined,
          openclawRoleId: workspaceOpenclawRoleId?.trim() || null,
        },
      )
      const arr = Array.isArray(result?.files) ? result.files : []
      setWorkspaceFileList(arr)
      setWorkspaceFilesGuide(typeof result?.guide === "string" && result.guide.trim() ? result.guide : null)
      setSelectedWorkspaceFile((prev) => (arr.some((f) => f.name === prev) ? prev : arr[0]?.name ?? ""))
    } catch {
      setWorkspaceFileList([])
      setWorkspaceFilesGuide(null)
    }
  }, [selectedId, workspaceOpenclawRoleId])

  const loadWorkspaceFileContent = useCallback(async (filename: string) => {
    if (!filename) return
    setWorkspaceFileError(null)
    try {
      const content = await invoke<string>("read_agent_workspace_file", {
        agentId: selectedId ?? undefined,
        filename,
        openclawRoleId: workspaceOpenclawRoleId?.trim() || null,
      })
      setWorkspaceFileContent(typeof content === "string" ? content : "")
    } catch (e) {
      setWorkspaceFileError(e instanceof Error ? e.message : String(e))
      setWorkspaceFileContent("")
    }
  }, [selectedId, workspaceOpenclawRoleId])

  const refreshDiscoveredAgents = useCallback(() => {
    invoke<{ id: string; name: string; configPath: string }[]>("discover_system_agents")
      .then(setDiscoveredAgents)
      .catch(() => { })
  }, [])

  useEffect(() => {
    loadConfigs()
    refreshDiscoveredAgents()
  }, [loadConfigs, refreshDiscoveredAgents])

  // Refresh display names from IDENTITY.md when opening instance list
  const instanceIdsForRefresh = useAppStore((s) => s.instanceIds)
  useEffect(() => {
    if (instanceIdsForRefresh.length === 0) return
    instanceIdsForRefresh.forEach((id) => refreshInstanceDisplayName(id).catch(() => {}))
  }, [instanceIdsForRefresh.join(","), refreshInstanceDisplayName])

  useEffect(() => {
    if (selectedId) {
      setWorkspaceOpenclawRoleId(null)
      loadAgentRawConfig(selectedId)
    } else {
      setWorkspaceOpenclawRoleId(null)
      setWorkspaceFileList([])
      setWorkspaceFilesGuide(null)
      setSelectedWorkspaceFile("")
      setWorkspaceFileContent("")
      setRawConfig("")
      setRawConfigPath("")
    }
  }, [selectedId, loadAgentRawConfig])

  useEffect(() => {
    if (!selectedId) return
    void loadWorkspaceFileList()
  }, [selectedId, workspaceOpenclawRoleId, loadWorkspaceFileList])

  useEffect(() => {
    if (workspaceOpenclawRoleId === null) return
    const list = openclawConfig?.agents?.list
    if (!Array.isArray(list)) {
      setWorkspaceOpenclawRoleId(null)
      return
    }
    const entry = list.find((a) => a.id === workspaceOpenclawRoleId)
    const hasDistinct =
      entry &&
      typeof entry.workspace === "string" &&
      entry.workspace.trim() !== ""
    if (!hasDistinct) setWorkspaceOpenclawRoleId(null)
  }, [openclawConfig, workspaceOpenclawRoleId])

  useEffect(() => {
    if (selectedWorkspaceFile) loadWorkspaceFileContent(selectedWorkspaceFile)
  }, [selectedWorkspaceFile, loadWorkspaceFileContent])

  useEffect(() => {
    if (!openclawConfig || !selectedId) return
    const s = openclawConfig.session
    if (s && typeof s === "object") {
      const dm = (s.dmScope as string) ?? "main"
      const rm = s.reset?.mode
      const resetMode: "off" | "never" | "daily" | "idle" =
        rm === "off" ? "never" : rm === "daily" ? "daily" : rm === "idle" ? "idle" : "off"
      setAgentSession({
        dmScope: dm,
        resetMode,
        atHour: s.reset?.atHour ?? 4,
        idleMinutes: s.reset?.idleMinutes ?? 120,
      })
      setSessionUnifiedContinuity(isUnifiedDmContinuity(s))
    } else {
      setAgentSession({
        dmScope: "main",
        resetMode: "off",
        atHour: 4,
        idleMinutes: 120,
      })
      setSessionUnifiedContinuity(false)
    }
    const t = openclawConfig.tools
    if (t && typeof t === "object" && "profile" in t) {
      setAgentTools({
        profile: (t as { profile?: string }).profile ?? "coding",
      })
    } else {
      setAgentTools({ profile: "coding" })
    }
    const agents = openclawConfig.agents
    let hb: Record<string, unknown> | undefined
    if (heartbeatScope === "__defaults__") {
      hb = agents?.defaults?.heartbeat as Record<string, unknown> | undefined
    } else {
      hb = agents?.list
        ?.find((a) => a.id === heartbeatScope)
        ?.heartbeat as Record<string, unknown> | undefined
    }
    if (hb && typeof hb === "object") {
      setAgentHeartbeat({
        every: typeof hb.every === "string" ? hb.every : "",
        target: typeof hb.target === "string" ? hb.target : "none",
        lightContext: hb.lightContext === true,
        activeStart:
          hb.activeHours &&
          typeof hb.activeHours === "object" &&
          typeof (hb.activeHours as { start?: string }).start === "string"
            ? (hb.activeHours as { start: string }).start
            : "",
        activeEnd:
          hb.activeHours &&
          typeof hb.activeHours === "object" &&
          typeof (hb.activeHours as { end?: string }).end === "string"
            ? (hb.activeHours as { end: string }).end
            : "",
        to: typeof hb.to === "string" ? hb.to : "",
        accountId: typeof hb.accountId === "string" ? hb.accountId : "",
        directPolicy: hb.directPolicy === "block" ? "block" : "allow",
      })
    } else {
      setAgentHeartbeat({
        every: "",
        target: "none",
        lightContext: false,
        activeStart: "",
        activeEnd: "",
        to: "",
        accountId: "",
        directPolicy: "allow",
      })
    }
  }, [openclawConfig, selectedId, heartbeatScope])

  useEffect(() => {
    if (
      heartbeatScope !== "__defaults__" &&
      !heartbeatRoleIds.includes(heartbeatScope)
    ) {
      setHeartbeatScope("__defaults__")
    }
  }, [heartbeatRoleIds, heartbeatScope])

  useEffect(() => {
    if (agentConfigSection !== "browser" || !openclawConfig || !selectedId) return
    const b = openclawConfig.browser as BrowserConfig | undefined
    setBrowserEnabled(b?.enabled !== false)
    setBrowserExecutablePath((b?.executablePath as string) ?? "")
    setBrowserHeadless(!!b?.headless)
    setBrowserNoSandbox(!!b?.noSandbox)
    setBrowserAttachOnly(!!b?.attachOnly)
    const defaultProfile = (b?.defaultProfile as string) || "openclaw"
    setBrowserMode(defaultProfile === "chrome" ? "chrome" : "openclaw")
    const profiles = b?.profiles ?? {}
    const openclawProfile = profiles.openclaw as BrowserProfileConfig | undefined
    setBrowserUserDataDir((openclawProfile?.userDataDir as string) ?? "")
    setBrowserColor((openclawProfile?.color as string) ?? (b?.color as string) ?? "")
  }, [agentConfigSection, openclawConfig, selectedId])

  useEffect(() => {
    if (agentConfigSection !== "browser" || !selectedId) return
    invoke<string>("get_browser_default_user_data_dir", { agentId: selectedId })
      .then(setBrowserDefaultUserDataDir)
      .catch(() => setBrowserDefaultUserDataDir(""))
    invoke<string>("get_browser_executable_placeholder")
      .then(setBrowserExecutablePlaceholder)
      .catch(() => setBrowserExecutablePlaceholder(""))
  }, [agentConfigSection, selectedId])

  useEffect(() => {
    if (agentConfigSection === "session") fetchChatSessions()
  }, [agentConfigSection, fetchChatSessions])

  useEffect(() => {
    if (agentConfigSection === "wakeup" && selectedId) fetchCronJobs(selectedId)
  }, [agentConfigSection, selectedId, fetchCronJobs])

  useEffect(() => {
    if (!selectedId) return
    setTeamEditMeta({ members: [] })
    setTeamFetchError(null)
    setHeartbeatScope("__defaults__")
  }, [selectedId])

  useEffect(() => {
    if (
      (agentConfigSection !== "team_agents" && agentConfigSection !== "team_space") ||
      !selectedId
    )
      return
    let cancelled = false
    setTeamFetchLoading(true)
    setTeamFetchError(null)
    setTeamSpaceInitialized(null)
    void (async () => {
      try {
        const init = await invoke<boolean>("is_team_space_initialized", { instanceId: selectedId })
        if (cancelled) return
        setTeamSpaceInitialized(init)
        if (init) {
          const meta = await invoke<TeamMeta>("read_team_meta", { instanceId: selectedId })
          if (cancelled) return
          setTeamEditMeta({
            team_name: meta.team_name,
            members: meta.members ?? [],
          })
        } else {
          setTeamEditMeta({ members: [] })
        }
      } catch (e) {
        if (cancelled) return
        setTeamFetchError(e instanceof Error ? e.message : String(e))
        setTeamSpaceInitialized(false)
      } finally {
        if (!cancelled) setTeamFetchLoading(false)
      }
    })()
    return () => {
      cancelled = true
      setTeamFetchLoading(false)
    }
  }, [agentConfigSection, selectedId])

  const loadTeamDashboard = useCallback(async () => {
    if (!selectedId) return
    setTeamDashboardLoading(true)
    setTeamActivityError(null)
    const gw = getEffectiveGatewayInfo(selectedId)
    const activityPromise: Promise<MultiAgentActivityRow[]> =
      gw.agentGatewayStatus !== "running"
        ? Promise.resolve([])
        : invoke<MultiAgentActivityRow[]>("list_multi_agent_activity", {
            instanceId: selectedId,
            port: gw.port,
          })
    const [tasksSettled, activitySettled] = await Promise.allSettled([
      invoke<TeamTask[]>("list_team_tasks", { instanceId: selectedId }),
      activityPromise,
    ])
    if (tasksSettled.status === "fulfilled") {
      setTeamTasks(tasksSettled.value)
    } else {
      const e = tasksSettled.reason
      toast.error(e instanceof Error ? e.message : String(e))
      setTeamTasks([])
    }
    if (activitySettled.status === "fulfilled") {
      setTeamActivity(activitySettled.value)
    } else {
      const e = activitySettled.reason
      setTeamActivityError(e instanceof Error ? e.message : String(e))
      setTeamActivity([])
    }
    setTeamDashboardLoading(false)
  }, [selectedId, getEffectiveGatewayInfo])

  const submitNewTeamTask = useCallback(async () => {
    if (!selectedId || teamDashboardLoading || !newTeamTaskTitle.trim()) return
    const list = openclawConfig?.agents?.list ?? []
    if (!list.length) {
      toast.error("请先添加至少一个角色")
      return
    }
    const assignedToAgentId =
      newTeamTaskAssignMode === "open"
        ? null
        : (teamRoleAgentId.trim() || list[0]?.id || "").trim() || null
    if (newTeamTaskAssignMode === "assigned" && !assignedToAgentId) {
      toast.error("请选择指派人")
      return
    }
    try {
      await invoke("add_team_task", {
        instanceId: selectedId,
        title: newTeamTaskTitle.trim(),
        assignedToAgentId,
      })
      setNewTeamTaskTitle("")
      await loadTeamDashboard()
      toast.success("已添加任务")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }, [
    selectedId,
    teamDashboardLoading,
    newTeamTaskTitle,
    newTeamTaskAssignMode,
    teamRoleAgentId,
    loadTeamDashboard,
    openclawConfig?.agents?.list,
  ])

  useEffect(() => {
    if (agentConfigSection !== "team_space" || !selectedId || teamSpaceInitialized !== true) return
    void loadTeamDashboard()
  }, [agentConfigSection, selectedId, loadTeamDashboard, teamSpaceInitialized])

  const enableTeamSpace = useCallback(async () => {
    if (!selectedId) return
    const agentsList = openclawConfig?.agents?.list ?? []
    if (!agentsList.length) {
      toast.error("请先在「团队 → 角色列表」中添加至少一个角色")
      return
    }
    if (!teamLeaderAgentId) {
      toast.error("请先在角色列表中添加 id 为 main 的角色作为 Team Leader")
      return
    }
    setTeamSaving(true)
    try {
      const meta = {
        team_name: teamEditMeta.team_name || undefined,
        leader_agent_id: teamLeaderAgentId,
        members: agentsList.map((a) => ({
          agent_id: a.id,
          display_name: teamEditMeta.members.find((m) => m.agent_id === a.id)?.display_name,
          role: teamEditMeta.members.find((m) => m.agent_id === a.id)?.role,
        })),
      }
      await invoke("save_team_meta", { instanceId: selectedId, meta })
      setTeamFetchError(null)
      setTeamSpaceInitialized(true)
      toast.success("团队空间已开启")
      void loadTeamDashboard()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "开启失败")
    } finally {
      setTeamSaving(false)
    }
  }, [selectedId, teamEditMeta, loadTeamDashboard, teamLeaderAgentId])

  useEffect(() => {
    const list = openclawConfig?.agents?.list ?? []
    const first = list[0]?.id
    if (first) {
      setTeamRoleAgentId((prev) => (prev && list.some((a) => a.id === prev) ? prev : first))
    }
  }, [openclawConfig?.agents?.list])

  const handleSaveWorkspaceFile = async () => {
    if (!selectedWorkspaceFile) return
    setWorkspaceFileSaving(true)
    setWorkspaceFileError(null)
    try {
      await invoke("write_agent_workspace_file", {
        agentId: selectedId ?? undefined,
        filename: selectedWorkspaceFile,
        content: workspaceFileContent,
        openclawRoleId: workspaceOpenclawRoleId?.trim() || null,
      })
      await loadWorkspaceFileList()
    } catch (e) {
      setWorkspaceFileError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorkspaceFileSaving(false)
    }
  }

  const view = useMemo(() => agentsModelsToFlatView(openclawConfig), [openclawConfig])
  const llmModels = view.models
  const llmOrder = view.modelInstanceOrder
  const defaultModelId = view.defaultModelId
  const agentModel = view.agentModel
  const modelList = llmOrder
    .map((id) => ({ id, raw: llmModels[id] }))
    .filter(({ raw }) => raw != null && typeof raw === "object")

  useEffect(() => {
    if (!selectedId) return
    setSelectedSkillIds([...enabledSkills])
  }, [selectedId, enabledSkills])

  const loadModelForm = useCallback((id: string) => {
    const m = llmModels[id] as LLMModelConfig | undefined
    if (!m) return
    const prov = (m.provider ?? "openai") as string
    setModelProvider(prov)
    setModelApiKey((m.apiKey ?? "") as string)
    setModelBaseURL(prov === "custom" ? ((m.baseURL ?? "") as string) : "")
    setModelModel((m.model ?? "") as string)
  }, [llmModels])

  useEffect(() => {
    if (modelSelectedId && llmModels[modelSelectedId]) loadModelForm(modelSelectedId)
  }, [modelSelectedId, openclawConfig, loadModelForm, llmModels])

  const handleOpenSkillDirectory = useCallback(
    async (skillName: string) => {
      if (!selectedId) return
      try {
        await invoke("open_skill_directory_for_instance", {
          instanceId: selectedId,
          skillName,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    },
    [selectedId],
  )

  if (openclawConfig === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="w-full max-w-md bg-app-surface">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-app-muted">加载配置中…</p>
            <Button
              variant="outline"
              className="mt-4 border-app-border text-app-muted hover:bg-app-hover"
              onClick={() => loadConfigs()}
            >
              重试
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getModelDisplayName = (m: LLMModelConfig | Record<string, unknown>, _id: string) => {
    const name = (m as LLMModelConfig).name
    if (name && String(name).trim()) return String(name).trim()
    const provider = (m as LLMModelConfig).provider
    const providerName = PROVIDERS.find((p) => p.id === provider)?.name ?? provider ?? "未设置"
    const model = (m as LLMModelConfig).model
    if (model && String(model).trim()) return `${providerName} · ${model}`
    return providerName
  }
  const isModelConfigured = (m: LLMModelConfig | Record<string, unknown>) => {
    if (!m || typeof m !== "object") return false
    return !!((m as LLMModelConfig).apiKey && String((m as LLMModelConfig).apiKey).trim())
  }

  const modelSelectOptions =
    modelList.length > 0
      ? modelList.map(({ id, raw }) => ({ value: id, label: getModelDisplayName(raw, id) }))
      : [{ value: defaultModelId || "openai", label: `默认 (${defaultModelId || "openai"}，可先在「模型」中配置)` }]

  const persistRoleAgentsList = async (newList: NonNullable<OpenClawAgentsShape["list"]>) => {
    if (!selectedId) return
    const defaultsPrimary = openclawConfig.agents?.defaults?.model?.primary as string | undefined
    const fallbackInst = defaultModelId || llmOrder[0] || "openai"
    const ordered = normalizeAgentsListOrder(newList)
    const normalized = ordered.map((entry) => ({
      ...entry,
      model: normalizeAgentListModelForPersist(
        entry.model as string | undefined,
        llmModels,
        fallbackInst,
        defaultsPrimary
      ),
    }))
    setRoleListSaving(true)
    try {
      await saveOpenClawConfig(
        {
          ...openclawConfig,
          agents: { ...(openclawConfig.agents ?? {}), list: normalized },
        } as OpenClawConfig,
        selectedId
      )
      await loadInstanceConfig(selectedId)
      try {
        const synced = await invoke<boolean>("sync_team_meta_members_from_agents", {
          instanceId: selectedId,
        })
        if (synced) {
          const meta = await invoke<TeamMeta>("read_team_meta", { instanceId: selectedId })
          setTeamEditMeta({ team_name: meta.team_name, members: meta.members ?? [] })
        }
      } catch {
        /* Ignore when team space off or sync failed */
      }
      toast.success("角色列表已更新", {
        description:
          "已按 OpenClaw 规范将 agents.list[].model 写为 provider/modelId；须重启 Gateway 后生效。",
        action: {
          label: "重启 Gateway",
          onClick: () => {
            void restartAgentGateway(selectedId).catch((err) =>
              toast.error(err instanceof Error ? err.message : String(err))
            )
          },
        },
        duration: 14_000,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRoleListSaving(false)
    }
  }

  const openAddRoleDialog = () => {
    setNewRoleIdInput("")
    setNewRoleModelKey(defaultModelId || modelSelectOptions[0]?.value || "openai")
    setAddRoleDialogOpen(true)
  }

  const handleConfirmAddRole = async () => {
    const id = newRoleIdInput.trim()
    if (!isValidOpenClawAgentId(id)) {
      toast.error("Agent ID 须为字母开头，仅含字母、数字、连字符、下划线，最多 63 位")
      return
    }
    const list = [...(openclawConfig.agents?.list ?? [])]
    if (list.some((a) => a.id === id)) {
      toast.error("该 ID 已存在")
      return
    }
    const modelKey = newRoleModelKey || defaultModelId || modelSelectOptions[0]?.value || "openai"
    list.push({ id, model: modelKey })
    await persistRoleAgentsList(list)
    setAddRoleDialogOpen(false)
  }

  const handleRoleModelChange = async (agentId: string, modelKey: string) => {
    const list = (openclawConfig.agents?.list ?? []).map((a) =>
      a.id === agentId ? { ...a, model: modelKey } : a
    )
    await persistRoleAgentsList(list)
  }

  const confirmDeleteRole = async () => {
    if (!deleteRoleId) return
    const id = deleteRoleId
    const list = (openclawConfig.agents?.list ?? []).filter((a) => a.id !== id)
    await persistRoleAgentsList(list)
    setTeamEditMeta((m) => ({
      ...m,
      members: m.members.filter((x) => x.agent_id !== id),
    }))
    setDeleteRoleId(null)
  }

  const effectiveModelKeyForAgent = (agent: { id: string; model?: string }) =>
    primaryRefToFlatModelInstanceId(
      agent.model,
      llmOrder,
      llmModels,
      defaultModelId || modelSelectOptions[0]?.value || "openai"
    )

  const openModelKeyUrl = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = getProvider(modelProvider)?.keyUrl ?? "https://docs.openclaw.ai/zh-CN/concepts/model-providers"
    import("@tauri-apps/plugin-shell")
      .then(({ open }) => open(url))
      .catch(() => window.open(url, "_blank"))
  }

  const handleAddModel = async (providerId: string) => {
    if (!selectedId) return
    const id = crypto.randomUUID()
    const baseOrder = llmOrder.filter((oid) => llmModels[oid]?.provider)
    const newOrder = [...baseOrder, id]
    const newModels = { ...llmModels, [id]: { provider: providerId } as LLMModelConfig }
    const nextDefault = llmModels[defaultModelId]?.provider ? defaultModelId : id
    const nextView = { ...view, modelInstanceOrder: newOrder, models: newModels, defaultModelId: nextDefault }
    const { agents: nextAgents, models: nextModels } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModels } as OpenClawConfig, selectedId)
      setModelSaveError(null)
      setModelSelectedId(providerId)
    } catch (e) {
      setModelSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSaveModel = async () => {
    if (!openclawConfig || !modelSelectedId || !selectedId) return
    if (!modelModel.trim()) {
      setModelSaveError("请填写模型 ID")
      return
    }
    if (modelProvider === "custom" && !modelBaseURL.trim()) {
      setModelSaveError("自定义模型必须填写 Base URL")
      return
    }
    const keyVal = modelApiKey.trim()
    if (keyVal && (keyVal.length > 500 || /[^\x20-\x7E]/.test(keyVal))) {
      setModelSaveError("API Key 格式不正确")
      return
    }
    setModelSaving(true)
    setModelSaveError(null)
    setModelSaveMsg(null)
    const effectiveBaseURL =
      modelProvider === "custom"
        ? (modelBaseURL.trim() || undefined)
        : (getProvider(modelProvider)?.baseURL || undefined)
    const { name: _n, ...rest } = (llmModels[modelSelectedId] as Record<string, unknown>) ?? {}
    const nextModels = {
      ...llmModels,
      [modelSelectedId]: {
        ...rest,
        provider: modelProvider,
        apiKey: modelApiKey.trim() || undefined,
        baseURL: effectiveBaseURL,
        model: modelModel.trim() || undefined,
      },
    }
    const nextView = { ...view, models: nextModels }
    const { agents: nextAgents, models: nextModelsShape } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModelsShape } as OpenClawConfig, selectedId)
      setModelSaveMsg("已保存")
      setTimeout(() => setModelSaveMsg(null), 2000)
    } catch (e) {
      setModelSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setModelSaving(false)
    }
  }

  const handleSetDefaultModel = async () => {
    if (!modelSelectedId || !openclawConfig || !selectedId) return
    const nextView = { ...view, defaultModelId: modelSelectedId }
    const { agents: nextAgents, models: nextModels } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModels } as OpenClawConfig, selectedId)
      setModelSaveMsg("已设为默认模型")
      setTimeout(() => setModelSaveMsg(null), 2000)
    } catch (e) {
      setModelSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDeleteModel = async (idToDelete: string) => {
    if (!idToDelete || !openclawConfig || !selectedId) return
    const nextOrder = llmOrder.filter((id) => id !== idToDelete)
    const { [idToDelete]: _, ...nextModels } = llmModels
    const nextDefault = defaultModelId === idToDelete ? nextOrder[0] : defaultModelId
    const nextAgentModel = { ...agentModel }
    for (const k of Object.keys(nextAgentModel)) {
      if (nextAgentModel[k] === idToDelete) nextAgentModel[k] = nextDefault ?? ""
    }
    const nextView = { ...view, modelInstanceOrder: nextOrder, models: nextModels, defaultModelId: nextDefault ?? "", agentModel: nextAgentModel }
    const { agents: nextAgents, models: nextModelsShape } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModelsShape } as OpenClawConfig, selectedId)
      setModelSelectedId(nextOrder[0] ?? null)
      setModelSaveError(null)
    } catch (e) {
      setModelSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleTestModel = async () => {
    if (!modelApiKey.trim()) {
      setModelTestMsg("请先填写 API Key 再测试")
      return
    }
    if (modelProvider === "custom" && !modelBaseURL.trim()) {
      setModelTestMsg("自定义模型必须填写 Base URL")
      return
    }
    setModelTesting(true)
    setModelTestMsg(null)
    try {
      const effectiveBaseURL =
        modelProvider === "custom"
          ? (modelBaseURL.trim() || undefined)
          : (getProvider(modelProvider)?.baseURL || undefined)
      const config = {
        apiKey: modelApiKey.trim(),
        baseURL: effectiveBaseURL || "https://api.openai.com/v1",
        model: modelModel.trim() || "gpt-3.5-turbo",
      }
      const msg = await invoke<string>("test_ai_connection", { llmConfig: config })
      setModelTestMsg(msg)
      setTimeout(() => setModelTestMsg(null), 4000)
    } catch (e) {
      setModelTestMsg(String(e))
    } finally {
      setModelTesting(false)
    }
  }

  const handleImportAgent = async (discovered: { id: string; name: string }) => {
    setImporting(true)
    try {
      // Backend ensures openclaw.json exists; instance appears in list and leaves "discovered"
      await invoke('import_discovered_instance', {
        instanceId: discovered.id,
        displayName: discovered.name || undefined,
      })
      await loadConfigs()
      refreshDiscoveredAgents()
      switchInstance(discovered.id).catch(() => {})
      toast.success(`已导入 Agent「${discovered.name}」`)
    } catch (e) {
      toast.error(`导入失败: ${e instanceof Error ? e.message : String(e)}`)
    }
    setImporting(false)
  }

  const handleSaveSkills = async () => {
    if (!selectedId) return
    setSaving(true)
    setSaveError(null)
    try {
      if (!skillsForInstance?.all.length) return
      await invoke('save_skill_enabled_for_instance', {
        instanceId: selectedId,
        enabledSkillIds: selectedSkillIds,
        allSkillIds: skillsForInstance.all.map((s) => s.name),
      })
      await loadSkills()
      await loadConfigs()
      setSaveMsg("技能已更新")
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /** Install skill via agent (URL or id; not necessarily clawhub) */
  const handleInstallSkill = async () => {
    const raw = skillInstallInput.trim()
    if (!selectedId) return
    if (!raw) {
      toast.error("请输入技能链接或 ID")
      return
    }
    setInstallingSkill(true)
    toast.info("正在通过 Agent 安装，请稍候…（约 1–2 分钟）", { duration: 3000 })
    try {
      const result = await invoke<{ skill_id?: string; message: string }>("install_skill_via_agent", {
        skillInput: raw,
        agentId: selectedId,
      })
      await loadSkills()
      await loadConfigs()
      setSkillInstallInput("")
      toast.success(result?.message ?? "技能已安装")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg)
    } finally {
      setInstallingSkill(false)
    }
  }

  const handleDeleteAgent = async () => {
    if (!selectedId || !openclawConfig) return

    setSaving(true)
    setSaveError(null)
    const deletedName = getAgentDisplayName(selectedId, displayNames)
    
    try {
      // Backend: stop Pond children, openclaw gateway stop/uninstall per profile, clean LaunchAgent/systemd/tasks, free port, delete dirs
      await invoke("delete_agent_cleanup", { agentId: selectedId })
      
      // If last instance was removed (check disk)
      let instanceCount = 0
      try {
        instanceCount = await invoke<number>('count_openclaw_instances')
      } catch {
        instanceCount = 0
      }
      
      const isLastAgent = instanceCount === 0
      if (isLastAgent) {
        setConfirmDelete(false)
        setSaving(false)
        useAppStore.setState({ needsOnboarding: true, onboardingChecked: true })
        setTimeout(() => {
          toast.success(`已删除实例「${deletedName}」`)
          toast.info("已删除所有实例，正在返回引导界面...")
        }, 100)
        return
      }
      
      // Other instances remain: reload and switch
      await loadConfigs()
      toast.success(`已删除实例「${deletedName}」`)
      refreshDiscoveredAgents()
      setConfirmDelete(false)
      
      const updatedConfig = useAppStore.getState().openclawConfig
      const remainingAgents = getAgentIds(updatedConfig)
      const nextId = remainingAgents[0] ?? null
      if (nextId) {
        switchInstance(nextId).catch(() => {})
      } else {
        switchInstance(null)
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      setSaveError(errorMsg)
      toast.error(`删除失败: ${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleSkill = (skillId: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    )
  }

  const handleUninstallSkill = async (skillId: string) => {
    if (!selectedId) return
    if (!window.confirm(`确定要卸载技能「${skillId}」吗？将从所有实例中删除该技能目录，且无法恢复。`)) return
    setUninstallingSkillId(skillId)
    try {
      await invoke("uninstall_skill", { skillId })
      await loadSkills()
      await loadConfigs()
      setSelectedSkillIds((prev) => prev.filter((s) => s !== skillId))
      toast.success(`已卸载技能「${skillId}」`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setUninstallingSkillId(null)
    }
  }

  const openAddModal = () => {
    setShowAddModal(true)
    setSaveError(null)
  }

  const gatewayLogFillLayout = Boolean(selectedId && agentConfigSection === "logs")

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-transparent">
      <main
        className={cn(
          "min-w-0 flex-1",
          gatewayLogFillLayout
            ? "flex min-h-0 flex-col overflow-hidden"
            : "overflow-y-auto",
        )}
      >
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center p-12 text-center">
            <div className="rounded-2xl bg-app-elevated p-8">
              <Users className="mx-auto h-14 w-14 text-app-muted/50" />
            </div>
            <p className="mt-6 text-sm font-medium text-app-text">请使用侧栏顶部实例切换器选择或添加实例</p>
            <p className="mt-1 text-xs text-app-muted">当前实例由全局切换器统一管理，此处仅编辑选中实例的配置</p>
            <Button
              size="sm"
              className="mt-4 gap-1.5 bg-claw-500 hover:bg-claw-600 text-white"
              onClick={openAddModal}
            >
              <Download className="h-4 w-4" />
              创建 claw 实例
            </Button>
            {discoveredAgents.length > 0 && (
              <div className="mt-6 w-full max-w-sm rounded-xl border border-app-border bg-app-surface/50 p-4 text-left">
                <p className="text-xs font-medium text-app-muted mb-2">发现系统实例</p>
                <div className="space-y-2">
                  {discoveredAgents.map((d) => (
                  <div
                    key={d.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-app-muted hover:bg-app-hover transition-colors"
                  >
                      <FolderOpen className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-app-text">{d.name}</p>
                      <p className="truncate text-xs opacity-60">~/.openclaw-{d.id}</p>
                    </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-blue-500 hover:text-blue-400"
                        disabled={importing}
                        onClick={() => handleImportAgent(d)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        导入
                      </Button>
                  </div>
                ))}
                </div>
              </div>
            )}
            </div>
          ) : (
            <div
              className={cn(
                "pt-0 px-4 pb-3",
                gatewayLogFillLayout
                  ? "flex min-h-0 min-w-0 flex-1 flex-col gap-6"
                  : "space-y-6",
              )}
            >
              {saveError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {saveError}
                </div>
              )}
              {saveMsg && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
                  {saveMsg}
                </div>
              )}

              {agentConfigSection === 'model' && (
                  <>
                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-claw-500" />
                            <CardTitle className="text-sm font-medium text-app-text">模型配置</CardTitle>
                        </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                className="gap-1.5 rounded-lg bg-claw-500 hover:bg-claw-600 text-white shadow-sm"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                添加模型
                                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 rounded-xl">
                              <DropdownMenuLabel className="text-xs font-medium text-app-muted">选择提供商</DropdownMenuLabel>
                              {PROVIDERS.map((p) => (
                                <DropdownMenuItem
                                  key={p.id}
                                  onSelect={() => { setModelSaveError(null); handleAddModel(p.id) }}
                                  className="cursor-pointer rounded-lg"
                                >
                                  {p.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                              </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {modelList.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-app-border bg-app-surface/40 py-10 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-claw-500/10">
                              <Bot className="h-7 w-7 text-claw-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-app-text">暂无模型</p>
                              <p className="mt-1 text-xs text-app-muted">添加后填写 API Key 即可使用</p>
                          </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" className="gap-1.5 rounded-lg bg-claw-500 hover:bg-claw-600 text-white">
                                  <Plus className="h-3.5 w-3.5" />
                                  添加第一个模型
                                  <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-52 rounded-xl">
                                <DropdownMenuLabel className="text-xs font-medium text-app-muted">选择提供商</DropdownMenuLabel>
                                {PROVIDERS.map((p) => (
                                  <DropdownMenuItem
                                    key={p.id}
                                    onSelect={() => { setModelSaveError(null); handleAddModel(p.id) }}
                                    className="cursor-pointer rounded-lg"
                                  >
                                    {p.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            </div>
                        ) : (
                          <div className="space-y-2">
                            {modelList.map(({ id, raw }) => {
                              const configured = isModelConfigured(raw)
                              const selected = modelSelectedId === id
                              const isDefault = defaultModelId === id
                              const isCurrent = selectedId && agentModel[selectedId] === id
                              const displayName = getModelDisplayName(raw, id)
                              return (
                                <div
                                  key={id}
                                  className={cn(
                                    "overflow-hidden rounded-2xl border border-white/55 transition-all duration-200 dark:border-white/[0.06]",
                                    selected
                                      ? "border-claw-500/50 bg-app-surface shadow-[0_2px_14px_-8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_16px_-8px_rgba(0,0,0,0.45)]"
                                      : "border-app-border/60 bg-app-elevated/50 hover:border-app-hover dark:border-app-border/50"
                                  )}
                                >
                                      <button
                                        type="button"
                                        onClick={() => {
                                      setModelSelectedId(selected ? null : id)
                                      setModelSaveError(null)
                                      if (!selected) loadModelForm(id)
                                    }}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-app-hover/30"
                                  >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-app-elevated text-lg">
                                      <Bot className="h-5 w-5 text-app-muted" />
                                    </span>
                                          <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="truncate font-medium text-app-text">{displayName}</span>
                                        {isDefault && (
                                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-claw-500/15 px-2 py-0.5 text-[10px] text-claw-400">
                                            <Star className="h-3 w-3 fill-current" />
                                            默认
                                          </span>
                                        )}
                                        {isCurrent && (
                                          <span className="shrink-0 rounded-full bg-claw-500/20 px-2 py-0.5 text-[10px] font-medium text-claw-600 dark:text-claw-400">
                                            当前使用
                                          </span>
                                            )}
                                          </div>
                                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                                        <span className="rounded border border-app-border bg-app-surface px-1.5 py-0.5">
                                          {getProvider((raw as LLMModelConfig).provider as string)?.name ?? (raw as LLMModelConfig).provider ?? "—"}
                                        </span>
                                        <span className={configured ? "text-emerald-500/90" : "text-amber-500/90"}>
                                          {configured ? "已配置" : "未配置 Key"}
                                        </span>
                                          </div>
                                        </div>
                                    <ChevronDown
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-app-muted transition-transform duration-200",
                                        selected && "rotate-180 text-claw-400"
                                      )}
                                    />
                                      </button>
                                  {selected && (
                                    <div className="border-t border-app-border bg-app-elevated/20">
                                      <div className="flex flex-col gap-3 p-4">
                                        <div className="space-y-1.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <Label className="text-xs font-medium text-app-muted">API Key</Label>
                                            <button
                                              type="button"
                                              onClick={openModelKeyUrl}
                                              className="inline-flex items-center gap-1 text-xs text-claw-400 hover:text-claw-300 hover:underline"
                                            >
                                              获取 Key
                                              <ExternalLink className="h-3 w-3" />
                                            </button>
                                  </div>
                                          <Input
                                            type="password"
                                            placeholder="sk-..."
                                            value={modelApiKey}
                                            onChange={(e) => setModelApiKey(e.target.value)}
                                            className="h-9 rounded-lg border-app-border bg-app-surface text-app-text placeholder:text-app-muted text-sm"
                                          />
                              </div>
                                        {modelProvider === "custom" && (
                                          <div className="space-y-1.5">
                                            <Label className="text-xs font-medium text-app-muted">Base URL</Label>
                                            <Input
                                              placeholder="https://api.openai.com/v1"
                                              value={modelBaseURL}
                                              onChange={(e) => setModelBaseURL(e.target.value)}
                                              className="h-9 rounded-lg border-app-border bg-app-surface text-app-text placeholder:text-app-muted text-sm"
                                            />
                                </div>
                              )}
                                        <div className="space-y-1.5">
                                          <Label className="text-xs font-medium text-app-muted">模型 ID</Label>
                                          <ModelIdField
                                            provider={modelProvider}
                                            value={modelModel}
                                            onChange={setModelModel}
                                            disabled={modelSaving}
                                            size="sm"
                                          />
                                        </div>
                                        {modelSaveError && (
                                          <p className="text-sm text-red-400">{modelSaveError}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleSaveModel}
                                            disabled={modelSaving || !modelModel.trim()}
                                            className="gap-1.5 rounded-lg bg-claw-500 hover:bg-claw-600 text-white"
                                          >
                                            {modelSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                            {modelSaving ? "保存中…" : "保存"}
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 rounded-lg border-app-border text-app-muted hover:bg-app-hover hover:text-app-text"
                                            onClick={handleTestModel}
                                            disabled={modelTesting}
                                          >
                                            {modelTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                                            测试连接
                                          </Button>
                                          {(modelSaveMsg || modelTestMsg) && (
                                            <span className="text-sm text-app-muted" role="status">
                                              {modelSaveMsg ?? modelTestMsg}
                                            </span>
                              )}
                            </div>
                                        <div className="flex items-center gap-2 border-t border-app-border pt-3">
                                          {defaultModelId !== id && (
                            <Button
                                              type="button"
                              size="sm"
                                              variant="ghost"
                                              className="h-8 gap-1.5 text-app-muted hover:bg-claw-500/10 hover:text-claw-400"
                                              onClick={handleSetDefaultModel}
                                            >
                                              <Star className="h-3.5 w-3.5" />
                                              设为默认
                            </Button>
                                          )}
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 gap-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                删除
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>确定删除该模型？</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  删除后，使用此模型的实例将改为使用默认模型。此操作不可撤销。
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                                                  取消
                                                </AlertDialogCancel>
                                                <AlertDialogAction
                                                  variant="destructive"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteModel(id)
                                                  }}
                                                >
                                                  确定删除
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
                    {agentConfigSection === 'session' && (
                  <>
                    {/* Session settings */}
                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-claw-500" />
                          <CardTitle className="text-sm font-medium text-app-text">会话管理</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-lg border border-app-border bg-app-elevated/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs font-medium text-app-text">跨渠道长期续聊</Label>
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-app-muted hover:bg-app-hover hover:text-app-text"
                                      aria-label="配置说明"
                                    >
                                      <Info className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                                    <p>
                                      保存时写入 OpenClaw：<span className="font-mono">session.dmScope=main</span>（多渠道私聊走同一会话键）、
                                      <span className="font-mono">session.reset.mode=off</span>（关闭空闲与定时自动换新 session）。
                                    </p>
                                    <p className="mt-2">
                                      多人同时使用同一 Agent 会共用上下文；对话过长时仍可能触发模型侧的压缩或截断。
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          <Switch
                            checked={sessionUnifiedContinuity}
                            disabled={!selectedId}
                            onCheckedChange={(on) => {
                              setSessionUnifiedContinuity(on)
                              if (on) {
                                setAgentSession((prev) => ({
                                  ...prev,
                                  dmScope: "main",
                                  resetMode: "never",
                                }))
                              } else {
                                setAgentSession((prev) => ({
                                  ...prev,
                                  dmScope: "per-channel-peer",
                                  resetMode: "off",
                                }))
                              }
                            }}
                            className="shrink-0 data-[state=checked]:bg-claw-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-app-muted">DM 会话作用域</Label>
                          <Select
                            value={agentSession.dmScope}
                            disabled={sessionUnifiedContinuity}
                            onValueChange={(v) => setAgentSession({ ...agentSession, dmScope: v })}
                          >
                            <SelectTrigger className="border-app-border bg-app-elevated text-app-text">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="main">main（跨端/多渠道同一会话键）</SelectItem>
                              <SelectItem value="per-peer">per-peer（按发送者隔离）</SelectItem>
                              <SelectItem value="per-channel-peer">per-channel-peer（按渠道+发送者）</SelectItem>
                              <SelectItem value="per-account-channel-peer">per-account-channel-peer（完全隔离）</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-app-muted">自动重置模式</Label>
                          <Select
                            value={agentSession.resetMode}
                            disabled={sessionUnifiedContinuity}
                            onValueChange={(v) =>
                              setAgentSession({
                                ...agentSession,
                                resetMode: v as "off" | "never" | "daily" | "idle",
                              })
                            }
                          >
                            <SelectTrigger className="border-app-border bg-app-elevated text-app-text">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="off">默认（不写 reset，含官方空闲过期等）</SelectItem>
                              <SelectItem value="never">显式关闭轮换（session.reset.mode=off）</SelectItem>
                              <SelectItem value="daily">每日重置</SelectItem>
                              <SelectItem value="idle">空闲后重置</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {agentSession.resetMode === "daily" && (
                          <div className="space-y-2">
                            <Label className="text-xs text-app-muted">重置时刻（小时）</Label>
                            <Input
                              type="number"
                              min={0}
                              max={23}
                              value={agentSession.atHour}
                              onChange={(e) => setAgentSession({ ...agentSession, atHour: Number(e.target.value) })}
                              className="w-24 border-app-border bg-app-elevated text-app-text"
                            />
                          </div>
                        )}
                        {agentSession.resetMode === "idle" && (
                          <div className="space-y-2">
                            <Label className="text-xs text-app-muted">空闲超时（分钟）</Label>
                            <Input
                              type="number"
                              min={1}
                              value={agentSession.idleMinutes}
                              onChange={(e) => setAgentSession({ ...agentSession, idleMinutes: Number(e.target.value) })}
                              className="w-32 border-app-border bg-app-elevated text-app-text"
                            />
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="bg-claw-500 hover:bg-claw-600 text-white"
                          onClick={async () => {
                            const reset =
                              sessionUnifiedContinuity || agentSession.resetMode === "never"
                                ? { mode: "off" as const }
                                : agentSession.resetMode === "off"
                                  ? undefined
                                  : {
                                      mode: agentSession.resetMode,
                                      ...(agentSession.resetMode === "daily" ? { atHour: agentSession.atHour } : {}),
                                      ...(agentSession.resetMode === "idle" ? { idleMinutes: agentSession.idleMinutes } : {}),
                                    }
                            const success = await patchAgentConfig({
                              session: {
                                dmScope: sessionUnifiedContinuity ? "main" : agentSession.dmScope,
                                ...(reset !== undefined ? { reset } : { reset: undefined }),
                              },
                            })
                            if (success) toast.success("会话配置已保存")
                          }}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          保存会话配置
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Past sessions for this instance */}
                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm font-medium text-app-text">历史会话</CardTitle>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 border-app-border text-app-muted hover:bg-app-hover"
                            onClick={() => fetchChatSessions()}
                          >
                            <Download className="h-3.5 w-3.5" />
                            刷新
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const list = (chatSessions ?? []).filter(
                            (s) => s.instanceId === selectedId,
                          )
                          if (list.length === 0) {
                            return (
                              <p className="py-6 text-center text-sm text-app-muted">
                                当前实例暂无对话记录，在「对话」中与 Agent 交流后会在此显示
                              </p>
                            )
                          }
                          return (
                            <ul className="space-y-2">
                              {list.map((s) => (
                                <li key={s.sessionKey}>
                                  <div className="flex items-center gap-3 rounded-xl border border-app-border bg-app-elevated/50 p-3">
                                    <MessageCircle className="h-4 w-4 shrink-0 text-claw-500" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-app-text">当前会话</span>
                                        <span className="rounded bg-app-surface px-1.5 py-0.5 text-xs tabular-nums text-app-muted">
                                          {s.messageCount} 条
                                        </span>
                                      </div>
                                      {s.lastPreview && (
                                        <p className="mt-0.5 truncate text-xs text-app-muted">{s.lastPreview}</p>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      className="h-8 shrink-0 bg-claw-500 hover:bg-claw-600 text-white"
                                      onClick={() =>
                                        setCurrentView("chat", selectedId ?? null)
                                      }
                                    >
                                      在对话中打开
                                    </Button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  </>
                )}
                    {(agentConfigSection === "team_agents" || agentConfigSection === "team_space") && (
                  <>
                    {agentConfigSection === "team_agents" && (
                    <Card className="overflow-hidden bg-app-surface">
                      <CardHeader className="space-y-2 pb-2">
                        <CardTitle className="text-base font-semibold tracking-tight text-app-text flex shrink-0 items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-claw-500/10 text-claw-600 dark:text-claw-400">
                            <UserCircle className="h-4 w-4" />
                          </span>
                          角色列表
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="border-t border-app-border/50 px-4 pb-6 pt-4 sm:px-6">
                        <section className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-app-muted">成员与模型</h3>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 rounded-lg border-app-border/80 bg-app-surface text-app-text shadow-none hover:border-claw-500/35 hover:bg-claw-500/[0.06]"
                              disabled={roleListSaving || !selectedId}
                              onClick={openAddRoleDialog}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              添加角色
                            </Button>
                          </div>

                          {(() => {
                            const agentsList = openclawConfig?.agents?.list ?? []
                            if (agentsList.length === 0) {
                              return (
                                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-app-border/80 bg-gradient-to-b from-app-elevated/20 to-transparent py-14 text-center">
                                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-elevated/80 text-app-muted">
                                    <Users className="h-7 w-7 opacity-70" />
                                  </div>
                                  <div className="px-4">
                                    <p className="text-sm font-medium text-app-text">尚未添加角色</p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-9 rounded-lg border-claw-500/30 text-claw-700 hover:bg-claw-500/[0.08] dark:text-claw-300"
                                    disabled={roleListSaving}
                                    onClick={openAddRoleDialog}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    添加首个角色
                                  </Button>
                                </div>
                              )
                            }
                            const getMember = (agentId: string) => teamEditMeta.members.find((m) => m.agent_id === agentId)
                            return (
                              <TooltipProvider delayDuration={300}>
                              <div
                                className={cn(
                                  "grid gap-4",
                                  agentsList.length === 1
                                    ? "grid-cols-1"
                                    : "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3",
                                )}
                              >
                                {agentsList.map((agent) => {
                                  const member = getMember(agent.id)
                                  const isLeader = agent.id === TEAM_LEADER_AGENT_ID
                                  const modelVal = effectiveModelKeyForAgent(agent)
                                  return (
                                    <div
                                      key={agent.id}
                                      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-app-border/70 bg-app-elevated/[0.15] shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)]"
                                    >
                                      {/* divide-y instead of Separator + stacked p-4 (less dead space) */}
                                      <div className="divide-y divide-app-border/60">
                                        <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                            <span
                                              className={cn(
                                                "inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                                                teamFetchLoading && "opacity-50",
                                                isLeader
                                                  ? "border-claw-500/40 bg-claw-500/10 text-claw-800 shadow-sm dark:text-claw-200"
                                                  : "border-app-border/60 bg-app-surface/40 text-app-muted",
                                              )}
                                          title={isLeader ? `Team Leader 固定为 id「${TEAM_LEADER_AGENT_ID}」` : undefined}
                                            >
                                              <Crown className={cn("h-3.5 w-3.5", isLeader ? "text-claw-600 dark:text-claw-400" : "opacity-40")} />
                                              {isLeader ? "Team Leader" : "成员"}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                              <Input
                                                className="h-9 w-full rounded-lg border-app-border/80 bg-app-surface text-sm font-semibold text-app-text shadow-none placeholder:font-mono placeholder:text-app-muted"
                                                placeholder={agent.id}
                                                disabled={teamFetchLoading}
                                                title={`界面展示名称；未填写时与角色 ID「${agent.id}」相同。保存配置仍使用下方技术 ID。`}
                                                value={member?.display_name ?? ""}
                                                onChange={(e) => {
                                                  const display_name = e.target.value.trim() || undefined
                                                  setTeamEditMeta((m) => ({
                                                    ...m,
                                                    members: [
                                                      ...m.members.filter((x) => x.agent_id !== agent.id),
                                                      { agent_id: agent.id, display_name, role: member?.role },
                                                    ],
                                                  }))
                                                }}
                                                aria-label={`角色显示名，默认同 ${agent.id}`}
                                              />
                                            </div>
                                          </div>
                                          <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="h-9 gap-1 rounded-lg border-app-border/80 px-2.5 text-xs text-claw-700 hover:bg-claw-500/[0.06] dark:text-claw-300"
                                              onClick={() => {
                                                setWorkspaceOpenclawRoleId(agent.id)
                                                setAgentConfigSection("workspace")
                                              }}
                                            >
                                              <FileText className="h-3.5 w-3.5" />
                                              工作区
                                            </Button>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="inline-flex sm:shrink-0">
                                                  <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-9 w-9 shrink-0 rounded-lg border-app-border/80 text-app-muted hover:border-destructive/40 hover:bg-destructive/[0.06] hover:text-destructive"
                                                    disabled={roleListSaving || agentsList.length <= 1}
                                                    onClick={() => setDeleteRoleId(agent.id)}
                                                    aria-label={`删除角色 ${agent.id}`}
                                                  >
                                                    <Trash2 className="h-4 w-4" />
                                                  </Button>
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent side="bottom" className="max-w-xs text-xs">
                                                {agentsList.length <= 1 ? "至少保留一个角色" : "从 agents.list 移除此角色"}
                                              </TooltipContent>
                                            </Tooltip>
                                          </div>
                                        </div>

                                        <div className="space-y-3 px-4 py-2.5">
                                        <div className="space-y-1.5">
                                          <Label className="text-xs font-medium text-app-text">绑定模型</Label>
                                          <Select
                                            value={modelVal}
                                            disabled={roleListSaving}
                                            onValueChange={(v) => void handleRoleModelChange(agent.id, v)}
                                          >
                                            <SelectTrigger className="h-10 w-full rounded-lg border-app-border/80 bg-app-surface text-sm shadow-none">
                                              <SelectValue placeholder="选择模型" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {modelSelectOptions.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                  {opt.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-app-muted">角色说明</Label>
                                            <Input
                                              className="h-10 rounded-lg border-app-border/80 bg-app-surface text-sm shadow-none"
                                              placeholder="职责简述（可选）"
                                              disabled={teamFetchLoading}
                                              value={member?.role ?? ""}
                                              onChange={(e) => {
                                                const role = e.target.value.trim() || undefined
                                                setTeamEditMeta((m) => ({
                                                  ...m,
                                                  members: [
                                                    ...m.members.filter((x) => x.agent_id !== agent.id),
                                                    { agent_id: agent.id, display_name: member?.display_name, role },
                                                  ],
                                                }))
                                              }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              </TooltipProvider>
                            )
                          })()}
                        </section>
                        {teamFetchLoading && (
                          <div className="mt-4 flex items-center gap-2 rounded-lg border border-app-border/60 bg-app-elevated/30 px-3 py-2 text-xs text-app-muted">
                            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-claw-500" />
                            正在同步 Pond 团队信息…
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    )}
                    {agentConfigSection === "team_space" && (
                    <Card className="overflow-hidden bg-app-surface">
                      <CardHeader className="space-y-3 pb-2">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-claw-500/10 text-claw-600 dark:text-claw-400">
                              <LayoutDashboard className="h-4 w-4" />
                            </span>
                            <div>
                              <CardTitle className="text-base font-semibold text-app-text">团队空间</CardTitle>
                            </div>
                          </div>
                          <div className="flex w-full flex-wrap gap-1 rounded-xl border border-app-border/60 bg-app-elevated/40 p-1 lg:w-auto">
                            {([
                              { id: "overview" as const, label: "概览" },
                              { id: "docs" as const, label: "文档" },
                              { id: "tasks" as const, label: "任务台" },
                            ] as const).map(({ id, label }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setTeamSpaceTab(id)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                                  teamSpaceTab === id
                                    ? "bg-claw-500/15 text-claw-800 shadow-sm dark:text-claw-200"
                                    : "text-app-muted hover:bg-app-hover hover:text-app-text",
                                )}
                              >
                                {label}
                                {id === "tasks" && teamTaskStats.open > 0 ? (
                                  <span className="rounded-full bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                                    {teamTaskStats.open}
                                  </span>
                                ) : null}
                                {id === "tasks" && teamTaskStats.failed > 0 ? (
                                  <span className="rounded-full bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-900 dark:text-rose-100">
                                    {teamTaskStats.failed}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="border-t border-app-border/50 px-4 pb-6 pt-4 sm:px-6">
                        {teamSpaceTab === "overview" && (
                          <>
                        {teamSpaceInitialized === null && (
                          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-claw-500" />
                            <p className="text-sm text-app-muted">正在检查团队空间…</p>
                          </div>
                        )}
                        {teamSpaceInitialized === false && (
                          <div className="space-y-5 py-2">
                            {teamFetchError && (
                              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                                {teamFetchError}
                              </p>
                            )}
                            <div className="overflow-hidden rounded-2xl border border-claw-500/25 bg-gradient-to-b from-claw-500/10 via-app-elevated/40 to-app-surface/30 p-6 text-center shadow-sm sm:p-8">
                              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-claw-500/15 text-claw-600 dark:text-claw-400">
                                <Sparkles className="h-7 w-7" />
                              </div>
                              <h3 className="mt-4 text-lg font-semibold text-app-text">尚未开启团队空间</h3>
                              <div className="mx-auto mt-6 max-w-sm text-left">
                                <Label htmlFor="team-name-onboard" className="text-xs text-app-muted">
                                  团队名称（可选）
                                </Label>
                                <Input
                                  id="team-name-onboard"
                                  placeholder="请输入团队名称"
                                  value={teamEditMeta.team_name ?? ""}
                                  onChange={(e) =>
                                    setTeamEditMeta((m) => ({ ...m, team_name: e.target.value.trim() || undefined }))
                                  }
                                  className="mt-1.5 h-10 rounded-lg border-app-border/80 bg-app-surface"
                                />
                              </div>
                              <Button
                                type="button"
                                className="mt-6 h-10 gap-2 rounded-lg bg-claw-500 px-6 text-white hover:bg-claw-600"
                                disabled={teamSaving || !(openclawConfig?.agents?.list?.length)}
                                onClick={() => void enableTeamSpace()}
                              >
                                {teamSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                开启团队空间
                              </Button>
                              {!(openclawConfig?.agents?.list?.length) ? (
                                <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
                                  请先在「团队 → 角色列表」添加至少一个角色后再开启。
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )}
                        {teamSpaceInitialized === true && (
                          <div className="space-y-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                              <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-xs">
                                <Label htmlFor="team-name-pond" className="text-xs text-app-muted">团队名称</Label>
                                <Input
                                  id="team-name-pond"
                                  placeholder="请输入团队名称"
                                  disabled={teamFetchLoading}
                                  value={teamEditMeta.team_name ?? ""}
                                  onChange={(e) => setTeamEditMeta((m) => ({ ...m, team_name: e.target.value.trim() || undefined }))}
                                  className="h-9 rounded-lg border-app-border/80 bg-app-surface text-sm shadow-none placeholder:text-app-muted"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5 sm:items-end">
                                {teamFetchError && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 sm:text-right">{teamFetchError}</p>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-9 shrink-0 gap-1.5 rounded-lg bg-claw-500 px-4 hover:bg-claw-600 text-white"
                                  disabled={teamSaving || teamFetchLoading || !(openclawConfig?.agents?.list?.length)}
                                  onClick={async () => {
                                    const agentsList = openclawConfig?.agents?.list ?? []
                                    if (!teamLeaderAgentId) {
                                      toast.error("请先在角色列表中添加 id 为 main 的角色作为 Team Leader")
                                      return
                                    }
                                    setTeamSaving(true)
                                    try {
                                      const meta = {
                                        team_name: teamEditMeta.team_name || undefined,
                                        leader_agent_id: teamLeaderAgentId,
                                        members: agentsList.map((a) => ({
                                          agent_id: a.id,
                                          display_name: teamEditMeta.members.find((m) => m.agent_id === a.id)?.display_name,
                                          role: teamEditMeta.members.find((m) => m.agent_id === a.id)?.role,
                                        })),
                                      }
                                      await invoke("save_team_meta", { instanceId: selectedId, meta })
                                      setTeamFetchError(null)
                                      toast.success("团队信息已保存")
                                    } catch {
                                      toast.error("保存失败")
                                    } finally {
                                      setTeamSaving(false)
                                    }
                                  }}
                                >
                                  {teamSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  保存
                                </Button>
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="rounded-xl border border-app-border/70 bg-app-elevated/30 px-4 py-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">角色数</p>
                                <p className="mt-1 text-xl font-semibold tabular-nums text-app-text">{openclawConfig?.agents?.list?.length ?? 0}</p>
                              </div>
                              <div className="rounded-xl border border-app-border/70 bg-app-elevated/30 px-4 py-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">Team Leader</p>
                                <p className="mt-1 truncate font-mono text-sm text-app-text" title={teamLeaderAgentId ?? ""}>
                                  {teamLeaderAgentId ?? "未指定"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-app-border/70 bg-app-elevated/30 px-4 py-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">团队任务</p>
                                <p className="mt-1 text-xl font-semibold tabular-nums text-app-text">{teamTaskStats.total}</p>
                                <p className="mt-0.5 text-[11px] text-app-muted">
                                  已完成 {teamTaskStats.done}
                                  {teamTaskStats.failed > 0 ? ` · 需协调 ${teamTaskStats.failed}` : ""}
                                </p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 h-7 w-full px-0 text-xs text-claw-600 hover:text-claw-700 dark:text-claw-400"
                                  onClick={() => setTeamSpaceTab("tasks")}
                                >
                                  打开任务台
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-xl border border-app-border/60 bg-app-elevated/25 px-4 py-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-app-text">近期任务</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 px-2 text-xs text-claw-600 dark:text-claw-400"
                                  onClick={() => setTeamSpaceTab("tasks")}
                                >
                                  查看全部
                                </Button>
                              </div>
                              {teamDashboardLoading && teamTasks.length === 0 ? (
                                <Loader2 className="h-5 w-5 animate-spin text-app-muted" />
                              ) : teamTasks.length === 0 ? (
                                <p className="text-xs text-app-muted">暂无任务；在任务台中添加。</p>
                              ) : (
                                <ul className="space-y-2">
                                  {teamTasks
                                    .slice()
                                    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
                                    .slice(0, 6)
                                    .map((t) => (
                                      <li
                                        key={t.id}
                                        className="flex items-start justify-between gap-2 rounded-lg border border-app-border/40 bg-app-surface/50 px-2.5 py-1.5 text-xs"
                                      >
                                        <span className="min-w-0 flex-1 truncate font-medium text-app-text">{t.title}</span>
                                        <span
                                          className={cn(
                                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                            t.status === "open" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
                                            t.status === "claimed" && "bg-sky-500/15 text-sky-800 dark:text-sky-200",
                                            t.status === "failed" && "bg-rose-500/15 text-rose-800 dark:text-rose-200",
                                            t.status === "done" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                                          )}
                                        >
                                          {t.status === "open"
                                            ? "待领取"
                                            : t.status === "claimed"
                                              ? "进行中"
                                              : t.status === "failed"
                                                ? "失败"
                                                : t.status === "done"
                                                  ? "已完成"
                                                  : t.status}
                                        </span>
                                      </li>
                                    ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                          </>
                        )}
                        {teamSpaceTab === "docs" && (
                        <div className="space-y-4 text-sm leading-relaxed text-app-muted">
                          <p>
                            <span className="font-medium text-app-text">pond-team</span>：开启团队空间后写入当前实例{" "}
                            <code className="rounded bg-app-elevated px-1 py-0.5 text-xs font-mono">skills/pond-team/SKILL.md</code>，供角色按协作约定使用。
                          </p>
                          <p>
                            心跳轻量上下文开启时，仅向心跳注入{" "}
                            <code className="rounded bg-app-elevated px-1 py-0.5 text-xs font-mono">HEARTBEAT.md</code>（见「心跳与定时」）。
                          </p>
                          <p>
                            OpenClaw 多 Agent 与路由见官方文档：{" "}
                            <a
                              href="https://docs.openclaw.ai/concepts/multi-agent"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-claw-600 underline decoration-claw-500/30 underline-offset-2 hover:text-claw-500 dark:text-claw-400"
                            >
                              Multi-Agent Routing
                            </a>
                            。
                          </p>
                        </div>
                        )}
                        {teamSpaceTab === "tasks" && (
                        teamSpaceInitialized === true ? (
                          <div className="space-y-5">
                        <div className="overflow-hidden rounded-2xl border border-app-border/80 bg-gradient-to-b from-app-elevated/60 to-app-surface/30 shadow-sm">
                          {/* Title + refresh */}
                          <div className="flex flex-col gap-3 border-b border-app-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-claw-500/12 text-claw-600 dark:text-claw-400">
                                <ListTodo className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-app-text">团队任务台</h3>
                                <p className="text-[11px] leading-relaxed text-app-muted">
                                  成员会话活跃度与任务状态同屏；完成度随「已完成」任务更新。
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 shrink-0 border-app-border"
                              onClick={() => void loadTeamDashboard()}
                              disabled={teamDashboardLoading || !selectedId}
                            >
                              {teamDashboardLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                              同步
                            </Button>
                          </div>

                          {/* Member activity */}
                          <div className="border-b border-app-border/40 px-4 py-3">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">成员动态</p>
                            {!selectedId ? (
                              <p className="text-xs text-app-muted">选择实例后显示</p>
                            ) : getEffectiveGatewayInfo(selectedId).agentGatewayStatus !== "running" ? (
                              <p className="text-xs text-app-muted">启动 Gateway 后可查看各角色会话活跃度</p>
                            ) : teamActivityError ? (
                              <p className="text-xs text-amber-600 dark:text-amber-400">{teamActivityError}</p>
                            ) : teamDashboardLoading && teamActivity.length === 0 ? (
                              <Loader2 className="h-4 w-4 animate-spin text-app-muted" />
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {teamActivity.map((row) => {
                                  const label = teamEditMeta.members.find((m) => m.agent_id === row.agentId)?.display_name?.trim()
                                  const displayName = label || row.agentId
                                  const isLeader = row.agentId === TEAM_LEADER_AGENT_ID
                                  return (
                                    <div
                                      key={row.agentId}
                                      className={cn(
                                        "inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
                                        row.status === "active"
                                          ? "border-emerald-500/35 bg-emerald-500/10"
                                          : "border-app-border/70 bg-app-surface/60",
                                      )}
                                      title={
                                        row.sessionCount
                                          ? `${row.sessionCount} 个主会话 · ID ${row.agentId}`
                                          : `ID ${row.agentId}`
                                      }
                                    >
                                      <span
                                        className={cn(
                                          "h-1.5 w-1.5 shrink-0 rounded-full",
                                          row.status === "active" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-app-muted",
                                        )}
                                      />
                                      <span
                                        className={cn(
                                          "max-w-[140px] truncate text-[11px] text-app-text",
                                          !label && "font-mono",
                                        )}
                                      >
                                        {displayName}
                                      </span>
                                      {isLeader ? (
                                        <Crown className="h-3 w-3 shrink-0 text-amber-600/90" aria-label="Leader" />
                                      ) : null}
                                      <span
                                        className={cn(
                                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                          row.status === "active" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "text-app-muted",
                                        )}
                                      >
                                        {row.status === "active" ? "活跃" : "空闲"}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-3 border-b border-app-border/30 bg-app-elevated/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                                任务
                              </span>
                              {(
                                [
                                  { id: "all" as const, label: "全部", count: teamTaskStats.total },
                                  { id: "open" as const, label: "待领取", count: teamTaskStats.open },
                                  { id: "claimed" as const, label: "进行中", count: teamTaskStats.claimed },
                                  { id: "failed" as const, label: "失败", count: teamTaskStats.failed },
                                  { id: "done" as const, label: "已完成", count: teamTaskStats.done },
                                ] as const
                              ).map(({ id, label, count }) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => setTeamTodoFilter(id)}
                                  className={cn(
                                    "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                                    teamTodoFilter === id
                                      ? "bg-claw-500/15 text-claw-700 dark:text-claw-300"
                                      : "text-app-muted hover:bg-app-hover hover:text-app-text",
                                  )}
                                >
                                  {label}
                                  <span
                                    className={cn(
                                      "ml-1 tabular-nums opacity-80",
                                      id === "open" && "text-amber-600 dark:text-amber-400",
                                      id === "claimed" && "text-sky-600 dark:text-sky-400",
                                      id === "failed" && "text-rose-600 dark:text-rose-400",
                                      id === "done" && "text-emerald-600 dark:text-emerald-400",
                                      id === "all" && "text-app-text/70",
                                    )}
                                  >
                                    {count}
                                  </span>
                                </button>
                              ))}
                            </div>
                            {teamTaskStats.total > 0 ? (
                              <div className="flex min-w-0 w-full items-center gap-2 sm:w-auto sm:max-w-[min(100%,320px)] sm:flex-1 sm:justify-end">
                                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-app-muted">
                                  完成度
                                </span>
                                <div className="h-2 min-w-[100px] flex-1 overflow-hidden rounded-full bg-app-border/80">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-claw-500 to-emerald-500 transition-[width] duration-300"
                                    style={{ width: `${teamTaskStats.progressPct}%` }}
                                  />
                                </div>
                                <span className="shrink-0 text-[11px] tabular-nums text-app-muted">
                                  {teamTaskStats.done}/{teamTaskStats.total}
                                </span>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-2 border-b border-app-border/30 px-4 py-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,140px)_minmax(140px,200px)_auto] sm:items-end">
                              <div className="space-y-1.5">
                                <Label className="text-[11px] font-medium text-app-muted">任务标题</Label>
                                <Input
                                  placeholder="输入标题，Enter 快速添加"
                                  value={newTeamTaskTitle}
                                  onChange={(e) => setNewTeamTaskTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return
                                    e.preventDefault()
                                    void submitNewTeamTask()
                                  }}
                                  className="h-10 border-app-border/80 bg-app-surface"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] font-medium text-app-muted">添加方式</Label>
                                <Select
                                  value={newTeamTaskAssignMode}
                                  onValueChange={(v) => setNewTeamTaskAssignMode(v as "open" | "assigned")}
                                  disabled={!openclawConfig?.agents?.list?.length}
                                >
                                  <SelectTrigger className="h-10 w-full border-app-border/80 bg-app-surface text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="assigned">指派并认领</SelectItem>
                                    <SelectItem value="open">待领取</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] font-medium text-app-muted">指派人</Label>
                                <Select
                                  value={teamRoleAgentId || (openclawConfig?.agents?.list?.[0]?.id ?? "")}
                                  onValueChange={(v) => setTeamRoleAgentId(v)}
                                  disabled={
                                    !openclawConfig?.agents?.list?.length || newTeamTaskAssignMode === "open"
                                  }
                                >
                                  <SelectTrigger className="h-10 w-full border-app-border/80 bg-app-surface text-xs">
                                    <SelectValue placeholder="选择角色" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(openclawConfig?.agents?.list ?? []).map((a) => (
                                      <SelectItem key={a.id} value={a.id}>
                                        {a.id}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                className="h-10 w-full shrink-0 bg-claw-500 px-4 text-white hover:bg-claw-600 sm:w-auto"
                                disabled={
                                  !selectedId ||
                                  teamDashboardLoading ||
                                  !newTeamTaskTitle.trim() ||
                                  !(openclawConfig?.agents?.list?.length)
                                }
                                onClick={() => void submitNewTeamTask()}
                              >
                                添加
                              </Button>
                            </div>
                            {!(openclawConfig?.agents?.list?.length) ? (
                              <p className="text-[11px] text-amber-600/90 dark:text-amber-400">
                                请先在「团队 → 角色列表」中添加至少一个角色后再指派任务。
                              </p>
                            ) : null}
                          </div>

                          <div className="px-2 pb-3 pt-1">
                            {teamDashboardLoading && teamTaskList.length === 0 ? (
                              <div className="flex justify-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-app-muted/80" />
                              </div>
                            ) : (
                              <ul className="max-h-[min(420px,52vh)] space-y-1.5 overflow-y-auto px-1 pr-1">
                                {teamTaskList.map((t) => {
                                  const busy = teamTaskUpdatingId === t.id
                                  const statusLabel =
                                    t.status === "open"
                                      ? "待领取"
                                      : t.status === "claimed"
                                        ? "进行中"
                                        : t.status === "failed"
                                          ? "失败"
                                          : t.status === "done"
                                            ? "已完成"
                                            : t.status
                                  const borderCls =
                                    t.status === "done"
                                      ? "border-l-emerald-500/70"
                                      : t.status === "claimed"
                                        ? "border-l-sky-500/70"
                                        : t.status === "failed"
                                          ? "border-l-rose-500/70"
                                          : "border-l-amber-500/70"
                                  return (
                                    <li
                                      key={t.id}
                                      className={cn(
                                        "rounded-xl border border-app-border/50 bg-app-surface/70 py-2.5 pl-3 pr-2 shadow-sm backdrop-blur-sm border-l-[3px]",
                                        borderCls,
                                        t.status === "done" && "opacity-90",
                                      )}
                                    >
                                      <div className="flex gap-3">
                                        <div className="pt-0.5 text-app-muted">
                                          {t.status === "done" ? (
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                                          ) : t.status === "failed" ? (
                                            <XCircle className="h-4 w-4 text-rose-500" aria-hidden />
                                          ) : t.status === "claimed" ? (
                                            <Circle className="h-4 w-4 fill-sky-500/25 text-sky-500" aria-hidden />
                                          ) : (
                                            <Circle className="h-4 w-4 text-amber-500/90" aria-hidden />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <p
                                              className={cn(
                                                "text-sm font-medium text-app-text",
                                                t.status === "done" && "line-through decoration-app-muted/80",
                                              )}
                                            >
                                              {t.title}
                                            </p>
                                            <span
                                              className={cn(
                                                "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                                t.status === "open" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                                t.status === "claimed" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                                                t.status === "failed" && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                                                t.status === "done" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                                              )}
                                            >
                                              {statusLabel}
                                            </span>
                                          </div>
                                          {t.status === "failed" && t.failureReason ? (
                                            <p className="mt-1.5 rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 text-xs leading-relaxed text-rose-900/90 dark:text-rose-100/90">
                                              <span className="font-medium text-app-text/80">原因：</span>
                                              {t.failureReason}
                                            </p>
                                          ) : null}
                                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-app-muted">
                                            <span>
                                              更新{" "}
                                              {new Date(t.updatedAtMs).toLocaleString(undefined, {
                                                month: "numeric",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })}
                                            </span>
                                            {(t.status === "claimed" || t.status === "done" || t.status === "failed") &&
                                            t.claimedByAgentId ? (
                                              <span>
                                                指派人{" "}
                                                <span className="font-mono text-sky-600/90 dark:text-sky-400">
                                                  @{t.claimedByAgentId}
                                                </span>
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="mt-2 flex flex-wrap items-center gap-2">
                                            {t.status === "open" && (
                                              <>
                                                <Select
                                                  value={teamRoleAgentId || openclawConfig?.agents?.list?.[0]?.id || ""}
                                                  onValueChange={(v) => setTeamRoleAgentId(v)}
                                                >
                                                  <SelectTrigger className="h-8 w-[132px] text-xs">
                                                    <SelectValue placeholder="领取为" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {(openclawConfig?.agents?.list ?? []).map((a) => (
                                                      <SelectItem key={a.id} value={a.id}>
                                                        {a.id}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-8 text-xs"
                                                  disabled={busy}
                                                  onClick={async () => {
                                                    const aid = teamRoleAgentId.trim() || openclawConfig?.agents?.list?.[0]?.id
                                                    if (!selectedId || !aid) return
                                                    setTeamTaskUpdatingId(t.id)
                                                    try {
                                                      await invoke("update_team_task", {
                                                        instanceId: selectedId,
                                                        taskId: t.id,
                                                        status: "claimed",
                                                        claimedByAgentId: aid,
                                                      })
                                                      await loadTeamDashboard()
                                                      toast.success("已领取")
                                                    } catch (err) {
                                                      toast.error(err instanceof Error ? err.message : String(err))
                                                    } finally {
                                                      setTeamTaskUpdatingId(null)
                                                    }
                                                  }}
                                                >
                                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "领取"}
                                                </Button>
                                              </>
                                            )}
                                            {t.status === "claimed" && (
                                              <>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                                                  disabled={busy}
                                                  onClick={async () => {
                                                    if (!selectedId) return
                                                    setTeamTaskUpdatingId(t.id)
                                                    try {
                                                      await invoke("update_team_task", {
                                                        instanceId: selectedId,
                                                        taskId: t.id,
                                                        status: "done",
                                                      })
                                                      await loadTeamDashboard()
                                                      toast.success("已标记完成")
                                                    } catch (err) {
                                                      toast.error(err instanceof Error ? err.message : String(err))
                                                    } finally {
                                                      setTeamTaskUpdatingId(null)
                                                    }
                                                  }}
                                                >
                                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "完成"}
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-8 text-xs"
                                                  disabled={busy}
                                                  onClick={async () => {
                                                    if (!selectedId) return
                                                    setTeamTaskUpdatingId(t.id)
                                                    try {
                                                      await invoke("update_team_task", {
                                                        instanceId: selectedId,
                                                        taskId: t.id,
                                                        status: "open",
                                                      })
                                                      await loadTeamDashboard()
                                                      toast.success("已放回待领取")
                                                    } catch (err) {
                                                      toast.error(err instanceof Error ? err.message : String(err))
                                                    } finally {
                                                      setTeamTaskUpdatingId(null)
                                                    }
                                                  }}
                                                >
                                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "放回待领取"}
                                                </Button>
                                              </>
                                            )}
                                            {t.status === "failed" && (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs"
                                                disabled={busy}
                                                onClick={async () => {
                                                  if (!selectedId) return
                                                  setTeamTaskUpdatingId(t.id)
                                                  try {
                                                    await invoke("update_team_task", {
                                                      instanceId: selectedId,
                                                      taskId: t.id,
                                                      status: "open",
                                                    })
                                                    await loadTeamDashboard()
                                                    toast.success("已重新打开，可再次领取或指派")
                                                  } catch (err) {
                                                    toast.error(err instanceof Error ? err.message : String(err))
                                                  } finally {
                                                    setTeamTaskUpdatingId(null)
                                                  }
                                                }}
                                              >
                                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "重新打开"}
                                              </Button>
                                            )}
                                            {(t.status === "open" || t.status === "claimed") && (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                                                disabled={busy}
                                                onClick={() => {
                                                  setTeamTaskFailDialogTaskId(t.id)
                                                  setTeamTaskFailReasonInput("")
                                                }}
                                              >
                                                标记失败
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </li>
                                  )
                                })}
                                {teamTaskList.length === 0 && !teamDashboardLoading && (
                                  <li className="rounded-xl border border-dashed border-app-border/60 py-12 text-center text-sm text-app-muted">
                                    {teamTaskStats.total === 0
                                      ? "暂无任务，填写标题并选择指派人即可添加"
                                      : "当前筛选下没有任务"}
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                          </div>
                        ) : (
                          <p className="py-10 text-center text-sm text-app-muted">
                            请先在「概览」中开启团队空间，再在此管理任务与成员动态。
                          </p>
                        )
                        )}
                      </CardContent>
                    </Card>
                    )}

                    <Dialog
                      open={teamTaskFailDialogTaskId !== null}
                      onOpenChange={(o) => {
                        if (!o) {
                          setTeamTaskFailDialogTaskId(null)
                          setTeamTaskFailReasonInput("")
                        }
                      }}
                    >
                      <DialogContent className="border-app-border/80 bg-app-surface text-app-text sm:max-w-md">
                        <DialogHeader className="space-y-2">
                          <DialogTitle className="text-lg">标记任务失败</DialogTitle>
                          <DialogDescription className="text-left text-sm leading-relaxed text-app-muted">
                            请填写原因，Leader（main）会收到提醒并协调后续处理。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-1.5 pt-1">
                          <Label className="text-xs font-medium text-app-text">失败原因</Label>
                          <textarea
                            className="flex min-h-[100px] w-full resize-y rounded-lg border border-app-border/80 bg-app-surface px-3 py-2 text-sm text-app-text shadow-none placeholder:text-app-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-claw-500/40"
                            placeholder="例如：依赖未就绪、验收标准不清、权限或环境阻塞"
                            value={teamTaskFailReasonInput}
                            onChange={(e) => setTeamTaskFailReasonInput(e.target.value)}
                          />
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setTeamTaskFailDialogTaskId(null)
                              setTeamTaskFailReasonInput("")
                            }}
                          >
                            返回
                          </Button>
                          <Button
                            type="button"
                            className="bg-rose-600 text-white hover:bg-rose-700"
                            disabled={
                              !teamTaskFailReasonInput.trim() ||
                              (teamTaskFailDialogTaskId !== null &&
                                teamTaskUpdatingId === teamTaskFailDialogTaskId)
                            }
                            onClick={async () => {
                              const tid = teamTaskFailDialogTaskId
                              const r = teamTaskFailReasonInput.trim()
                              if (!selectedId || !tid) return
                              if (!r) {
                                toast.error("请填写失败原因")
                                return
                              }
                              setTeamTaskUpdatingId(tid)
                              try {
                                await invoke("update_team_task", {
                                  instanceId: selectedId,
                                  taskId: tid,
                                  status: "failed",
                                  failureReason: r,
                                })
                                await loadTeamDashboard()
                                toast.success("已标记失败")
                                setTeamTaskFailDialogTaskId(null)
                                setTeamTaskFailReasonInput("")
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : String(err))
                              } finally {
                                setTeamTaskUpdatingId(null)
                              }
                            }}
                          >
                            {teamTaskFailDialogTaskId !== null &&
                            teamTaskUpdatingId === teamTaskFailDialogTaskId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "确认"
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={addRoleDialogOpen} onOpenChange={setAddRoleDialogOpen}>
                      <DialogContent className="border-app-border/80 bg-app-surface text-app-text sm:max-w-md">
                        <DialogHeader className="space-y-2">
                          <DialogTitle className="text-lg">添加角色</DialogTitle>
                          <DialogDescription className="text-left text-sm leading-relaxed text-app-muted">
                            为团队新增一名角色，并为其选择要使用的模型。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 pt-1">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-app-text">角色 ID</Label>
                            <Input
                              className="h-10 rounded-lg border-app-border/80 bg-app-surface font-mono text-sm shadow-none placeholder:text-app-muted"
                              placeholder="例如 coder、researcher"
                              value={newRoleIdInput}
                              onChange={(e) => setNewRoleIdInput(e.target.value)}
                            />
                            <p className="text-[11px] text-app-muted">字母开头，可用字母、数字、连字符与下划线，至多 63 个字符。</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-app-text">绑定模型</Label>
                            <Select value={newRoleModelKey} onValueChange={setNewRoleModelKey}>
                              <SelectTrigger className="h-10 rounded-lg border-app-border/80 bg-app-surface shadow-none">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {modelSelectOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter className="gap-2 sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-lg border-app-border/80 bg-app-surface"
                            onClick={() => setAddRoleDialogOpen(false)}
                          >
                            取消
                          </Button>
                          <Button
                            type="button"
                            className="gap-1.5 rounded-lg bg-claw-500 px-4 hover:bg-claw-600 text-white"
                            disabled={roleListSaving}
                            onClick={() => void handleConfirmAddRole()}
                          >
                            {roleListSaving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                保存中…
                              </>
                            ) : (
                              "保存"
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog open={deleteRoleId !== null} onOpenChange={(open) => { if (!open) setDeleteRoleId(null) }}>
                      <AlertDialogContent className="border-app-border bg-app-surface text-app-text">
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除角色「{deleteRoleId ?? ""}」？</AlertDialogTitle>
                          <AlertDialogDescription className="text-app-muted">
                            将从当前实例的 agents.list 中移除；Pond 团队展示中对应条目也会去掉。至少保留一个角色。删除后请重启
                            Gateway，并检查 bindings 是否仍引用该 agentId。若该 agent 已有数据目录，请自行备份对应{" "}
                            <code className="text-xs">~/.openclaw-*</code> 或 OpenClaw 文档中的路径。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-app-border">取消</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={roleListSaving}
                            onClick={(e) => {
                              e.preventDefault()
                              void confirmDeleteRole()
                            }}
                          >
                            {roleListSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "删除"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                    {agentConfigSection === 'wakeup' && (
                  <>
                    {/* Heartbeat */}
                    <Card className="bg-app-surface">
                      <CardHeader className="space-y-1 pb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-claw-500/10">
                            <Heart className="h-4 w-4 text-claw-500" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-medium text-app-text">心跳 (Heartbeat)</CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-5 pt-0">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-app-muted">配置作用域</Label>
                          <Select
                            value={heartbeatScope}
                            onValueChange={setHeartbeatScope}
                          >
                            <SelectTrigger className="h-9 max-w-md border-app-border bg-app-elevated text-app-text">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__defaults__">全局默认（agents.defaults）</SelectItem>
                              {heartbeatRoleIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                  角色 {id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {heartbeatScope !== "__defaults__" && (
                            <p className="text-xs text-app-muted">
                              下方留空并保存将移除该角色的 <code className="font-mono text-[11px]">heartbeat</code>，改继承全局默认。
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                          <div className="flex min-w-0 flex-col gap-2">
                            <Label className="text-xs font-medium text-app-muted">心跳间隔 every</Label>
                            <Input
                              placeholder="如 30m、2h；0m 禁用"
                              value={agentHeartbeat.every}
                              onChange={(e) => setAgentHeartbeat({ ...agentHeartbeat, every: e.target.value })}
                              className="h-9 w-full max-w-[220px] border-app-border bg-app-elevated text-app-text"
                            />
                          </div>
                          <div className="flex min-w-0 flex-col gap-2">
                            <Label className="text-xs font-medium text-app-muted">活跃时段 activeHours（可选）</Label>
                            <div className="flex h-9 max-w-full flex-wrap items-center gap-2">
                              <Input
                                placeholder="08:00"
                                value={agentHeartbeat.activeStart}
                                onChange={(e) => setAgentHeartbeat({ ...agentHeartbeat, activeStart: e.target.value })}
                                className="h-9 w-[7.25rem] border-app-border bg-app-elevated px-2.5 font-mono text-sm tabular-nums text-app-text"
                              />
                              <span className="shrink-0 text-xs text-app-muted">至</span>
                              <Input
                                placeholder="24:00"
                                value={agentHeartbeat.activeEnd}
                                onChange={(e) => setAgentHeartbeat({ ...agentHeartbeat, activeEnd: e.target.value })}
                                className="h-9 w-[7.25rem] border-app-border bg-app-elevated px-2.5 font-mono text-sm tabular-nums text-app-text"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-app-muted">目标 target</Label>
                            <Select value={agentHeartbeat.target} onValueChange={(v) => setAgentHeartbeat({ ...agentHeartbeat, target: v })}>
                              <SelectTrigger className="h-9 border-app-border bg-app-elevated text-app-text">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">none（不对外投递）</SelectItem>
                                <SelectItem value="last">last</SelectItem>
                                <SelectItem value="whatsapp">whatsapp</SelectItem>
                                <SelectItem value="telegram">telegram</SelectItem>
                                <SelectItem value="discord">discord</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-app-muted">私聊投递 directPolicy</Label>
                            <Select
                              value={agentHeartbeat.directPolicy}
                              onValueChange={(v: "allow" | "block") =>
                                setAgentHeartbeat({ ...agentHeartbeat, directPolicy: v })
                              }
                            >
                              <SelectTrigger className="h-9 border-app-border bg-app-elevated text-app-text">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow">allow</SelectItem>
                                <SelectItem value="block">block</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-app-muted">收件人 to（可选）</Label>
                            <Input
                              placeholder="渠道相关 ID，如手机号、会话 id"
                              value={agentHeartbeat.to}
                              onChange={(e) => setAgentHeartbeat({ ...agentHeartbeat, to: e.target.value })}
                              className="h-9 border-app-border bg-app-elevated text-app-text"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-app-muted">账户 accountId（可选）</Label>
                            <Input
                              placeholder="多账号渠道的 accountId"
                              value={agentHeartbeat.accountId}
                              onChange={(e) => setAgentHeartbeat({ ...agentHeartbeat, accountId: e.target.value })}
                              className="h-9 border-app-border bg-app-elevated text-app-text"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-app-border bg-app-elevated/40 px-4 py-3.5">
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm font-medium text-app-text">lightContext</p>
                            <p className="text-xs text-app-muted">仅注入 HEARTBEAT.md</p>
                          </div>
                          <Switch
                            className="shrink-0"
                            checked={agentHeartbeat.lightContext}
                            onCheckedChange={(v) => setAgentHeartbeat({ ...agentHeartbeat, lightContext: v })}
                          />
                        </div>
                        <Button
                          size="sm"
                          className="bg-claw-500 hover:bg-claw-600 text-white"
                          onClick={async () => {
                            if (!selectedId) return
                            const cleared =
                              !agentHeartbeat.every.trim() &&
                              agentHeartbeat.target === "none" &&
                              !agentHeartbeat.lightContext &&
                              !(agentHeartbeat.activeStart.trim() && agentHeartbeat.activeEnd.trim()) &&
                              !agentHeartbeat.to.trim() &&
                              !agentHeartbeat.accountId.trim() &&
                              agentHeartbeat.directPolicy !== "block"
                            const hb: Record<string, unknown> = { target: agentHeartbeat.target }
                            const ev = agentHeartbeat.every.trim()
                            if (ev) hb.every = ev
                            if (agentHeartbeat.lightContext) hb.lightContext = true
                            if (agentHeartbeat.activeStart.trim() && agentHeartbeat.activeEnd.trim()) {
                              hb.activeHours = {
                                start: agentHeartbeat.activeStart.trim(),
                                end: agentHeartbeat.activeEnd.trim(),
                              }
                            }
                            if (agentHeartbeat.to.trim()) hb.to = agentHeartbeat.to.trim()
                            if (agentHeartbeat.accountId.trim()) hb.accountId = agentHeartbeat.accountId.trim()
                            if (agentHeartbeat.directPolicy === "block") hb.directPolicy = "block"
                            try {
                              const raw = await invoke<string>("load_agent_raw_config", { agentId: selectedId })
                              const config = JSON.parse(raw) as Record<string, unknown>
                              const agents = (config.agents as Record<string, unknown>) ?? {}
                              config.agents = agents
                              const defaults = (agents.defaults as Record<string, unknown>) ?? {}
                              agents.defaults = defaults
                              const list = Array.isArray(agents.list)
                                ? (agents.list as Record<string, unknown>[]).map((x) => ({ ...x }))
                                : []
                              agents.list = list

                              if (heartbeatScope === "__defaults__") {
                                if (cleared) {
                                  delete defaults.heartbeat
                                } else {
                                  defaults.heartbeat = hb
                                }
                              } else {
                                const idx = list.findIndex((e) => e.id === heartbeatScope)
                                if (idx < 0) {
                                  toast.error("未找到该角色")
                                  return
                                }
                                const entry = { ...list[idx] }
                                if (cleared) {
                                  delete entry.heartbeat
                                } else {
                                  entry.heartbeat = hb
                                }
                                list[idx] = entry
                              }

                              const updated = JSON.stringify(config, null, 2)
                              await invoke("save_agent_raw_config", { agentId: selectedId, rawJson: updated })
                              setRawConfig(updated)
                              await loadInstanceConfig(selectedId)
                              toast.success("心跳配置已保存")
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : String(e))
                            }
                          }}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          保存心跳配置
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Cron for this instance (wake path with heartbeat) */}
                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm font-medium text-app-text">定时任务</CardTitle>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 border-app-border text-app-muted hover:bg-app-hover"
                            onClick={() => selectedId && fetchCronJobs(selectedId)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            刷新
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const list = cronJobs ?? []
                          if (list.length === 0) {
                            return (
                              <p className="py-6 text-center text-sm text-app-muted">
                                当前实例暂无定时任务，在对话中让 Agent 创建定时任务后会在此显示
                              </p>
                            )
                          }
                          return (
                            <ul className="space-y-2">
                              {list.map((job) => (
                                <li key={job.id} className="rounded-xl border border-app-border bg-app-elevated/50 p-3">
                                  <div className="flex items-center gap-2">
                                    <span className={cn("h-2 w-2 rounded-full shrink-0", job.enabled ? "bg-emerald-500" : "bg-app-muted")} />
                                    <span className="text-sm font-medium text-app-text truncate">{job.name}</span>
                                    <code className="ml-auto shrink-0 rounded bg-app-surface px-1.5 py-0.5 text-[10px] font-mono text-app-muted">{job.schedule}</code>
                                  </div>
                                  {job.description && <p className="mt-1 text-xs text-app-muted truncate pl-4">{job.description}</p>}
                                  {job.enabled && job.nextRunAt && <p className="mt-0.5 text-[11px] text-app-muted/80 pl-4">下次运行：{job.nextRunAt}</p>}
                                </li>
                              ))}
                            </ul>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  </>
                )}
                    {agentConfigSection === 'channels' && (
                  <>
                    {/* Channels: add/edit instances and bind agents */}
                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-claw-500/10 text-claw-600 dark:text-claw-400">
                            <Radio className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <CardTitle className="text-sm font-medium text-app-text">消息渠道</CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <ChannelManager embedded />
                      </CardContent>
                    </Card>
                  </>
                )}
                    {agentConfigSection === 'hooks' && (
                  <>
                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-sm font-medium text-app-text">Hooks</CardTitle>
                          </div>
                          <Switch
                            checked={getInternalHooksFromConfig(openclawConfig)?.enabled !== false}
                            onCheckedChange={(v) => {
                              if (!openclawConfig || !selectedId) return
                              const prev = (openclawConfig.hooks as Record<string, unknown>) ?? {}
                              const prevInternal = (prev.internal as HooksInternalConfig) ?? {}
                              saveOpenClawConfig(
                                {
                                  ...openclawConfig,
                                  hooks: { ...prev, internal: { ...prevInternal, enabled: v } } as OpenClawConfig["hooks"],
                                },
                                selectedId
                              ).catch(() => {})
                            }}
                            aria-label="启用内部 Hooks"
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <HooksManager embedded />
                      </CardContent>
                    </Card>
                  </>
                )}
                    {agentConfigSection === "logs" && (
                  <InstanceGatewayLogPanel instanceId={selectedId} />
                )}
                    {agentConfigSection === 'skills' && (
                  <>
                    {/* Skills: install URL + toggles */}
                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-app-text">技能</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <Input
                            placeholder="技能链接或 ID，如 https://clawhub.ai/skills/xxx 或 my-skill"
                            value={skillInstallInput}
                            onChange={(e) => setSkillInstallInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                handleInstallSkill().catch(() => {})
                              }
                            }}
                            className="flex-1 border-app-border bg-app-elevated text-app-text placeholder:text-app-muted"
                          />
                          <Button
                            size="sm"
                            className="bg-claw-500 hover:bg-claw-600 text-white shrink-0"
                            disabled={!selectedId || installingSkill || !skillInstallInput.trim()}
                            onClick={async () => {
                              await handleInstallSkill()
                            }}
                          >
                            {installingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            安装
                          </Button>
                          </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-app-text">全部技能</p>
                          {skillsForInstance && skillsForInstance.all.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-app-border text-app-muted hover:bg-app-hover"
                                onClick={() => setSelectedSkillIds(skillsForInstance.all.map((s) => s.name))}
                              >
                                全部启用
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-app-border text-app-muted hover:bg-app-hover"
                                onClick={() => setSelectedSkillIds([])}
                              >
                                全部禁用
                              </Button>
                          </div>
                          )}
                          </div>
                        {(!skillsForInstance || skillsForInstance.all.length === 0) ? (
                          <p className="text-sm text-app-muted">
                            未能列出技能。请确认本机可运行 OpenClaw CLI；也可通过上方安装技能到工作区或托管目录（
                            <a href="https://docs.openclaw.ai/zh-CN/tools/skills#%E4%BD%8D%E7%BD%AE%E5%92%8C%E4%BC%98%E5%85%88%E7%BA%A7" target="_blank" rel="noopener noreferrer" className="text-claw-400 hover:underline">优先级</a>
                            ：工作区 &gt; 托管/本地 &gt; 内置）。
                          </p>
                        ) : (
                          <div className="space-y-3">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
                              <Input
                                value={skillListQuery}
                                onChange={(e) => setSkillListQuery(e.target.value)}
                                placeholder="搜索技能名称、描述或来源..."
                                className="border-app-border bg-app-elevated pl-9 text-app-text placeholder:text-app-muted"
                              />
                            </div>
                            <div className="max-h-[min(420px,50vh)] min-h-0 overflow-y-auto rounded-lg border border-app-border bg-app-elevated/50">
                              {filteredSkillsAll.length === 0 ? (
                                <p className="px-3 py-8 text-center text-sm text-app-muted">无匹配技能，请调整关键词</p>
                              ) : (
                          <ul className="divide-y divide-app-border">
                            {filteredSkillsAll.map((row) => {
                              const diskPath =
                                skillsForInstance.workspace.find((e) => e.id === row.name)?.path ??
                                skillsForInstance.managed.find((e) => e.id === row.name)?.path ??
                                null
                              const canUninstall = Boolean(diskPath)
                              return (
                                <li key={row.name} className="flex flex-row items-start gap-2 px-3 py-3 sm:gap-3">
                                  <button
                                    type="button"
                                    className={cn(
                                      "min-w-0 flex-1 space-y-1 rounded-md text-left -mx-2 px-2 py-1 transition-colors",
                                      "hover:bg-app-hover/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-claw-500/30",
                                    )}
                                    onClick={() => void handleOpenSkillDirectory(row.name)}
                                    aria-label={`打开技能 ${row.name} 所在目录`}
                                  >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                      <span className="text-sm font-medium text-app-text">{row.name}</span>
                                      {row.bundled && (
                                        <span className="rounded bg-app-border/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-app-muted">
                                          内置
                                        </span>
                                      )}
                                      <span
                                        className={cn(
                                          "text-[10px] font-medium uppercase tracking-wide",
                                          row.eligible ? "text-emerald-600 dark:text-emerald-400" : "text-app-muted",
                                        )}
                                      >
                                        {row.eligible ? "可用" : "条件未满足"}
                                      </span>
                                    </div>
                                    {row.description ? (
                                      <p className="text-xs leading-snug text-app-muted line-clamp-3">{row.description}</p>
                                    ) : null}
                                    <p className="text-[11px] text-app-muted/90">
                                      {row.source || "—"}
                                      {row.blockedByAllowlist ? " · 受 allowBundled 限制" : ""}
                                    </p>
                                  </button>
                                  <div className="flex shrink-0 items-center gap-1 pt-0.5 sm:gap-1.5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0 text-app-muted hover:text-app-text"
                                      onClick={() => void handleOpenSkillDirectory(row.name)}
                                      aria-label={`打开 ${row.name} 目录`}
                                    >
                                      <FolderOpen className="h-4 w-4" />
                                    </Button>
                                    {canUninstall ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 shrink-0 gap-1 px-2 text-app-muted hover:text-red-500 hover:bg-red-500/10"
                                        onClick={() => handleUninstallSkill(row.name)}
                                        disabled={uninstallingSkillId === row.name}
                                      >
                                        {uninstallingSkillId === row.name ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <>
                                            <Trash2 className="h-3.5 w-3.5" />
                                            卸载
                                          </>
                                        )}
                                      </Button>
                                    ) : null}
                                    <Switch
                                      checked={selectedSkillIds.includes(row.name)}
                                      onCheckedChange={() => toggleSkill(row.name)}
                                    />
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                              )}
                            </div>
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="mt-2 bg-claw-500 hover:bg-claw-600 text-white"
                          onClick={handleSaveSkills}
                          disabled={saving || !skillsForInstance || skillsForInstance.all.length === 0}
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          保存技能配置
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-claw-500" />
                          <CardTitle className="text-sm font-medium text-app-text">工具权限</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <Label className="text-xs text-app-muted">预设模板（Profile）</Label>
                          <div className="grid grid-cols-1 gap-2">
                            {TOOL_PROFILES.map((p) => (
                              <button
                                key={p.value}
                                type="button"
                                onClick={() => setAgentTools({ ...agentTools, profile: p.value })}
                                className={cn(
                                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                                  agentTools.profile === p.value
                                    ? "border-claw-500 bg-claw-500/10"
                                    : "border-app-border bg-app-surface hover:border-app-hover hover:bg-app-elevated"
                                )}
                              >
                                <span className={cn(
                                  "text-sm font-medium",
                                  agentTools.profile === p.value ? "text-claw-600 dark:text-claw-400" : "text-app-text"
                                )}>{p.label}</span>
                                <span className="text-xs text-app-muted">{p.desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          className="bg-claw-500 hover:bg-claw-600 text-white"
                          onClick={async () => {
                            const success = await patchAgentConfig({
                              tools: {
                                profile: agentTools.profile === "full" ? undefined : agentTools.profile,
                              },
                            })
                            if (success) toast.success("工具权限已保存")
                          }}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          保存工具权限
                        </Button>
                      </CardContent>
                    </Card>
                  </>
                )}
                    {agentConfigSection === 'workspace' && (
                  <>
                    {/* Workspace files: tree + editor, full height */}
                    <div className="flex flex-col min-h-[calc(100vh-10rem)]">
                      <Card className="flex flex-1 flex-col min-h-0 bg-app-surface overflow-hidden">
                        <CardHeader className="pb-3 shrink-0">
                        <CardTitle className="text-sm font-medium text-app-text flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          工作区文件
                        </CardTitle>
                        {workspaceOverrideAgents.length > 0 && (
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                            <Label className="text-xs text-app-muted shrink-0">编辑目标</Label>
                            <Select
                              value={workspaceOpenclawRoleId ?? "__default__"}
                              onValueChange={(v) =>
                                setWorkspaceOpenclawRoleId(v === "__default__" ? null : v)
                              }
                            >
                              <SelectTrigger className="h-9 max-w-md border-app-border bg-app-elevated text-sm">
                                <SelectValue placeholder="选择角色工作区" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">实例默认 workspace/</SelectItem>
                                {workspaceOverrideAgents.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.id}（独立 workspace）
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {workspaceFilesGuide && (
                          <div className="mx-6 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-100/90">
                            {workspaceFilesGuide}
                          </div>
                        )}
                      </CardHeader>
                        <CardContent className="flex flex-1 flex-col min-h-0 p-0">
                          <div className="flex flex-1 min-h-0">
                            <aside className="w-44 shrink-0 border-r border-app-border bg-app-elevated/50 flex flex-col py-2 overflow-y-auto">
                            <TooltipProvider delayDuration={300}>
                              {workspaceFileList.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-app-muted">加载失败或暂无列表</p>
                              ) : (
                                workspaceFileList.map((f) => (
                                  <Tooltip key={f.name}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedWorkspaceFile(f.name)
                                          loadWorkspaceFileContent(f.name)
                                        }}
                                        className={cn(
                                          "w-full text-left px-3 py-2 text-sm truncate border-l-2 border-transparent",
                                          !f.exists && "opacity-60",
                                          selectedWorkspaceFile === f.name
                                            ? "bg-claw-500/10 text-claw-600 dark:text-claw-400 border-l-claw-500"
                                            : "text-app-muted hover:bg-app-hover hover:text-app-text"
                                        )}
                                      >
                                  {f.name}
                                  {!f.exists ? <span className="ml-1 text-[10px] text-app-muted">（未创建）</span> : null}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-[200px] bg-app-elevated border border-app-border text-app-text text-xs">
                                      {WORKSPACE_FILE_LABELS[f.name] ?? "工作区文件"}
                                    </TooltipContent>
                                  </Tooltip>
                                ))
                              )}
                            </TooltipProvider>
                          </aside>
                          <div className="flex-1 flex flex-col min-h-0 min-w-0 p-3">
                        {workspaceFileError && (
                              <p className="text-sm text-red-500 mb-2 shrink-0">{workspaceFileError}</p>
                        )}
                        <textarea
                              className="flex-1 min-h-0 w-full resize-none rounded-lg border border-app-border bg-app-elevated px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-claw-500/50"
                              placeholder={selectedWorkspaceFile ? "文件内容（留空保存将创建或清空）" : "左侧选择文件"}
                          value={workspaceFileContent}
                          onChange={(e) => setWorkspaceFileContent(e.target.value)}
                          disabled={!selectedWorkspaceFile}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck="false"
                        />
                            <div className="flex items-center gap-2 mt-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-claw-500 hover:bg-claw-600 text-white"
                          onClick={handleSaveWorkspaceFile}
                          disabled={!selectedWorkspaceFile || workspaceFileSaving}
                        >
                          {workspaceFileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          保存
                        </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-app-border text-app-muted hover:bg-app-hover"
                                onClick={() => selectedWorkspaceFile && loadWorkspaceFileContent(selectedWorkspaceFile)}
                                disabled={!selectedWorkspaceFile}
                              >
                                重新加载
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    </div>
                  </>
                )}
                    {agentConfigSection === "browser" && (
                  <>
                    <Card className="overflow-hidden bg-app-surface">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-claw-500/10">
                              <Globe className="h-4 w-4 text-claw-500" />
                            </div>
                            <CardTitle className="text-sm font-medium text-app-text">浏览器</CardTitle>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-app-muted">启用</span>
                            <Switch checked={browserEnabled} onCheckedChange={setBrowserEnabled} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="browser-profile" className="text-app-muted">配置文件</Label>
                          <Select value={browserMode} onValueChange={(v) => setBrowserMode(v as "openclaw" | "chrome")}>
                            <SelectTrigger id="browser-profile" className="border-app-border bg-app-elevated text-app-text">
                              <SelectValue placeholder="选择模式" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="openclaw">openclaw — 托管隔离浏览器（可固定 profile）</SelectItem>
                              <SelectItem value="chrome">chrome — 系统浏览器 + 扩展中继</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {browserMode === "openclaw" && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="browser-user-data-dir" className="text-app-muted">Profile 目录</Label>
                              <Input
                                id="browser-user-data-dir"
                                placeholder={browserDefaultUserDataDir || "加载中…"}
                                value={browserUserDataDir}
                                onChange={(e) => setBrowserUserDataDir(e.target.value)}
                                className="border-app-border bg-app-elevated text-app-text font-mono text-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="browser-executable" className="text-app-muted">可执行文件</Label>
                              <Input
                                id="browser-executable"
                                placeholder={browserExecutablePlaceholder || "加载中…"}
                                value={browserExecutablePath}
                                onChange={(e) => setBrowserExecutablePath(e.target.value)}
                                className="border-app-border bg-app-elevated text-app-text font-mono text-sm"
                              />
                            </div>
                            <div className="space-y-4">
                              <TooltipProvider delayDuration={300}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <Label htmlFor="browser-color" className="text-app-muted">主题色</Label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex text-app-muted hover:text-app-text cursor-help" tabIndex={0}>
                                          <HelpCircle className="h-3.5 w-3.5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-[240px] text-xs">
                                        openclaw 托管浏览器窗口的主题色，用于标题栏等界面元素。
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground font-mono text-xs min-w-[4.5rem]">
                                      {/^#[0-9A-Fa-f]{6}$/.test(browserColor) ? browserColor : "#ff4500"}
                                    </span>
                                    <input
                                      type="color"
                                      id="browser-color"
                                      value={/^#[0-9A-Fa-f]{6}$/.test(browserColor) ? browserColor : "#ff4500"}
                                      onChange={(e) => setBrowserColor(e.target.value)}
                                      className="h-9 w-14 cursor-pointer rounded border border-app-border bg-transparent p-0.5"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <Label htmlFor="browser-headless" className="text-app-muted">Headless</Label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex text-app-muted hover:text-app-text cursor-help" tabIndex={0}>
                                          <HelpCircle className="h-3.5 w-3.5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-[240px] text-xs">
                                        无头模式，不显示浏览器窗口，在后台运行。适合服务器或不需要看到界面的场景。
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <Switch id="browser-headless" checked={browserHeadless} onCheckedChange={setBrowserHeadless} />
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <Label htmlFor="browser-nosandbox" className="text-app-muted">NoSandbox</Label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex text-app-muted hover:text-app-text cursor-help" tabIndex={0}>
                                          <HelpCircle className="h-3.5 w-3.5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-[240px] text-xs">
                                        关闭 Chrome 沙箱。部分环境（如 Docker、某些 Linux）需要开启才能正常启动浏览器。
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <Switch id="browser-nosandbox" checked={browserNoSandbox} onCheckedChange={setBrowserNoSandbox} />
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <Label htmlFor="browser-attach-only" className="text-app-muted">仅附加</Label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex text-app-muted hover:text-app-text cursor-help" tabIndex={0}>
                                          <HelpCircle className="h-3.5 w-3.5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-[240px] text-xs">
                                        不自动启动浏览器，仅附加到已存在且开启远程调试的 Chrome 实例（如你自启的固定 profile）。
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <Switch id="browser-attach-only" checked={browserAttachOnly} onCheckedChange={setBrowserAttachOnly} />
                                </div>
                              </TooltipProvider>
                            </div>
                          </>
                        )}

                        {browserMode === "chrome" && (
                          <ChromeExtensionGuide />
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-app-border"
                            disabled={browserSaving || !selectedId}
                            onClick={async () => {
                              if (!openclawConfig || !selectedId) return
                              setBrowserSaving(true)
                              const nextBrowser: BrowserConfig = {
                                enabled: browserEnabled,
                                defaultProfile: browserMode,
                                ...(browserMode === "openclaw"
                                  ? {
                                      profiles: {
                                        openclaw: {
                                          ...(browserUserDataDir.trim() ? { userDataDir: browserUserDataDir.trim() } : {}),
                                          ...(browserColor.trim() ? { color: browserColor.trim() } : {}),
                                        } as BrowserProfileConfig,
                                      },
                                      ...(browserExecutablePath.trim() ? { executablePath: browserExecutablePath.trim() } : {}),
                                      ...(browserHeadless ? { headless: true } : {}),
                                      ...(browserNoSandbox ? { noSandbox: true } : {}),
                                      ...(browserAttachOnly ? { attachOnly: true } : {}),
                                    }
                                  : {}),
                              }
                              try {
                                await saveOpenClawConfig({ ...openclawConfig, browser: nextBrowser } as OpenClawConfig, selectedId)
                                toast.success("已保存")
                              } catch (e) {
                                toast.error(String(e))
                              }
                              setBrowserSaving(false)
                            }}
                          >
                            {browserSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                            保存
                          </Button>
                          {selectedId && browserMode === "openclaw" && (
                            <Button
                              size="sm"
                              className="bg-claw-500 hover:bg-claw-600 text-white"
                              disabled={browserCommandLoading}
                              onClick={async () => {
                                setBrowserCommandLoading(true)
                                const runOnce = async (): Promise<{ ok: boolean; msg: string }> => {
                                  const r = await invoke<{ stdout: string; stderr: string; success: string }>("run_browser_command", { instanceId: selectedId, profile: browserMode, subcommand: "start", extraArgs: null })
                                  if (r.success === "true") return { ok: true, msg: "" }
                                  const msg = r.stderr || r.stdout || "启动失败"
                                  return { ok: false, msg }
                                }
                                try {
                                  const gw = getEffectiveGatewayInfo(selectedId)
                                  if (gw.agentGatewayStatus !== "running") {
                                    toast.error("请先启动 Gateway 后再打开浏览器")
                                    setBrowserCommandLoading(false)
                                    return
                                  }
                                  await invoke("ensure_gateway_remote_token", { instanceId: selectedId })
                                  let result = await runOnce()
                                  if (!result.ok && /unauthorized|token missing|gateway/i.test(result.msg)) {
                                    await invoke("ensure_gateway_remote_token", { instanceId: selectedId })
                                    result = await runOnce()
                                  }
                                  if (result.ok) toast.success("浏览器已打开")
                                  else {
                                    const isGatewayHint = /unauthorized|token missing|gateway/i.test(result.msg)
                                    if (isGatewayHint) {
                                      try {
                                        await invoke("ensure_gateway_tokens_for_instance", { instanceId: selectedId })
                                        toast.error("已写入认证配置。若 Gateway 此前已启动，请先重启 Gateway 后再试")
                                      } catch {
                                        toast.error("无法打开浏览器，请确认 Gateway 已启动")
                                      }
                                    } else toast.error(result.msg.length > 120 ? result.msg.slice(0, 120) + "…" : result.msg)
                                  }
                                } catch (e) {
                                  const msg = String(e)
                                  if (/unauthorized|token missing|gateway/i.test(msg)) {
                                    try {
                                      await invoke("ensure_gateway_remote_token", { instanceId: selectedId })
                                      const retry = await runOnce()
                                      if (retry.ok) toast.success("浏览器已打开")
                                      else {
                                        await invoke("ensure_gateway_tokens_for_instance", { instanceId: selectedId }).catch(() => {})
                                        toast.error("已写入认证配置。若 Gateway 此前已启动，请先重启 Gateway 后再试")
                                      }
                                    } catch {
                                      toast.error("无法打开浏览器，请确认 Gateway 已启动")
                                    }
                                  } else toast.error(msg)
                                }
                                setBrowserCommandLoading(false)
                              }}
                            >
                              {browserCommandLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                              打开浏览器
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
                    {agentConfigSection === 'advanced' && (
                  <>
                    {/* Raw openclaw.json editor */}
                    <div className="flex flex-col min-h-[calc(100vh-11rem)] gap-3">
                      <div className="flex items-center justify-between gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!selectedId) return
                            try {
                              const dirPath = await invoke<string>("get_agent_directory", { agentId: selectedId })
                              await invoke("open_path", { path: dirPath })
                            } catch (e) {
                              toast.error(`打开目录失败: ${e instanceof Error ? e.message : String(e)}`)
                            }
                          }}
                          className="flex items-center gap-1.5 text-xs text-app-muted hover:text-app-text truncate min-w-0 max-w-[60%] text-left"
                          title="点击打开实例目录"
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{rawConfigPath || "—"}</span>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              className="bg-claw-500 hover:bg-claw-600 text-white"
                              onClick={handleSaveRawConfig}
                              disabled={rawConfigSaving}
                            >
                              {rawConfigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            保存
                            </Button>
                            <Button
                              size="sm"
                            variant="outline"
                              className="border-app-border text-app-muted hover:bg-app-hover"
                              onClick={() => selectedId && loadAgentRawConfig(selectedId)}
                            >
                              重新加载
                            </Button>
                            <a
                            href="https://docs.openclaw.ai/"
                              target="_blank"
                              rel="noopener noreferrer"
                            className="text-xs text-claw-500 hover:text-claw-400 hover:underline"
                            >
                            文档
                            </a>
                          </div>
                      </div>
                      {rawConfigError && (
                        <p className="text-sm text-red-500 shrink-0">{rawConfigError}</p>
                      )}
                      <textarea
                        className="flex-1 min-h-[240px] w-full resize-none rounded-xl border border-app-border bg-app-elevated px-4 py-3 font-mono text-xs text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-claw-500/50"
                        placeholder='{"models": {}, "agents": {}, ...}'
                        value={rawConfig}
                        onChange={(e) => {
                          setRawConfig(e.target.value)
                          setRawConfigError(null)
                        }}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck="false"
                      />
                    </div>

                    {/* Delete instance */}
                    <Button
                      variant="ghost"
                            size="sm"
                      className="text-red-400 hover:text-red-300"
                            onClick={() => setConfirmDelete(true)}
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            删除此 Agent
                          </Button>
                  </>
                )}
            </div>
          )}
        </main>

      {/* Delete confirm dialog */}
      {confirmDelete && selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmDelete(false)}
          role="dialog"
          aria-modal="true"
        >
          <Card
            className="w-full max-w-sm border-app-border bg-app-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                  <Trash2 className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-app-text">删除实例</h3>
                <p className="mt-2 text-sm text-app-muted">
                  确定删除「{getAgentDisplayName(selectedId, displayNames)}」？将同时删除其 OpenClaw 实例目录、绑定的渠道和聊天记录，此操作不可撤销。
                </p>
              </div>
              <div className="mt-6 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-app-border text-app-muted hover:bg-app-hover"
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
                  onClick={handleDeleteAgent}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                  {saving ? "删除中…" : "确认删除"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <CreateOpenClawInstanceDialog open={showAddModal} onOpenChange={setShowAddModal} />
    </div>
  )
}
