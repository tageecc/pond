import type { SessionConfig } from "../types"

/**
 * Chat store key combines instance id (Gateway / openclaw profile) with agents.list[].id.
 */
export function normalizeInstanceProfileId(id: string | null | undefined): string {
  const t = id?.trim()
  if (!t || t === "default") return "default"
  return t
}

/** agents.list role id; empty → `main` (OpenClaw primary) */
export function normalizeChatRoleId(id: string | null | undefined): string {
  const t = id?.trim()
  return t && t.length > 0 ? t : "main"
}

/** Zustand chatByInstance key: `<instanceId>::<agents.list id>` */
export function chatSessionStoreKey(instanceId: string, roleAgentId: string): string {
  return `${normalizeInstanceProfileId(instanceId)}::${normalizeChatRoleId(roleAgentId)}`
}

export function resolveChatStoreKey(storeKey: string): string {
  const k = storeKey.trim()
  if (!k) throw new Error("chat store key cannot be empty")
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

/**
 * OpenClaw schema often only allows `reset.mode` daily|idle (not `off`).
 * We treat an extreme idle window as "effectively no rotation".
 */
export const SESSION_RESET_LONG_IDLE_MINUTES = 10 * 365 * 24 * 60

/** Unified DM continuity: `dmScope=main` + long-idle reset (see SESSION_RESET_LONG_IDLE_MINUTES) */
export function isUnifiedDmContinuity(session: unknown): boolean {
  if (typeof session !== "object" || session === null) return false
  const s = session as SessionConfig
  const idle = s.reset?.idleMinutes ?? 0
  return (
    (s.dmScope ?? "main") === "main" &&
    s.reset?.mode === "idle" &&
    idle >= SESSION_RESET_LONG_IDLE_MINUTES
  )
}
