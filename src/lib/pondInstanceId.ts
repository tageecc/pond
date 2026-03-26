export function pondInstanceIdsList(
  instanceIds: string[],
): string[] {
  return instanceIds.length > 0 ? instanceIds : ["default"]
}

/** Current Pond instance id (same as sidebar switcher) */
export function resolvePondInstanceId(
  instanceIds: string[],
  selectedInstanceId: string | null,
): string | null {
  const agents = pondInstanceIdsList(instanceIds)
  return selectedInstanceId && agents.includes(selectedInstanceId)
    ? selectedInstanceId
    : (agents[0] ?? null)
}
