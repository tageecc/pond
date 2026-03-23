import type {
  OpenClawConfig,
  OpenClawAgentsShape,
  OpenClawModelsShape,
  LLMModelConfig,
} from "../types"
import { defaultModelHint, defaultPrimaryRef } from "../constants/providers"
import { openclawApiModelSegment, primaryRefToFlatModelInstanceId } from "./openclawAgentModelRef"

/** Flat model view for UI; derived from agents/models, written back on save */
export interface FlatModelView {
  defaultModelId: string
  modelInstanceOrder: string[]
  models: Record<string, LLMModelConfig>
  agentModel: Record<string, string>
}

/** Default model primary from config (`provider/modelId`) */
export function getDefaultPrimary(config: OpenClawConfig | null | undefined): string | undefined {
  return config?.agents?.defaults?.model?.primary
}

/** Agent ids from agents.list */
export function getAgentIds(config: OpenClawConfig | null | undefined): string[] {
  const list = config?.agents?.list
  if (!Array.isArray(list)) return []
  return list.map((e) => (e?.id != null ? String(e.id) : "")).filter(Boolean)
}

/** models.providers from config */
export function getProviders(config: OpenClawConfig | null | undefined): OpenClawModelsShape["providers"] {
  return config?.models?.providers ?? {}
}

/** True if primary set and that provider has apiKey */
export function hasConfiguredModel(config: OpenClawConfig | null | undefined): boolean {
  const primary = getDefaultPrimary(config)
  if (!primary) return false
  const [provider] = primary.split("/")
  const prov = config?.models?.providers?.[provider]
  const key = prov?.apiKey
  return typeof key === "string" && key.trim().length > 0
}

/** Build agents slice with single list entry; keep defaults */
export function buildAgentsForInstance(
  agents: OpenClawAgentsShape | undefined,
  instanceId: string
): OpenClawAgentsShape {
  const defaults = agents?.defaults ?? { model: { primary: defaultPrimaryRef() } }
  const list = agents?.list
  const entry = Array.isArray(list)
    ? list.find((e) => e?.id === instanceId)
    : undefined
  const single = entry ?? { id: instanceId, default: true }
  return { list: [single], defaults }
}

/** Derive flat model view from agents + models (display/forms only) */
export function agentsModelsToFlatView(config: OpenClawConfig | null | undefined): FlatModelView {
  const providers = getProviders(config)
  const primary = getDefaultPrimary(config)
  const order = Object.keys(providers ?? {})
  const defaultProvider = primary ? primary.split("/")[0] : order[0]
  const models: Record<string, LLMModelConfig> = {}
  for (const [provId, p] of Object.entries(providers ?? {})) {
    const modelId = p?.models?.[0]?.id ?? defaultModelHint(provId)
    models[provId] = {
      provider: provId,
      apiKey: p?.apiKey,
      baseURL: p?.baseUrl,
      model: modelId,
    }
  }
  const modelInstanceOrder = order.length ? order : []
  const agentModel: Record<string, string> = {}
  const list = config?.agents?.list
  const fallbackInst = defaultProvider ?? modelInstanceOrder[0] ?? "openai"
  if (Array.isArray(list)) {
    for (const e of list) {
      if (e?.id && e.model != null && String(e.model).trim() !== "") {
        agentModel[e.id] = primaryRefToFlatModelInstanceId(
          String(e.model),
          modelInstanceOrder,
          models,
          fallbackInst
        )
      }
    }
  }
  return {
    defaultModelId: defaultProvider ?? "",
    modelInstanceOrder,
    models: Object.keys(models).length ? models : {},
    agentModel,
  }
}

/** Persist flat view → agents + models (on save; same provider picks default or first) */
export function flatViewToAgentsModels(
  view: FlatModelView,
  existingAgents?: OpenClawAgentsShape,
  existingModels?: OpenClawModelsShape
): { agents: OpenClawAgentsShape; models: OpenClawModelsShape } {
  const defaultId = view.defaultModelId
  const providers: NonNullable<OpenClawModelsShape["providers"]> = {}
  for (const id of view.modelInstanceOrder) {
    const m = view.models[id]
    if (!m?.provider) continue
    const prov = m.provider
    if (!providers[prov] || id === defaultId) {
      const hint = defaultModelHint(m.provider)
      const apiId = openclawApiModelSegment(m.model, prov, hint)
      providers[prov] = {
        apiKey: m.apiKey,
        baseUrl: m.baseURL,
        api: "openai-completions",
        models: [{ id: apiId, name: apiId }],
      }
    }
  }

  let primaryStr = defaultPrimaryRef()
  if (Object.keys(providers).length > 0) {
    const resolvedId = view.models[defaultId]?.provider
      ? defaultId
      : view.modelInstanceOrder.find((i) => view.models[i]?.provider)
    const entry = resolvedId ? view.models[resolvedId] : undefined
    if (entry?.provider) {
      const pid = entry.provider
      const mid = openclawApiModelSegment(entry.model, pid, defaultModelHint(pid))
      primaryStr = `${pid}/${mid}`
    }
  }

  const agents: OpenClawAgentsShape = {
    list: existingAgents?.list ?? [{ id: "main", default: true }],
    defaults: { model: { primary: primaryStr } },
  }
  const models: OpenClawModelsShape = {
    mode: existingModels?.mode ?? "merge",
    providers,
  }
  return { agents, models }
}

/** Build agents + models from one provider (onboarding, etc.) */
export function buildAgentsAndModelsFromProvider(
  providerId: string,
  apiKey: string,
  baseURL: string | undefined,
  modelId: string
): { agents: OpenClawAgentsShape; models: OpenClawModelsShape } {
  const primary = `${providerId}/${modelId}`
  const agents: OpenClawAgentsShape = {
    list: [{ id: "main", default: true }],
    defaults: { model: { primary } },
  }
  const models: OpenClawModelsShape = {
    mode: "merge",
    providers: {
      [providerId]: {
        apiKey: apiKey.trim(),
        baseUrl: baseURL?.trim() || undefined,
        api: "openai-completions",
        models: [{ id: modelId, name: modelId }],
      },
    },
  }
  return { agents, models }
}
