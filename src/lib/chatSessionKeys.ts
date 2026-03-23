import type { SessionConfig } from "../types"

/**
 * Chat store key combines Pond instance id (Gateway / openclaw path) with agents.list[].id.
 */
export function normalizePondProfileId(id: string | null | undefined): string {
  const t = id?.trim()
  if (!t || t === "default") return "default"
  return t
}

/** agents.list role id; empty → `main` (OpenClaw primary) */
export function normalizeChatRoleId(id: string | null | undefined): string {
  const t = id?.trim()
  return t && t.length > 0 ? t : "main"
}

/** Zustand chatByInstance key: `<pondInstanceId>::<agents.list id>` */
export function chatSessionStoreKey(pondInstanceId: string, roleAgentId: string): string {
  return `${normalizePondProfileId(pondInstanceId)}::${normalizeChatRoleId(roleAgentId)}`
}

export function resolveChatStoreKey(storeKey: string): string {
  const k = storeKey.trim()
  if (!k) throw new Error("chat store key 不能为空")
  return k
}

/** Session key shape: `agent:<agents.list id>:<channel suffix>` */
export function sessionKeyBelongsToOpenClawRole(
  sessionKey: string,
  roleAgentId: string,
): boolean {
  const parts = sessionKey.split(":")
  const role = normalizeChatRoleId(roleAgentId)
  return parts.length >= 3 && parts[0] === "agent" && parts[1] === role
}

/** Unified DM continuity: `dmScope=main` and `reset.mode=off` */
export function isUnifiedDmContinuity(session: unknown): boolean {
  if (typeof session !== "object" || session === null) return false
  const s = session as SessionConfig
  return (s.dmScope ?? "main") === "main" && s.reset?.mode === "off"
}
