import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import i18n from '../i18n'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { loadAppConfig, saveAppConfig, sortInstanceIdsByIdOrder, type AppConfig } from "../lib/appStore"
import { detectSystemLocale, type AppLocale } from "../lib/locale"
import type { 
  GatewayStatus, 
  AgentGatewayPayload,
  AgentGatewayInfo,
  OpenClawConfig, 
  SkillPackage,
  TodaySpendResult,
  CronJobWithNext,
  SystemInfo,
  ChartPoint,
  ChatMessage,
  ChatToolCallPart,
  ChatReasoningPart,
  ChatExecutionState,
} from '../types'
import { SYSTEM_CHART_HISTORY_LEN } from '../types'
import type { ExecutionStep } from '../components/ExecutionTimeline'

/** Per-instance chat UI state (persisted across views) */
export interface ChatSessionState {
  messages: ChatMessage[]
  streamingContent: string
  streamingToolCalls: ChatToolCallPart[]
  streamingReasoning: ChatReasoningPart | null
  sending: boolean
  executionState: ChatExecutionState
  executionStartTime: number | null
  executionSteps: ExecutionStep[]
  error: string | null
  sessionKey: string
}

export function getDefaultChatState(): ChatSessionState {
  return {
    messages: [],
    streamingContent: '',
    streamingToolCalls: [],
    streamingReasoning: null,
    sending: false,
    executionState: 'idle',
    executionStartTime: null,
    executionSteps: [],
    error: null,
    sessionKey: '',
  }
}

import {
  buildAgentsAndModelsFromProvider,
  hasConfiguredModel as hasConfiguredModelFromConfig,
} from '../lib/openclawAgentsModels'
import { defaultModelHint } from '../constants/providers'
import { normalizePondProfileId, resolveChatStoreKey } from '../lib/chatSessionKeys'
import { resolvePondInstanceId } from '../lib/pondInstanceId'
import type { AgentConfigSectionId, TeamSpaceTabId } from '../constants/agentConfigNav'

const _unlisteners: UnlistenFn[] = []

interface AppState {
  // Gateway status (per agent)
  agentGateways: Record<string, { 
    status: GatewayStatus; 
    port: number; 
    pid: number | null; 
    uptimeSeconds: number | null; 
    memoryMb: number | null;
    executionState?: import('../types').AgentExecutionState;
    lastActivity?: number;
  }>
  gatewayError: string | null

  // Config
  /** Managed instance ids from disk: default → ~/.openclaw/..., others ~/.openclaw-{id}/... */
  instanceIds: string[]
  /** Selected instance; openclawConfig matches this id */
  selectedInstanceId: string | null
  /** Display names from each workspace/IDENTITY.md (fallback to id) */
  instanceDisplayNames: Record<string, string>
  openclawConfig: OpenClawConfig | null
  
  availableSkills: SkillPackage[]
  enabledSkills: string[]
  /** Skills for selected instance (incl. bundled); from list_skills_for_instance */
  skillsForInstance: import('../types').SkillsForInstance | null
  /** Hooks list cache (stale-while-revalidate when revisiting settings) */
  hooksListCache: Record<string, import('../types').HooksListResult>
  
  // Dashboard: spend, cron, tokens, sessions
  todaySpend: TodaySpendResult | null
  cronJobs: CronJobWithNext[]
  tokenStats: import('../types').TokenStatsResult | null
  chatSessions: import('../types').ChatSessionInfo[]

  // Dashboard: CPU/mem chart history (persist across views)
  systemInfo: SystemInfo | null
  cpuHistory: ChartPoint[]
  memHistory: ChartPoint[]

  // Chat: per-storeKey session state (streaming survives view switches)
  chatByInstance: Record<string, ChatSessionState>
  
  currentView: AppConfig["currentView"]
  /** Active settings sidebar section when currentView === 'agents' */
  agentConfigSection: AgentConfigSectionId
  /** Team space sub-tab when agentConfigSection === 'team_space' */
  teamSpaceTab: TeamSpaceTabId
  pendingAgentId: string | null
  preferencesOpen: boolean
  /** UI language (synced with i18n + app.json) */
  locale: AppLocale

  // Onboarding when no config; auto-import if ~/.openclaw exists
  needsOnboarding: boolean
  onboardingChecked: boolean

  // Actions
  setGatewayError: (error: string | null) => void
  loadConfigs: (cachedAppConfig?: AppConfig) => Promise<void>
  /** Load instance into openclawConfig and set selectedInstanceId */
  loadInstanceConfig: (instanceId: string, skipSkills?: boolean) => Promise<void>
  /** Switch instance; null clears selection */
  switchInstance: (instanceId: string | null, skipSkills?: boolean) => Promise<void>
  /** Refresh display name from IDENTITY.md (agent may rename in chat) */
  refreshInstanceDisplayName: (instanceId: string) => Promise<void>
  /** Save openclaw.json; pass explicit instanceId to avoid races with selection */
  saveOpenClawConfig: (config: OpenClawConfig, instanceId?: string | null) => Promise<void>

  startAgentGateway: (agentId?: string, port?: number) => Promise<void>
  stopAgentGateway: (agentId?: string) => Promise<void>
  restartAgentGateway: (agentId?: string) => Promise<void>
  refreshAgentGatewayInfo: (agentId?: string) => Promise<void>
  loadAllGatewayStatuses: () => Promise<void>
  getAgentGatewayStatus: (agentId: string) => { status: GatewayStatus; port: number }
  updateAgentExecutionState: (agentId: string, executionState: import('../types').AgentExecutionState) => void

  /** Get chat slice by chatSessionStoreKey (default if missing; no implicit persist) */
  getChatSessionState: (storeKey: string) => ChatSessionState
  /** Patch chat slice (streaming, tool calls, etc.) */
  updateChatSession: (storeKey: string, partial: Partial<ChatSessionState>) => void
  /** Load transcript from disk (fileInstanceId) into storeKey bucket */
  loadSessionTranscript: (fileInstanceId: string, sessionKey: string, sessionId: string | undefined, storeKey: string) => Promise<void>

  /** Resolve gateway port/status for an agent (local app only) */
  getEffectiveGatewayInfo: (agentId: string) => {
    port: number
    agentGatewayStatus: GatewayStatus
  }

  loadSkills: () => Promise<void>
  setHooksListCache: (instanceId: string, data: import('../types').HooksListResult) => void

  fetchTodaySpend: () => Promise<void>
  /** Fetch cron jobs; defaults to selected instance */
  fetchCronJobs: (instanceIdOverride?: string | null) => Promise<void>
  fetchTokenStats: () => Promise<void>
  fetchChatSessions: () => Promise<void>

  /** Append CPU/mem sample to rolling history (Dashboard poll) */
  applySystemMetrics: (info: SystemInfo) => void
  
  setCurrentView: (view: AppConfig["currentView"], pendingAgentId?: string | null) => void
  setAgentConfigSection: (section: AppState['agentConfigSection']) => void
  setTeamSpaceTab: (tab: TeamSpaceTabId) => void
  setPreferencesOpen: (open: boolean) => void
  setLocale: (lng: AppLocale) => Promise<void>

  /** Import ~/.openclaw into Pond and reload */
  importSystemOpenClaw: () => Promise<void>
  /** Dismiss onboarding without writing config */
  finishOnboarding: () => void
  /** Complete onboarding: write agents+models and close wizard */
  completeOnboarding: (providerId: string, apiKey: string, baseURL?: string, model?: string) => Promise<void>

  /** Run openclaw setup for instance dir (with toast) */
  ensureInstanceSetup: (agentId: string) => Promise<void>
  /** Create new isolated OpenClaw profile via CLI; name from IDENTITY.md */
  createOpenClawInstance: () => Promise<void>

  initialize: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  agentGateways: {},
  gatewayError: null,
  instanceIds: [],
  selectedInstanceId: null,
  instanceDisplayNames: {},
  openclawConfig: null,
  availableSkills: [],
  enabledSkills: [],
  skillsForInstance: null,
  hooksListCache: {},
  todaySpend: null,
  cronJobs: [],
  tokenStats: null,
  chatSessions: [],
  systemInfo: null,
  cpuHistory: Array.from({ length: SYSTEM_CHART_HISTORY_LEN }, (_, i) => ({ i, value: 0 })),
  memHistory: Array.from({ length: SYSTEM_CHART_HISTORY_LEN }, (_, i) => ({ i, value: 0 })),
  chatByInstance: {},
  currentView: 'dashboard',
  agentConfigSection: 'model',
  teamSpaceTab: 'overview',
  pendingAgentId: null,
  preferencesOpen: false,
  needsOnboarding: false,
  onboardingChecked: false,
  locale: detectSystemLocale(),

  // Actions
  setGatewayError: (error) => set({ gatewayError: error }),

  loadConfigs: async (cachedAppConfig) => {
    try {
      let instanceIds = await invoke<string[]>('list_openclaw_instances').catch((): string[] => [])
      const appConfig = cachedAppConfig ?? (await loadAppConfig())
      instanceIds = sortInstanceIdsByIdOrder(instanceIds, appConfig.instanceOrder)
      await saveAppConfig({ instanceOrder: instanceIds })
      await invoke('set_exit_preferences', {
        minimizeToTray: appConfig.minimizeToTray,
        stopAgentsOnExit: appConfig.stopAgentsOnExit,
      })
      const selectedId =
        [get().selectedInstanceId, appConfig.selectedInstanceId].find(
          (id): id is string => !!id && instanceIds.includes(id)
        ) ?? instanceIds[0] ?? null
      const names: Record<string, string> = {}
      await Promise.all(
        instanceIds.map(async (id) => {
          try {
            names[id] = await invoke<string>('get_instance_display_name', { instanceId: id })
          } catch {
            names[id] = id
          }
        })
      )
      let openclawConfig: OpenClawConfig | null = null
      if (selectedId) {
        try {
          openclawConfig = await invoke<OpenClawConfig>('load_openclaw_config_for_instance', { instanceId: selectedId })
        } catch (e) {
          console.error('Failed to load instance config:', e)
        }
      }
      set({
        instanceIds,
        selectedInstanceId: selectedId,
        instanceDisplayNames: names,
        openclawConfig,
        locale: appConfig.locale ?? get().locale,
      })
      await get().loadSkills()
    } catch (error) {
      console.error('Failed to load configs:', error)
    }
  },

  loadInstanceConfig: async (instanceId: string, skipSkills?: boolean) => {
    try {
      const config = await invoke<OpenClawConfig>('load_openclaw_config_for_instance', { instanceId })
      let name = get().instanceDisplayNames[instanceId]
      if (name === undefined) {
        try {
          name = await invoke<string>('get_instance_display_name', { instanceId })
        } catch {
          name = instanceId
        }
        set((s) => ({ instanceDisplayNames: { ...s.instanceDisplayNames, [instanceId]: name } }))
      }
      set({ selectedInstanceId: instanceId, openclawConfig: config })
      void saveAppConfig({ selectedInstanceId: instanceId }).catch(() => {})
      // Skip skills loading if requested (e.g., for new instances)
      if (!skipSkills) {
        await get().loadSkills()
      } else {
        // Load skills in background
        void get().loadSkills()
      }
    } catch (error) {
      console.error('Failed to load instance config:', error)
      throw error
    }
  },

  switchInstance: async (instanceId: string | null, skipSkills?: boolean) => {
    if (instanceId === null) {
      set({ selectedInstanceId: null, openclawConfig: null })
      void saveAppConfig({ selectedInstanceId: null }).catch(() => {})
      return
    }
    await get().loadInstanceConfig(instanceId, skipSkills)
  },

  refreshInstanceDisplayName: async (instanceId: string) => {
    try {
      const name = await invoke<string>('get_instance_display_name', { instanceId }).catch(() => instanceId)
      set((s) => ({ instanceDisplayNames: { ...s.instanceDisplayNames, [instanceId]: name } }))
    } catch {
      // Ignore; keep previous display name
    }
  },

  saveOpenClawConfig: async (config, instanceIdOverride) => {
    const explicit =
      instanceIdOverride != null && String(instanceIdOverride).trim() !== ''
        ? String(instanceIdOverride).trim()
        : null
    const instanceId =
      explicit ??
      resolvePondInstanceId(
        get().instanceIds,
        get().selectedInstanceId,
      ) ??
      'default'
    try {
      await invoke('save_openclaw_config_for_instance', { instanceId, config })
      set({ openclawConfig: config })
    } catch (error) {
      console.error('Failed to save OpenClaw config:', error)
      throw error
    }
  },

  startAgentGateway: async (agentId, port) => {
    const key = agentId ?? 'default'

    const current = get().agentGateways[key]
    if (current?.status === 'running' || current?.status === 'starting') return

    // Runtime env follows instance config; load that instance if not selected
    try {
      set((s) => ({
        agentGateways: { ...s.agentGateways, [key]: { ...s.agentGateways[key], status: 'starting' as GatewayStatus, port: port ?? s.agentGateways[key]?.port ?? 18789, pid: null, uptimeSeconds: null, memoryMb: null } },
        gatewayError: null,
      }))
      await invoke('start_gateway', { instanceId: agentId, port: port ?? null })
      // Brief delay after invoke so events propagate; then sync (recovery or normal start)
      await new Promise(r => setTimeout(r, 300))
      await get().loadAllGatewayStatuses()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      set((s) => ({
        agentGateways: { ...s.agentGateways, [key]: { ...s.agentGateways[key], status: 'error' as GatewayStatus, pid: null, uptimeSeconds: null, memoryMb: null } },
        gatewayError: msg,
      }))
      throw error
    }
  },

  stopAgentGateway: async (agentId) => {
    const key = agentId ?? 'default'
    set({ gatewayError: null })
    try {
      await invoke('stop_gateway', { instanceId: agentId })
      set((s) => ({
        agentGateways: { ...s.agentGateways, [key]: { ...s.agentGateways[key], status: 'stopped' as GatewayStatus, pid: null, uptimeSeconds: null, memoryMb: null } },
      }))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      set({ gatewayError: msg })
      throw error
    }
  },

  restartAgentGateway: async (agentId) => {
    try {
      set((s) => ({
        agentGateways: { ...s.agentGateways, [agentId ?? 'default']: { ...s.agentGateways[agentId ?? 'default'], status: 'starting' as GatewayStatus } },
        gatewayError: null,
      }))
      await invoke('restart_gateway', { instanceId: agentId })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      set((s) => ({
        agentGateways: { ...s.agentGateways, [agentId ?? 'default']: { ...s.agentGateways[agentId ?? 'default'], status: 'stopped' as GatewayStatus } },
        gatewayError: msg,
      }))
      throw error
    }
  },

  refreshAgentGatewayInfo: async (agentId) => {
    const key = agentId ?? 'default'
    try {
      const [pid, uptime, memory] = await Promise.all([
        invoke<number | null>('get_gateway_pid', { agentId }),
        invoke<number | null>('get_gateway_uptime_seconds', { agentId }),
        invoke<number | null>('get_gateway_memory_mb', { agentId }),
      ])
      set((s) => ({
        agentGateways: { ...s.agentGateways, [key]: { ...s.agentGateways[key], pid: pid ?? null, uptimeSeconds: uptime ?? null, memoryMb: memory ?? null } },
      }))
    } catch (_) {
      // ignore
    }
  },

  loadAllGatewayStatuses: async () => {
    try {
      await invoke<number>('probe_running_gateways').catch(() => 0)
      const list = await invoke<AgentGatewayInfo[]>('get_all_gateway_statuses')
      const map: Record<string, { status: GatewayStatus; port: number; pid: number | null; uptimeSeconds: number | null; memoryMb: number | null }> = {}
      for (const item of list) {
        map[item.agent_id] = {
          status: item.status as GatewayStatus,
          port: item.port,
          pid: item.pid,
          uptimeSeconds: item.uptime_seconds,
          memoryMb: null,
        }
      }
      set({ agentGateways: map })
    } catch (_) {
      // ignore
    }
  },

  getAgentGatewayStatus: (agentId) => {
    const key = (!agentId || agentId === 'default') ? 'default' : agentId
    const entry = get().agentGateways[key]
    return entry ? { status: entry.status, port: entry.port } : { status: 'stopped' as GatewayStatus, port: 18789 }
  },

  updateAgentExecutionState: (agentId, executionState) => {
    const key = (!agentId || agentId === 'default') ? 'default' : agentId
    set((s) => {
      const existing = s.agentGateways[key]
      if (!existing) {
        // Create a minimal gateway entry if missing
        return {
          agentGateways: {
            ...s.agentGateways,
            [key]: {
              status: 'stopped' as GatewayStatus,
              port: 18789,
              pid: null,
              uptimeSeconds: null,
              memoryMb: null,
              executionState,
              lastActivity: Date.now(),
            },
          },
        }
      }
      return {
        agentGateways: {
          ...s.agentGateways,
          [key]: {
            ...existing,
            executionState,
            lastActivity: Date.now(),
          },
        },
      }
    })
  },

  getChatSessionState: (storeKey) => {
    const key = resolveChatStoreKey(storeKey)
    const state = get().chatByInstance[key]
    return state ? { ...state } : getDefaultChatState()
  },

  updateChatSession: (storeKey, partial) => {
    const key = resolveChatStoreKey(storeKey)
    set((s) => ({
      chatByInstance: {
        ...s.chatByInstance,
        [key]: {
          ...getDefaultChatState(),
          ...s.chatByInstance[key],
          ...partial,
        },
      },
    }))
  },

  loadSessionTranscript: async (fileInstanceId, sessionKey, sessionId, storeKeyParam) => {
    const fileInstanceKey = normalizePondProfileId(fileInstanceId)
    const storeKey = resolveChatStoreKey(storeKeyParam)
    const json = await invoke<string>('load_session_transcript', {
      instanceId: fileInstanceKey,
      sessionKey,
      sessionId: sessionId ?? null,
    })
    let messages: ChatMessage[]
    try {
      const parsed = JSON.parse(json) as unknown
      if (!Array.isArray(parsed)) {
        throw new Error('transcript must be an array of messages')
      }
      messages = parsed as ChatMessage[]
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`Failed to parse session history: ${msg}`)
    }
    set((s) => ({
      chatByInstance: {
        ...s.chatByInstance,
        [storeKey]: {
          ...getDefaultChatState(),
          ...s.chatByInstance[storeKey],
          messages,
          sessionKey,
        },
      },
    }))
  },

  getEffectiveGatewayInfo: (agentId) => {
    const key = (!agentId || agentId === 'default') ? 'default' : agentId
    const gw = get().agentGateways[key]
    return {
      port: gw?.port ?? 18789,
      agentGatewayStatus: gw?.status ?? 'stopped' as GatewayStatus,
    }
  },

  loadSkills: async () => {
    const selectedId =
      resolvePondInstanceId(
        get().instanceIds,
        get().selectedInstanceId,
      ) ?? 'default'
    try {
      const forInstance = await invoke<import('../types').SkillsForInstance>('list_skills_for_instance', {
        instanceId: selectedId,
      })
      set({
        skillsForInstance: forInstance,
        enabledSkills: forInstance.enabled,
      })
    } catch (error) {
      console.error('Failed to load skills:', error)
      set({
        skillsForInstance: null,
        enabledSkills: [],
      })
    }
  },

  setHooksListCache: (instanceId, data) => {
    set((s) => ({ hooksListCache: { ...s.hooksListCache, [instanceId]: data } }))
  },

  fetchTodaySpend: async () => {
    try {
      const result = await invoke<TodaySpendResult>('get_today_spend')
      set({ todaySpend: result })
    } catch (e) {
      console.error('Failed to fetch today spend:', e)
      set({ todaySpend: null })
    }
  },

  fetchCronJobs: async (instanceIdOverride) => {
    const explicit =
      instanceIdOverride != null && String(instanceIdOverride).trim() !== ''
        ? String(instanceIdOverride).trim()
        : null
    const instanceId =
      explicit ??
      resolvePondInstanceId(
        get().instanceIds,
        get().selectedInstanceId,
      ) ??
      'default'
    try {
      const list = await invoke<CronJobWithNext[]>('list_cron_jobs_for_instance', {
        instanceId,
      })
      set({ cronJobs: list })
    } catch (e) {
      console.error('Failed to fetch cron jobs:', e)
      set({ cronJobs: [] })
    }
  },


  fetchTokenStats: async () => {
    try {
      const stats = await invoke<import('../types').TokenStatsResult>('get_token_stats')
      set({ tokenStats: stats })
    } catch (e) {
      console.error('Failed to fetch token stats:', e)
      set({ tokenStats: null })
    }
  },

  fetchChatSessions: async () => {
    const instanceId =
      resolvePondInstanceId(
        get().instanceIds,
        get().selectedInstanceId,
      ) ?? 'default'
    const { port, agentGatewayStatus } = get().getEffectiveGatewayInfo(instanceId)
    if (agentGatewayStatus !== 'running') {
      set({ chatSessions: [] })
      return
    }
    try {
      const rows = await invoke<import('../types').GatewaySessionRow[]>('list_gateway_sessions', {
        instanceId,
        port,
      })
      const sessions: import('../types').ChatSessionInfo[] = rows.map((r) => ({
        sessionKey: r.sessionKey,
        instanceId: instanceId,
        messageCount: 0,
        lastPreview: r.label ?? r.channel ?? r.sessionKey.slice(-24),
      }))
      set({ chatSessions: sessions })
    } catch (e) {
      console.error('Failed to fetch chat sessions:', e)
      set({ chatSessions: [] })
    }
  },

  applySystemMetrics: (info) => {
    const memPct = info.memory_total_mb > 0
      ? (info.memory_used_mb / info.memory_total_mb) * 100
      : 0
    const push = (prev: ChartPoint[], value: number): ChartPoint[] => {
      const next =
        prev.length >= SYSTEM_CHART_HISTORY_LEN
          ? [
              ...prev.slice(1).map((d, idx) => ({ i: idx, value: d.value })),
              { i: SYSTEM_CHART_HISTORY_LEN - 1, value },
            ]
          : [...prev.map((d, idx) => ({ i: idx, value: d.value })), { i: prev.length, value }].slice(
              -SYSTEM_CHART_HISTORY_LEN
            )
      return next.length === SYSTEM_CHART_HISTORY_LEN
        ? next
        : Array.from({ length: SYSTEM_CHART_HISTORY_LEN }, (_, i) => next[i] ?? { i, value: 0 })
    }
    set({
      systemInfo: info,
      cpuHistory: push(get().cpuHistory, info.cpu_usage_percent),
      memHistory: push(get().memHistory, memPct),
    })
  },

  setCurrentView: (view, pendingAgentId) => {
    set({ currentView: view, pendingAgentId: pendingAgentId ?? null })
    void saveAppConfig({ currentView: view }).catch(() => {})
  },
  setAgentConfigSection: (section) => set({ agentConfigSection: section }),
  setTeamSpaceTab: (tab) => set({ teamSpaceTab: tab }),
  setPreferencesOpen: (open) => set({ preferencesOpen: open }),

  setLocale: async (lng) => {
    set({ locale: lng })
    await saveAppConfig({ locale: lng })
    const { setAppLocale } = await import("../i18n")
    setAppLocale(lng)
    const { syncNativeMenus } = await import("../lib/syncNativeMenus")
    await syncNativeMenus()
  },

  importSystemOpenClaw: async () => {
    try {
      // 1. Import system OpenClaw into Pond-managed instances
      await invoke('import_system_openclaw_config')
      
      // 2. Reload configs
      await get().loadConfigs()
      
      // 3. Ensure instance dir is complete (same as create-instance flow)
      try {
        await get().ensureInstanceSetup('default')
      } catch (e) {
        console.warn('ensureInstanceSetup failed:', e)
        // Non-fatal; dir may already be complete
      }
    } catch (error) {
      console.error('Failed to import system OpenClaw config:', error)
      throw error
    }
  },

  finishOnboarding: () => set({ needsOnboarding: false }),

  ensureInstanceSetup: async (agentId: string) => {
    const toastId = `instance-setup-${agentId}`
    toast.loading(i18n.t('toast.instanceSetupLoading'), { id: toastId })
    try {
      await invoke('run_openclaw_agents_add', { agentId })
      toast.success(i18n.t('toast.instanceReady'), { id: toastId })
    } catch (e) {
      toast.dismiss(toastId)
      throw e
    }
  },

  createOpenClawInstance: async () => {
    let id = Math.random().toString(36).slice(2, 7)
    while (id.toLowerCase() === 'default' || id.toLowerCase() === 'main') {
      id = Math.random().toString(36).slice(2, 7)
    }
    const toastId = `create-instance-${id}`
    
    // Set app cursor to show progress
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'wait'
    }
    
    toast.loading(i18n.t('toast.createInstanceLoading'), { id: toastId })
    try {
      await invoke('run_openclaw_agents_add', { agentId: id })
      await get().loadConfigs()
      // Skip skills loading for new instance (load in background)
      await get().switchInstance(id, true)
      toast.success(i18n.t('toast.instanceReady'), {
        id: toastId,
        description: i18n.t('toast.createInstanceSuccessHint'),
      })
    } catch (e) {
      toast.dismiss(toastId)
      toast.error(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      // Restore cursor
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'auto'
      }
    }
  },

  completeOnboarding: async (providerId, apiKey, baseURL, model) => {
    const key = (apiKey ?? '').trim()
    if (!key) return
    const defaultId = 'default'
    
    // Provider ID to OpenClaw auth-choice mapping
    const authChoiceMap: Record<string, string> = {
      'anthropic': 'anthropic-api-key',
      'openai': 'openai-api-key',
      'google': 'gemini-api-key',
      'deepseek': 'custom-api-key',
      'openrouter': 'openrouter-api-key',
      'xai': 'xai-api-key',
      'mistral': 'mistral-api-key',
      'groq': 'custom-api-key',
      'together': 'together-api-key',
      'cerebras': 'custom-api-key',
      'bailian': 'custom-api-key',
      'moonshot': 'moonshot-api-key',
      'zhipu': 'custom-api-key',
      'minimax': 'custom-api-key',
      'volcengine': 'volcengine-api-key',
      'huggingface': 'huggingface-api-key',
      'nvidia': 'custom-api-key',
      'bedrock': 'custom-api-key',
      'azure': 'custom-api-key',
      'ollama': 'custom-api-key',
      'vllm': 'custom-api-key',
      'opencode': 'opencode-zen',
      'vercel-ai-gateway': 'ai-gateway-api-key',
      'custom': 'custom-api-key',
    }
    
    const authChoice = authChoiceMap[providerId] || 'custom-api-key'
    const needsCustomParams = !['anthropic', 'openai', 'google'].includes(providerId)
    
    try {
      // Use openclaw onboard for one-shot initialization (avoids N CLI calls for skills)
      await invoke('run_openclaw_onboard_non_interactive', {
        instanceId: defaultId,
        gatewayPort: 18789,
        authChoice,
        anthropicApiKey: providerId === 'anthropic' ? key : undefined,
        openaiApiKey: providerId === 'openai' ? key : undefined,
        geminiApiKey: providerId === 'google' ? key : undefined,
        customBaseUrl: needsCustomParams ? (baseURL || undefined) : undefined,
        customModelId: needsCustomParams ? (model || defaultModelHint(providerId)) : undefined,
        customApiKey: needsCustomParams ? key : undefined,
      })
      
      set({ needsOnboarding: false })
      await get().loadConfigs()
      void get().restartAgentGateway('default').catch(() => {})
    } catch (error) {
      console.error('Onboarding failed:', error)
      throw error
    }
  },

  initialize: async () => {
    const appCfg = await loadAppConfig().catch((): undefined => undefined)
    if (appCfg) {
      set({
        currentView: appCfg.currentView,
        ...(appCfg.locale === "zh" || appCfg.locale === "en"
          ? { locale: appCfg.locale }
          : {}),
      })
    }
    await get().loadConfigs(appCfg)

    const hasConfiguredModel = (): boolean => hasConfiguredModelFromConfig(get().openclawConfig)

    if (!get().onboardingChecked) {
      if (hasConfiguredModel()) {
        set({ needsOnboarding: false, onboardingChecked: true })
      } else {
        // Detect system ~/.openclaw
        try {
          const sys = await invoke<{ exists: boolean }>('detect_system_openclaw')
          if (sys?.exists) {
            // Auto-import into Pond
            await invoke('import_system_openclaw_config')
            await get().loadConfigs()
            
            // Skip onboarding; user can set API keys in-app
            set({ needsOnboarding: false, onboardingChecked: true })
          } else {
            // No system install; show wizard
            set({ needsOnboarding: true, onboardingChecked: true })
          }
        } catch {
          set({ needsOnboarding: true, onboardingChecked: true })
        }
      }
    }

    // Probe all gateway processes
    await get().loadAllGatewayStatuses()

    // Clear prior listeners (React StrictMode double-mount)
    if (_unlisteners.length > 0) {
      _unlisteners.forEach(fn => fn())
      _unlisteners.length = 0
    }
    const u1 = await listen<AgentGatewayPayload>('gateway-status', async (event) => {
      const p = event.payload
      const key = p.agent_id || 'default'
      set((s) => ({
        agentGateways: {
          ...s.agentGateways,
          [key]: {
            ...s.agentGateways[key],
            status: p.status,
            port: p.port,
            pid: s.agentGateways[key]?.pid ?? null,
            uptimeSeconds: s.agentGateways[key]?.uptimeSeconds ?? null,
            memoryMb: s.agentGateways[key]?.memoryMb ?? null,
          },
        },
        gatewayError: p.status === 'error' ? (p.message ?? null) : null,
      }))
      if (p.status === 'running') {
        await get().refreshAgentGatewayInfo(key)
      }
    })
    _unlisteners.push(u1)
  },
}))
