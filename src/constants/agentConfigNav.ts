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
}

export type AgentConfigNavGroup = {
  /** i18n key suffix: t(`navGroups.${groupKey}`) */
  groupKey: string
  items: AgentConfigNavItem[]
}

/** Team group: separate from OpenClaw config; multi-role and team collaboration */
export const TEAM_NAV_GROUP: AgentConfigNavGroup = {
  groupKey: "team",
  items: [{ id: "team_agents" }, { id: "team_space" }],
}

export const AGENT_CONFIG_NAV_GROUPS: AgentConfigNavGroup[] = [
  {
    groupKey: "run",
    items: [{ id: "model" }, { id: "channels" }],
  },
  {
    groupKey: "capabilities",
    items: [{ id: "skills" }, { id: "browser" }],
  },
  {
    groupKey: "sessionWs",
    items: [{ id: "session" }, { id: "workspace" }],
  },
  {
    groupKey: "automation",
    items: [{ id: "wakeup" }, { id: "hooks" }],
  },
  {
    groupKey: "system",
    items: [{ id: "logs" }, { id: "advanced" }],
  },
]
