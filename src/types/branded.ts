/**
 * Branded types to prevent mixing Instance IDs and Agent IDs in TypeScript
 * 
 * TypeScript's structural typing allows any string to be passed where another
 * string is expected. Branded types add a phantom type tag to create distinct
 * types that cannot be mixed at compile time.
 * 
 * @example
 * ```typescript
 * const instanceId: InstanceId = "default" as InstanceId
 * const agentId: AgentId = "main" as AgentId
 * 
 * function doSomething(id: InstanceId) { ... }
 * 
 * doSomething(instanceId) // ✅ OK
 * doSomething(agentId)    // ❌ Type error!
 * ```
 */

declare const instanceIdBrand: unique symbol
declare const agentIdBrand: unique symbol

/**
 * OpenClaw / ClawTeam instance ID (e.g., "default", "abc123")
 * Maps to directory: ~/.openclaw/ or ~/.openclaw-{id}/
 */
export type InstanceId = string & { [instanceIdBrand]: never }

/**
 * OpenClaw agent/role ID (e.g., "main", "researcher")
 * Defined in agents.list[].id within an instance's config
 */
export type AgentId = string & { [agentIdBrand]: never }

/**
 * Type guard to check if a string is a valid instance ID format
 */
export function isInstanceId(value: string): value is InstanceId {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Type guard to check if a string is a valid agent ID format
 */
export function isAgentId(value: string): value is AgentId {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Safely cast a string to InstanceId (use with caution)
 */
export function toInstanceId(value: string): InstanceId {
  if (!isInstanceId(value)) {
    throw new Error(`Invalid instance ID: "${value}"`)
  }
  return value as InstanceId
}

/**
 * Safely cast a string to AgentId (use with caution)
 */
export function toAgentId(value: string): AgentId {
  if (!isAgentId(value)) {
    throw new Error(`Invalid agent ID: "${value}"`)
  }
  return value as AgentId
}

/**
 * Get default instance ID
 */
export function defaultInstanceId(): InstanceId {
  return "default" as InstanceId
}
