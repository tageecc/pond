/** Model providers (OpenClaw docs); built-ins get baseURL; user supplies API key */
export const PROVIDERS: {
  id: string
  name: string
  baseURL?: string
  keyUrl?: string
  modelHint?: string
}[] = [
  { id: "anthropic", name: "Anthropic (Claude)", baseURL: "https://api.anthropic.com", keyUrl: "https://console.anthropic.com/settings/keys", modelHint: "claude-sonnet-4-5" },
  { id: "openai", name: "OpenAI (GPT)", baseURL: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys", modelHint: "gpt-4o" },
  { id: "google", name: "Google (Gemini)", baseURL: "https://generativelanguage.googleapis.com/v1beta", keyUrl: "https://aistudio.google.com/apikey", modelHint: "gemini-2.5-pro" },
  { id: "deepseek", name: "DeepSeek", baseURL: "https://api.deepseek.com", keyUrl: "https://platform.deepseek.com/api_keys", modelHint: "deepseek-chat" },
  { id: "openrouter", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys" },
  { id: "xai", name: "xAI (Grok)", baseURL: "https://api.x.ai/v1", keyUrl: "https://console.x.ai/", modelHint: "grok-3" },
  { id: "mistral", name: "Mistral", baseURL: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys/", modelHint: "mistral-large-latest" },
  { id: "groq", name: "Groq", baseURL: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys", modelHint: "llama-3.3-70b-versatile" },
  { id: "together", name: "Together AI", baseURL: "https://api.together.xyz/v1", keyUrl: "https://api.together.ai/settings/api-keys" },
  { id: "cerebras", name: "Cerebras", baseURL: "https://api.cerebras.ai/v1", keyUrl: "https://cloud.cerebras.ai/account/api-keys" },
  { id: "bailian", name: "阿里云百炼", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", keyUrl: "https://bailian.console.aliyun.com/", modelHint: "qwen3.5-plus" },
  { id: "moonshot", name: "Moonshot (Kimi)", baseURL: "https://api.moonshot.ai/v1", keyUrl: "https://platform.moonshot.cn/console/api-keys", modelHint: "moonshot-v1-128k" },
  { id: "zhipu", name: "智谱 (GLM)", baseURL: "https://open.bigmodel.cn/api/paas/v4", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", modelHint: "glm-4-plus" },
  { id: "minimax", name: "MiniMax", baseURL: "https://api.minimax.chat/v1", keyUrl: "https://platform.minimax.ai/app/key", modelHint: "MiniMax-Text-01" },
  { id: "volcengine", name: "火山引擎 (豆包)", baseURL: "https://open.volcengineapi.com", keyUrl: "https://console.volcengine.com/iam/keymanage/" },
  { id: "huggingface", name: "Hugging Face", baseURL: "https://api-inference.huggingface.co", keyUrl: "https://huggingface.co/settings/tokens" },
  { id: "nvidia", name: "NVIDIA", baseURL: "https://integrate.api.nvidia.com/v1", keyUrl: "https://build.nvidia.com/", modelHint: "meta/llama-3.1-405b-instruct" },
  { id: "bedrock", name: "Amazon Bedrock", keyUrl: "https://console.aws.amazon.com/bedrock/" },
  { id: "azure", name: "Azure OpenAI", keyUrl: "https://portal.azure.com/#view/Microsoft_Azure_AI/ProjectBrowseBlade" },
  { id: "ollama", name: "Ollama (本地)", baseURL: "http://127.0.0.1:11434/v1", modelHint: "llama3.2" },
  { id: "vllm", name: "vLLM (本地)", baseURL: "http://127.0.0.1:8000/v1" },
  { id: "opencode", name: "OpenCode Zen", baseURL: "https://api.opencode.zen.anthropic.com", keyUrl: "https://opencode.zen.anthropic.com/" },
  { id: "vercel-ai-gateway", name: "Vercel AI Gateway", baseURL: "https://gateway.ai.vercel.app/v1", keyUrl: "https://vercel.com/docs/ai" },
  { id: "custom", name: "自定义 (OpenAI 兼容)" },
]

const OPENAI = PROVIDERS.find((p) => p.id === "openai")!

export function getProvider(providerId: string) {
  return PROVIDERS.find((p) => p.id === providerId)
}

/** When model id empty: use provider modelHint; unknown providers fall back to OpenAI */
export function defaultModelHint(providerId: string): string {
  return getProvider(providerId)?.modelHint ?? OPENAI.modelHint!
}

/** Placeholder for agents.defaults.model.primary when no model configured */
export function defaultPrimaryRef(): string {
  return `openai/${OPENAI.modelHint!}`
}
