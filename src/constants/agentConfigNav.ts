/** Agent settings sidebar: groups and section ids (flat, no nested tabs) */

export type TeamSpaceTabId = "overview" | "docs" | "tasks"

export type AgentConfigSectionId =
  | "model"
  | "channels"
  | "skills"
  | "session"
  | "team_agents"
  | "team_space"
  | "workspace"
  | "browser"
  | "wakeup"
  | "hooks"
  | "logs"
  | "advanced"

export type AgentConfigNavItem = {
  id: AgentConfigSectionId
  label: string
}

export type AgentConfigNavGroup = {
  group: string
  items: AgentConfigNavItem[]
}

/** Team group: separate from OpenClaw config; multi-role and Pond collaboration */
export const TEAM_NAV_GROUP: AgentConfigNavGroup = {
  group: "团队",
  items: [
    { id: "team_agents", label: "角色列表" },
    { id: "team_space", label: "团队空间" },
  ],
}

export const AGENT_CONFIG_NAV_GROUPS: AgentConfigNavGroup[] = [
  {
    group: "运行基础",
    items: [
      { id: "model", label: "模型配置" },
      { id: "channels", label: "渠道配置" },
    ],
  },
  {
    group: "能力与运行环境",
    items: [
      { id: "skills", label: "技能与工具" },
      { id: "browser", label: "浏览器" },
    ],
  },
  {
    group: "会话与工作区",
    items: [
      { id: "session", label: "会话管理" },
      { id: "workspace", label: "工作区文件" },
    ],
  },
  {
    group: "自动化与集成",
    items: [
      { id: "wakeup", label: "心跳与定时" },
      { id: "hooks", label: "Hooks" },
    ],
  },
  {
    group: "系统",
    items: [
      { id: "logs", label: "Gateway 日志" },
      { id: "advanced", label: "高级配置" },
    ],
  },
]
