import type { LLMModelConfig } from "../types"
import { defaultModelHint, defaultPrimaryRef } from "../constants/providers"

/**
 * OpenClaw: agents.list[].model is `provider/modelId` (same shape as defaults.model.primary).
 * See https://docs.openclaw.ai/concepts/multi-agent
 */

/** Strip duplicate `provider/` prefix from model id vs primary right-hand segment. */
export function openclawApiModelSegment(
  model: string | undefined,
  provider: string,
  hint: string
): string {
  const raw = (model ?? "").trim() || hint
  const prefix = `${provider}/`
  if (raw.length > prefix.length && raw.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
    return raw.slice(prefix.length).trim() || hint
  }
  return raw
}

/** Flat model instance id → canonical `provider/modelId` for openclaw.json */
export function flatModelInstanceToPrimaryRef(
  instanceId: string,
  models: Record<string, LLMModelConfig>
): string {
  const m = models[instanceId]
  if (!m?.provider) {
    const t = instanceId.trim()
    if (t.includes("/") && t.split("/").filter(Boolean).length >= 2) return t
    return t.length > 0 ? t : defaultPrimaryRef()
  }
  const hint = defaultModelHint(m.provider)
  const modelName = openclawApiModelSegment(m.model, m.provider, hint)
  return `${m.provider}/${modelName}`
}

/**
 * Normalize agents.list[].model to OpenClaw persist form.
 * - Already `provider/modelId` → keep
 * - Flat instance id present in models → convert
 * - Else → fallback instance; then defaultsPrimary or defaultPrimaryRef()
 */
export function normalizeAgentListModelForPersist(
  rawModel: string | undefined,
  models: Record<string, LLMModelConfig>,
  fallbackInstanceId: string,
  /** agents.defaults.model.primary when no flat model table */
  defaultsPrimary?: string | undefined
): string {
  const safePrimary = (s: string | undefined) =>
    s && s.includes("/") && s.split("/").filter(Boolean).length >= 2 ? s : undefined

  const fallback = () =>
    safePrimary(flatModelInstanceToPrimaryRef(fallbackInstanceId, models)) ??
    safePrimary(defaultsPrimary) ??
    defaultPrimaryRef()

  const t = rawModel?.trim()
  if (!t) return fallback()
  if (t.includes("/")) return t
  if (models[t]) return flatModelInstanceToPrimaryRef(t, models)
  const byProv = Object.keys(models).find((id) => models[id]?.provider === t)
  if (byProv) return flatModelInstanceToPrimaryRef(byProv, models)
  return fallback()
}

/** Canonical model ref → flat model instance id (dropdowns / agentModel map) */
export function primaryRefToFlatModelInstanceId(
  agentModel: string | undefined,
  modelInstanceOrder: string[],
  models: Record<string, LLMModelConfig>,
  fallbackInstanceId: string
): string {
  if (!agentModel?.trim()) return fallbackInstanceId
  const raw = agentModel.trim()
  if (models[raw]) return raw
  if (!raw.includes("/")) {
    const byProv = modelInstanceOrder.find((id) => models[id]?.provider === raw)
    return byProv ?? fallbackInstanceId
  }
  const slash = raw.indexOf("/")
  const prov = raw.slice(0, slash)
  const rest = raw.slice(slash + 1).trim() || defaultModelHint(prov)
  const modelId = openclawApiModelSegment(rest, prov, defaultModelHint(prov))
  const exact = modelInstanceOrder.find((id) => {
    const mm = models[id]
    if (!mm?.provider || mm.provider !== prov) return false
    const mid = openclawApiModelSegment(mm.model, mm.provider, defaultModelHint(mm.provider))
    return mid === modelId
  })
  if (exact) return exact
  return modelInstanceOrder.find((id) => models[id]?.provider === prov) ?? fallbackInstanceId
}
