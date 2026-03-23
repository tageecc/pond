/**
 * OpenClaw agents.list: validation and ordering for team CRUD.
 * Primary role id is `main`; keep that entry first.
 */
export const OPENCLAW_AGENT_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/

export function isValidOpenClawAgentId(id: string): boolean {
  const t = id.trim()
  return t.length > 0 && OPENCLAW_AGENT_ID_RE.test(t)
}

export function normalizeAgentsListOrder<T extends { id: string }>(list: T[]): T[] {
  if (list.length === 0) return list
  const di = list.findIndex((x) => x.id === "main")
  if (di <= 0) return list
  const copy = [...list]
  const [item] = copy.splice(di, 1)
  return [item, ...copy]
}
