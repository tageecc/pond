export function clawteamInstanceIdsList(instanceIds: string[]): string[] {
  return instanceIds.length > 0 ? instanceIds : ["default"]
}

/** Current OpenClaw profile / instance id (same as sidebar switcher). */
export function resolveClawteamInstanceId(
  instanceIds: string[],
  selectedInstanceId: string | null,
): string | null {
  const agents = clawteamInstanceIdsList(instanceIds)
  return selectedInstanceId && agents.includes(selectedInstanceId)
    ? selectedInstanceId
    : (agents[0] ?? null)
}
