import type { OpenClawConfig } from "../types"
import { getAgentIds } from "./openclawAgentsModels"

export function pondInstanceIdsList(
  instanceIds: string[],
  openclawConfig: OpenClawConfig | null,
): string[] {
  const agentIds = getAgentIds(openclawConfig)
  return instanceIds.length > 0 ? instanceIds : agentIds.length > 0 ? agentIds : ["default"]
}

/** Current Pond instance id (same as sidebar switcher) */
export function resolvePondInstanceId(
  instanceIds: string[],
  selectedInstanceId: string | null,
  openclawConfig: OpenClawConfig | null,
): string | null {
  const agents = pondInstanceIdsList(instanceIds, openclawConfig)
  return selectedInstanceId && agents.includes(selectedInstanceId)
    ? selectedInstanceId
    : (agents[0] ?? null)
}
