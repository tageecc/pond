import type { ExecutionStep } from "../components/ExecutionTimeline"

export type GatewayStatus = 'stopped' | 'starting' | 'running' | 'error'

export type GatewayMode = 'local' | 'remote'

export interface AgentGatewayPayload {
  agent_id: string
  status: GatewayStatus
  message?: string
  port: number
}

/** Agent execution state */
export type AgentExecutionState = "idle" | "thinking" | "executing_tool" | "done" | "error"

/** Chat execution state (same as AgentExecutionState, for UI) */
export type ChatExecutionState = AgentExecutionState

/** One tool call for display */
export interface ChatToolCallPart {
  callId: string
  name: string
  args: string
}

/** Reasoning / thinking block */
export interface ChatReasoningPart {
  summary?: string
  content?: string
}

/** Chat message (matches ChatView; persisted across views) */
export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  sentAt?: string
  toolCalls?: ChatToolCallPart[]
  reasoning?: ChatReasoningPart
  executionTime?: number
  /** Per-turn execution steps for this assistant reply (client-side; may be absent in transcript) */
  executionSteps?: ExecutionStep[]
}

export interface AgentGatewayInfo {
  agent_id: string
  status: GatewayStatus
  message?: string
  port: number
  pid: number | null
  uptime_seconds: number | null
  execution_state?: AgentExecutionState
  last_activity?: number // Last activity timestamp (ms)
}


/** Per-channel instance under channels.<id> */
export interface ChannelInstanceConfig {
  agentId?: string
  name?: string
  botToken?: string
  token?: string
  userId?: string
  allowFrom?: string[]
  /** DM policy: pairing | allowlist | open | disabled */
  dmPolicy?: string
  /** Group policy: allowlist | pairing | open */
  groupPolicy?: string
  [key: string]: unknown
}

/** One AI model instance config */
export interface LLMModelConfig {
  provider?: string
  apiKey?: string
  baseURL?: string
  model?: string
  name?: string
  [key: string]: unknown
}

/** OpenClaw agents: list + defaults.model.primary */
export interface OpenClawAgentsShape {
  /** list[].model: `provider/modelId` string (same shape as defaults.model.primary) */
  list?: Array<{ id: string; name?: string; default?: boolean; workspace?: string; agentDir?: string; model?: string; [k: string]: unknown }>
  defaults?: { model?: { primary?: string }; [k: string]: unknown }
  [key: string]: unknown
}

/** OpenClaw models: mode + providers */
export interface OpenClawModelsShape {
  mode?: string
  providers?: Record<string, {
    apiKey?: string
    baseUrl?: string
    api?: string
    models?: Array<{ id: string; name?: string }>
    [k: string]: unknown
  }>
  [key: string]: unknown
}

/** Session config (OpenClaw native session) */
export interface SessionConfig {
  dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer'
  reset?: {
    mode?: 'daily' | 'idle'
    atHour?: number
    idleMinutes?: number
  }
  threadBindings?: {
    enabled?: boolean
    idleHours?: number
    maxAgeHours?: number
  }
}

/** Heartbeat (merged from agents.defaults.heartbeat and agents.list[].heartbeat) */
export interface HeartbeatConfig {
  every?: string
  target?: 'last' | 'whatsapp' | 'telegram' | 'discord' | 'none' | string
  directPolicy?: 'allow' | 'block'
  lightContext?: boolean
  isolatedSession?: boolean
  activeHours?: { start?: string; end?: string; timezone?: string }
  to?: string
  accountId?: string
  prompt?: string
  model?: string
  [key: string]: unknown
}

/** Route bindings (OpenClaw) */
export interface BindingConfig {
  agentId: string
  match: {
    channel?: string
    accountId?: string
    peer?: {
      kind?: 'direct' | 'group' | 'channel'
      id?: string
    }
    guildId?: string
    teamId?: string
    roles?: string[]
  }
}

/** Tools config (OpenClaw) */
export interface ToolsConfig {
  allow?: string[]
  deny?: string[]
  elevated?: Record<string, any>
  agentToAgent?: {
    enabled?: boolean
    allow?: string[]
  }
  web?: Record<string, any>
  [key: string]: unknown
}

/** One internal hook entry (hooks.internal.entries[id]) */
export interface HooksInternalEntry {
  enabled?: boolean
  /** e.g. bootstrap-extra-files: glob paths relative to workspace */
  paths?: string[]
  env?: Record<string, string>
  [key: string]: unknown
}

/** Internal hooks (hooks.internal) */
export interface HooksInternalConfig {
  enabled?: boolean
  entries?: Record<string, HooksInternalEntry>
  load?: { extraDirs?: string[] }
  [key: string]: unknown
}

/** Hooks / webhooks (internal = internal event hooks; rest = webhooks) */
export interface HooksConfig {
  internal?: HooksInternalConfig
  enabled?: boolean
  token?: string
  path?: string
  defaultSessionKey?: string
  allowRequestSessionKey?: boolean
  allowedSessionKeyPrefixes?: string[]
  mappings?: Array<{
    match: { path?: string }
    action?: string
    agentId?: string
    deliver?: boolean
  }>
  [key: string]: unknown
}

/** Cron (OpenClaw) */
export interface CronConfig {
  enabled?: boolean
  maxConcurrentRuns?: number
  sessionRetention?: string
}

/** Per-agent tool allow/deny */
export interface AgentToolsConfig {
  allow?: string[]
  deny?: string[]
}

export interface OpenClawConfig {
  /** Channel instances keyed by channel instance id */
  channels: Record<string, ChannelInstanceConfig | Record<string, any>>
  messages: Record<string, any>
  skills: string[]
  /** OpenClaw agents (list + defaults) */
  agents?: OpenClawAgentsShape
  /** OpenClaw models (providers) */
  models?: OpenClawModelsShape
  /** Session */
  session?: SessionConfig
  /** Bindings */
  bindings?: BindingConfig[]
  /** Tools */
  tools?: ToolsConfig
  /** Env vars */
  env?: Record<string, any>
  /** Gateway (port, auth, reload, …); OpenClaw root key "gateway" */
  gateway?: Record<string, any>
  /** Web */
  web?: Record<string, any>
  /** Cron */
  cron?: CronConfig
  /** Hooks / webhooks */
  hooks?: HooksConfig
  /** Privacy */
  privacy?: Record<string, any>
  /** Browser (OpenClaw-managed / remote CDP); see OpenClaw browser docs */
  browser?: BrowserConfig
}

/** Named browser profile (openclaw-managed or existing-session / Chrome MCP) */
export interface BrowserProfileConfig {
  driver?: "existing-session"
  attachOnly?: boolean
  cdpPort?: number
  cdpUrl?: string
  userDataDir?: string
  color?: string
}

export interface BrowserConfig {
  enabled?: boolean
  defaultProfile?: string
  executablePath?: string
  headless?: boolean
  noSandbox?: boolean
  profiles?: Record<string, BrowserProfileConfig>
}

export interface SkillPackage {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  config: Record<string, any>
  author: string
  downloadUrl?: string
}

/** One skill with path (open folder) */
export interface SkillEntry {
  id: string
  path: string
}

/** One row from `openclaw skills list --json` (incl. bundled) */
export interface OpenClawSkillListItem {
  name: string
  description: string
  source: string
  bundled: boolean
  eligible: boolean
  disabled: boolean
  blockedByAllowlist: boolean
  homepage?: string | null
}

/** Per instance: workspace/managed dirs + full CLI skill list */
export interface SkillsForInstance {
  workspace: SkillEntry[]
  managed: SkillEntry[]
  enabled: string[]
  all: OpenClawSkillListItem[]
}

/** One hook config field (HOOK spec or backend) */
export interface ConfigFieldSchema {
  key: string
  label: string
  description?: string
  placeholder?: string
  /** e.g. "stringArray" = comma-separated, parsed to array on save */
  valueType?: 'string' | 'stringArray'
}

/** One hook from `openclaw hooks list --json`; backend fills configSchema */
export interface HookListEntry {
  name: string
  description?: string
  emoji?: string
  eligible?: boolean
  disabled?: boolean
  source?: string
  pluginId?: string | null
  events?: string[]
  homepage?: string | null
  missing?: Record<string, unknown>
  managedByPlugin?: boolean
  /** Config field schemas (labels from spec); generic render */
  configSchema?: ConfigFieldSchema[]
}

/** Result of list_hooks_for_instance */
export interface HooksListResult {
  workspaceDir?: string | null
  managedHooksDir?: string | null
  hooks: HookListEntry[]
}

/** Today spend (dashboard) */
export interface TodaySpendResult {
  todayUsd: number
  changeDayPct: number
  changeMomPct: number
  last7Days: number
}

/** Daily spend (analytics cost chart) */
export interface DailySpendEntry {
  date: string
  usd: number
}

/** Per-day per-agent tokens (multi-line chart) */
export interface TokenDailyEntry {
  date: string
  agents: Record<string, { input: number; output: number }>
}

/** Cron job (from Gateway cron/jobs.json) */
export interface CronJobWithNext {
  id: string
  name: string
  schedule: string
  enabled: boolean
  description?: string
  message?: string
  nextRunAt?: string
  agentId: string
  agentName: string
}

/** Token usage totals */
export interface TokenStatsResult {
  totalInput: number
  totalOutput: number
  agents: Record<string, { input: number; output: number }>
}

/** Session row from Gateway sessions.list */
export interface ChatSessionInfo {
  sessionKey: string
  /** Pond instance id when this list was fetched (not sessionKey) */
  instanceId: string
  messageCount: number
  lastPreview: string
}

/** Gateway session row (Pond, Feishu, Telegram, …) */
export interface GatewaySessionRow {
  sessionKey: string
  sessionId?: string
  label?: string
  channel?: string
  updatedAt?: number
}

/** Multi-agent activity from sessions.list (no subagent runs) */
export interface MultiAgentActivityRow {
  agentId: string
  /** idle | active */
  status: string
  lastUpdatedAtMs?: number
  sessionCount: number
}

/** Pond team task queue (not OpenClaw spawn) */
export interface TeamTask {
  id: string
  title: string
  status: string
  createdAtMs: number
  updatedAtMs: number
  claimedByAgentId?: string
  /** Set when status === failed (executor or coordinator) */
  failureReason?: string
}

/** Team member row (maps to agents.list id) */
export interface TeamMetaMember {
  agent_id: string
  name?: string  // Member name (synced from agents.list[].name); optional for backward compatibility
  role: string  // Role description (required)
}

/** Team metadata (multi-agent + leader; stored in app data) */
export interface TeamMeta {
  team_name?: string
  leader_agent_id?: string
  members: TeamMetaMember[]
}

/** Edit form omits leader_agent_id; leader resolved on save */
export type TeamMetaEditForm = Omit<TeamMeta, "leader_agent_id">

/** Tailscale peer */
export interface TailscalePeer {
  name: string
  tailscaleIp: string
}

/** Tailscale status snapshot */
export interface TailscaleStatus {
  online: boolean
  deviceName?: string
  tailnetIp?: string
  connectedPeers: TailscalePeer[]
}

/** System info from get_system_info */
export interface SystemInfo {
  cpu_usage_percent: number
  memory_total_mb: number
  memory_used_mb: number
}

/** One chart sample (i in 0..N-1) */
export interface ChartPoint {
  i: number
  value: number
}

export const SYSTEM_CHART_HISTORY_LEN = 30

// ============================================================================
// API key pool
// ============================================================================

/** One stored API key entry */
export interface ApiKeyConfig {
  key: string
  baseUrl?: string
  source?: string
  importedAt?: string
}

/** API key pool per instance file */
export interface ApiKeyPool {
  apiKeys: Record<string, ApiKeyConfig>
}

/** Discovered provider row for import UI */
export interface DiscoveredProvider {
  provider: string
  apiKey: string
  baseURL?: string
  model?: string
  source: string
  hasKey: boolean
  conflict?: boolean
}
