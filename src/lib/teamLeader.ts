/**
 * Team Leader is the `agents.list` entry with id `main`; no Leader if missing.
 */
export const TEAM_LEADER_AGENT_ID = "main" as const

export function resolveTeamLeaderAgentId(
  agentsList: { id: string }[],
): typeof TEAM_LEADER_AGENT_ID | undefined {
  return agentsList.some((a) => a.id === TEAM_LEADER_AGENT_ID) ? TEAM_LEADER_AGENT_ID : undefined
}
