import { useState, useEffect, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useAppStore } from "../stores/appStore"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Card, CardContent, CardFooter } from "./ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { ProviderIcon } from "@lobehub/icons"
import { Bot, Save, Loader2, TestTube, Plus, Trash2, Star, ChevronDown, ExternalLink } from "lucide-react"
import { cn } from "../lib/utils"
import type { OpenClawConfig, LLMModelConfig } from "../types"
import { agentsModelsToFlatView, flatViewToAgentsModels } from "../lib/openclawAgentsModels"
import { resolvePondInstanceId } from "../lib/pondInstanceId"

/** App provider id → Lobe Icons provider id (some entries are aliased) */
const PROVIDER_ICON_ID: Record<string, string> = {
  volcengine: "doubao",
  bailian: "qwen", // Bailian uses Qwen icon
}

/** Providers supported by LobeHub Icons */
const LOBE_SUPPORTED_PROVIDERS = [
  "anthropic",
  "openai", 
  "google",
  "deepseek",
  "openrouter",
  "xai",
  "mistral",
  "groq",
  "together",
  "cerebras",
  "qwen",
  "moonshot",
  "zhipu",
  "minimax",
  "volcengine",
  "doubao",
  "huggingface",
  "nvidia",
  "bedrock",
  "azure",
  "ollama",
]

function ModelCardIcon({ providerId, size = 40 }: { providerId?: string; size?: number }) {
  if (!providerId || providerId === "custom") {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-app-elevated text-2xl">
        <Bot className="h-6 w-6 text-app-muted" />
      </span>
    )
  }
  const lobeId = PROVIDER_ICON_ID[providerId] ?? providerId
  
  // Only use ProviderIcon when Lobe supports this id
  if (!LOBE_SUPPORTED_PROVIDERS.includes(lobeId)) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-app-elevated">
        <Bot className="h-6 w-6 text-app-muted" />
      </span>
    )
  }
  
  try {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-app-elevated">
        <ProviderIcon provider={lobeId as any} size={size} type="color" />
      </span>
    )
  } catch {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-app-elevated">
        <Bot className="h-6 w-6 text-app-muted" />
      </span>
    )
  }
}

import { PROVIDERS, getProvider } from "../constants/providers"
import { ModelIdField } from "./ModelIdField"

const OPENCLAW_PROVIDERS_DOC = "https://docs.openclaw.ai/zh-CN/concepts/model-providers"

function isModelConfigured(m: LLMModelConfig | Record<string, unknown>): boolean {
  if (!m || typeof m !== "object") return false
  const key = (m.apiKey as string) ?? ""
  if (key.trim()) return true
  return false
}

function getModelDisplayName(m: LLMModelConfig | Record<string, unknown>, _modelId: string): string {
  const name = (m as LLMModelConfig).name
  if (name && String(name).trim()) return String(name).trim()
  const provider = (m as LLMModelConfig).provider
  const providerName = PROVIDERS.find((p) => p.id === provider)?.name ?? provider ?? "未设置"
  const model = (m as LLMModelConfig).model
  if (model && String(model).trim()) return `${providerName} · ${model}`
  return providerName
}

export function AIConfig() {
  const { openclawConfig, loadConfigs, saveOpenClawConfig } = useAppStore()
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId)
  const instanceIds = useAppStore((s) => s.instanceIds)
  const pondInstanceId = resolvePondInstanceId(
    instanceIds,
    selectedInstanceId,
    openclawConfig,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [provider, setProvider] = useState("openai")
  const [apiKey, setApiKey] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [model, setModel] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  if (openclawConfig === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="w-full max-w-md bg-app-surface">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-app-muted">加载配置中…</p>
            <Button
              variant="outline"
              className="mt-4 border-app-border text-app-muted hover:bg-app-hover"
              onClick={() => loadConfigs()}
            >
              重试
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const view = useMemo(() => agentsModelsToFlatView(openclawConfig), [openclawConfig])
  const models = view.models
  const modelOrder = view.modelInstanceOrder
  const defaultModelId = view.defaultModelId
  const agentModel = view.agentModel

  const modelList = modelOrder
    .map((id) => ({ id, raw: models[id] }))
    .filter(({ raw }) => raw != null && typeof raw === "object")

  const loadForm = (id: string) => {
    const m = models[id] as LLMModelConfig | undefined
    if (!m) return
    const prov = (m.provider ?? "openai") as string
    setProvider(prov)
    setApiKey((m.apiKey ?? "") as string)
    // Load base URL into form only for custom provider
    setBaseURL(prov === "custom" ? ((m.baseURL ?? "") as string) : "")
    setModel((m.model ?? "") as string)
  }

  const openKeyUrl = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = getProvider(provider)?.keyUrl ?? OPENCLAW_PROVIDERS_DOC
    import("@tauri-apps/plugin-shell")
      .then(({ open }) => open(url))
      .catch(() => window.open(url, "_blank"))
  }

  useEffect(() => {
    if (selectedId && models[selectedId]) loadForm(selectedId)
  }, [selectedId, openclawConfig])

  const handleAddModel = async (providerId: string) => {
    const id = crypto.randomUUID()
    const baseOrder = modelOrder.filter((oid) => models[oid]?.provider)
    const newOrder = [...baseOrder, id]
    const newModels = { ...models, [id]: { provider: providerId } as LLMModelConfig }
    const nextDefault = models[defaultModelId]?.provider ? defaultModelId : id
    const nextView = { ...view, modelInstanceOrder: newOrder, models: newModels, defaultModelId: nextDefault }
    const { agents: nextAgents, models: nextModels } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModels } as OpenClawConfig, pondInstanceId)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      return
    }
    setSaveError(null)
    // After save, flat view keys by provider id, not UUID
    setSelectedId(providerId)
  }

  const handleSave = async () => {
    if (!openclawConfig || !selectedId) return
    if (!model.trim()) {
      setSaveError("请填写模型 ID")
      return
    }
    if (provider === "custom" && !baseURL.trim()) {
      setSaveError("自定义模型必须填写 Base URL")
      return
    }
    const keyVal = apiKey.trim()
    if (keyVal && (keyVal.length > 500 || /[^\x20-\x7E]/.test(keyVal))) {
      setSaveError("API Key 格式不正确：请粘贴厂商提供的 Key（纯英文字符），不要粘贴其他内容")
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaveMsg(null)
    // Custom: user base URL; built-ins: default from PROVIDERS
    const effectiveBaseURL =
      provider === "custom"
        ? (baseURL.trim() || undefined)
        : (getProvider(provider)?.baseURL || undefined)
    const { name: _n, ...rest } = (models[selectedId] as Record<string, unknown>) ?? {}
    const nextModels = {
      ...models,
      [selectedId]: {
        ...rest,
        provider,
        apiKey: apiKey.trim() || undefined,
        baseURL: effectiveBaseURL,
        model: model.trim() || undefined,
      },
    }
    const nextView = { ...view, models: nextModels }
    const { agents: nextAgents, models: nextModelsShape } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModelsShape } as OpenClawConfig, pondInstanceId)
      setSaveMsg("已保存")
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefault = async () => {
    if (!selectedId || !openclawConfig) return
    const nextView = { ...view, defaultModelId: selectedId }
    const { agents: nextAgents, models: nextModels } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModels } as OpenClawConfig, pondInstanceId)
      setSaveMsg("已设为默认模型")
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDeleteModel = async (idToDelete: string) => {
    if (!idToDelete || !openclawConfig) return
    const nextOrder = modelOrder.filter((id) => id !== idToDelete)
    const { [idToDelete]: _, ...nextModels } = models
    const nextDefault = defaultModelId === idToDelete ? nextOrder[0] : defaultModelId
    const nextAgentModel = { ...agentModel }
    for (const k of Object.keys(nextAgentModel)) {
      if (nextAgentModel[k] === idToDelete) nextAgentModel[k] = nextDefault ?? ""
    }
    const nextView = { ...view, modelInstanceOrder: nextOrder, models: nextModels, defaultModelId: nextDefault ?? "", agentModel: nextAgentModel }
    const { agents: nextAgents, models: nextModelsShape } = flatViewToAgentsModels(nextView, openclawConfig?.agents, openclawConfig?.models)
    try {
      await saveOpenClawConfig({ ...openclawConfig, agents: nextAgents, models: nextModelsShape } as OpenClawConfig, pondInstanceId)
      setSelectedId(nextOrder[0] ?? null)
      setSaveError(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestMsg("请先填写 API Key 再测试")
      return
    }
    if (provider === "custom" && !baseURL.trim()) {
      setTestMsg("自定义模型必须填写 Base URL")
      return
    }
    setTesting(true)
    setTestMsg(null)
    try {
      // Custom: user base URL; built-ins: default from PROVIDERS
      const effectiveBaseURL =
        provider === "custom"
          ? (baseURL.trim() || undefined)
          : (getProvider(provider)?.baseURL || undefined)
      const config = {
        apiKey: apiKey.trim(),
        baseURL: effectiveBaseURL || "https://api.openai.com/v1",
        model: model.trim() || "gpt-3.5-turbo",
      }
      const msg = await invoke<string>("test_ai_connection", { llmConfig: config })
      setTestMsg(msg)
      setTimeout(() => setTestMsg(null), 4000)
    } catch (e) {
      setTestMsg(String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10">
        <header className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-app-text">模型配置</h1>
            <p className="text-sm text-app-muted">添加模型并填写 API Key，未分配模型的 Agent 将使用默认模型</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="shrink-0 gap-2 bg-claw-500 hover:bg-claw-600 text-white shadow-sm rounded-xl pl-4 pr-3"
              >
                <Plus className="h-4 w-4" />
                添加模型
                <ChevronDown className="h-4 w-4 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel className="text-xs font-medium text-app-muted">选择提供商</DropdownMenuLabel>
              {PROVIDERS.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => {
                    setSaveError(null)
                    handleAddModel(p.id)
                  }}
                  className="cursor-pointer rounded-lg"
                >
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {modelList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-app-border bg-app-surface/40 py-24 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-claw-500/10">
              <Bot className="h-10 w-10 text-claw-400" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-app-text">暂无模型</p>
              <p className="text-sm text-app-muted">添加后填写 API Key 即可使用</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2 bg-claw-500 hover:bg-claw-600 text-white rounded-xl">
                  <Plus className="h-4 w-4" />
                  添加第一个模型
                  <ChevronDown className="h-4 w-4 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56 rounded-xl">
                <DropdownMenuLabel className="text-xs font-medium text-app-muted">选择提供商</DropdownMenuLabel>
                {PROVIDERS.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onSelect={() => {
                      setSaveError(null)
                      handleAddModel(p.id)
                    }}
                    className="cursor-pointer rounded-lg"
                  >
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="space-y-2">
            {modelList.map(({ id, raw }) => {
              const configured = isModelConfigured(raw)
              const selected = selectedId === id
              const isDefault = defaultModelId === id
              const displayName = getModelDisplayName(raw, id)
              return (
                <div
                  key={id}
                  className={cn(
                    "overflow-hidden rounded-2xl border transition-all duration-200",
                    selected
                      ? "border-claw-500/50 bg-app-surface shadow-lg shadow-claw-500/5"
                      : "border-app-border bg-app-surface hover:border-app-hover hover:bg-app-elevated"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(selected ? null : id)
                      setSaveError(null)
                      if (!selected) loadForm(id)
                    }}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-app-hover/30"
                  >
                    <ModelCardIcon providerId={(raw as LLMModelConfig).provider as string} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-app-text">{displayName}</p>
                        {isDefault && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-claw-500/15 px-2 py-0.5 text-xs text-claw-400">
                            <Star className="h-3 w-3 fill-current" />
                            默认
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                        <span className="rounded-full border border-app-border bg-app-elevated/80 px-2 py-0.5 text-app-muted">
                          {getProvider((raw as LLMModelConfig).provider as string)?.name ?? (raw as LLMModelConfig).provider ?? "—"}
                        </span>
                        <span className={configured ? "text-emerald-500/90" : "text-amber-500/90"}>
                          {configured ? "已配置" : "未配置 Key"}
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-5 w-5 shrink-0 text-app-muted transition-transform duration-200",
                        selected ? "rotate-180 text-claw-400" : ""
                      )}
                    />
                  </button>
                  {selected && (
                    <div className="animate-fade-in border-t border-app-border bg-app-elevated/20">
                      <div className="flex flex-col gap-4 p-5">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-medium text-app-muted">API Key</Label>
                            <button
                              type="button"
                              onClick={openKeyUrl}
                              className="inline-flex items-center gap-1 text-xs text-claw-400 hover:text-claw-300 hover:underline"
                            >
                              获取 Key
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </div>
                          <Input
                            type="password"
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="h-10 rounded-xl border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                          />
                        </div>
                        {provider === "custom" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-app-muted">Base URL</Label>
                            <Input
                              placeholder="https://api.openai.com/v1"
                              value={baseURL}
                              onChange={(e) => setBaseURL(e.target.value)}
                              className="h-10 rounded-xl border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                            />
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-app-muted">模型 ID</Label>
                          <ModelIdField provider={provider} value={model} onChange={setModel} disabled={saving} />
                        </div>
                        {saveError && (
                          <p className="text-sm text-red-400">{saveError}</p>
                        )}
                        <CardFooter className="flex flex-col gap-3 border-t border-app-border p-4 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleSave}
                              disabled={saving || !model.trim()}
                              className="order-1 bg-claw-500 hover:bg-claw-600 text-white shadow-sm"
                            >
                              {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              {saving ? "保存中…" : "保存"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="order-2 border-app-border text-app-muted hover:bg-app-hover hover:text-app-text"
                              onClick={handleTest}
                              disabled={testing}
                            >
                              {testing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <TestTube className="h-4 w-4" />
                              )}
                              测试连接
                            </Button>
                            {(saveMsg || testMsg) && (
                              <span className="order-3 text-sm text-app-muted" role="status">
                                {saveMsg || testMsg}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 border-t border-app-border pt-3 sm:border-t-0 sm:pt-0">
                            {defaultModelId !== id && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-app-muted hover:bg-claw-500/10 hover:text-claw-400"
                                onClick={handleSetDefault}
                              >
                                <Star className="mr-1.5 h-3.5 w-3.5" />
                                设为默认
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                  删除
                                </Button>
                              </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确定删除该模型？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  删除后，使用此模型的 Agent 将改为使用默认模型。此操作不可撤销。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                                  取消
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteModel(id)
                                  }}
                                >
                                  确定删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          </div>
                        </CardFooter>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
