/**
 * Curated AI model catalog: context window, max tokens, pricing hints.
 * Last updated: 2026-03-09
 */

export interface ModelInfo {
  id: string
  name: string
  provider: string
  contextWindow: number
  maxTokens: number
  cost: {
    input: number // USD per 1M input tokens
    output: number
    cacheRead?: number
    cacheWrite?: number
  }
  reasoning?: boolean
  input?: string[]
  deprecated?: boolean
  description?: string
}

export const MODELS_DATABASE: ModelInfo[] = [
  // ===== OpenAI =====
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    contextWindow: 1050000,
    maxTokens: 128000,
    cost: { input: 2.5, output: 15.0, cacheRead: 0.25 },
    description: "OpenAI最强大的模型 (2026年3月)"
  },
  {
    id: "gpt-5.4-pro",
    name: "GPT-5.4 Pro",
    provider: "openai",
    contextWindow: 1050000,
    maxTokens: 128000,
    cost: { input: 30.0, output: 180.0 },
    description: "GPT-5.4的高级版本"
  },
  {
    id: "gpt-5.3-chat",
    name: "GPT-5.3 Chat",
    provider: "openai",
    contextWindow: 400000,
    maxTokens: 64000,
    cost: { input: 1.5, output: 10.0 },
    description: "GPT-5.3对话优化版本"
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    provider: "openai",
    contextWindow: 400000,
    maxTokens: 64000,
    cost: { input: 1.2, output: 8.0 },
    description: "2025年12月发布"
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    contextWindow: 400000,
    maxTokens: 64000,
    cost: { input: 0.25, output: 2.0, cacheRead: 0.025 },
    description: "性价比最高的GPT-5系列"
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    provider: "openai",
    contextWindow: 1000000,
    maxTokens: 32000,
    cost: { input: 0.15, output: 1.5 },
    description: "超长上下文的轻量版本"
  },
  {
    id: "o4-mini-deep-research",
    name: "o4 Mini Deep Research",
    provider: "openai",
    contextWindow: 200000,
    maxTokens: 64000,
    cost: { input: 1.0, output: 8.0 },
    reasoning: true,
    description: "深度研究优化版本 (2025年10月)"
  },
  {
    id: "o3-deep-research",
    name: "o3 Deep Research",
    provider: "openai",
    contextWindow: 200000,
    maxTokens: 64000,
    cost: { input: 2.0, output: 12.0 },
    reasoning: true,
    description: "高级深度研究模型 (2025年10月)"
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    contextWindow: 128000,
    maxTokens: 16384,
    cost: { input: 2.5, output: 10.0 },
    input: ["text", "image", "audio"],
    description: "GPT-4 优化版本，多模态支持"
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 10.0, output: 30.0 },
    description: "GPT-4 高速版本"
  },
  {
    id: "gpt-4",
    name: "GPT-4",
    provider: "openai",
    contextWindow: 8192,
    maxTokens: 4096,
    cost: { input: 30.0, output: 60.0 },
    description: "经典GPT-4模型"
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    contextWindow: 16385,
    maxTokens: 4096,
    cost: { input: 0.5, output: 1.5 },
    description: "性价比最高的经典模型"
  },

  // ===== Anthropic Claude =====
  {
    id: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    contextWindow: 1000000,
    maxTokens: 128000,
    cost: { input: 5.0, output: 25.0 },
    description: "最智能的Claude模型，适合代理和编程"
  },
  {
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    contextWindow: 1000000,
    maxTokens: 64000,
    cost: { input: 3.0, output: 15.0 },
    description: "速度与智能的最佳平衡"
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 64000,
    cost: { input: 1.0, output: 5.0 },
    description: "最快的Claude模型"
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 4096,
    cost: { input: 15.0, output: 75.0 },
    description: "Claude 3 最强版本"
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 3.0, output: 15.0 },
    description: "Claude 3.5 平衡版本"
  },
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 4096,
    cost: { input: 0.25, output: 1.25 },
    description: "Claude 3 快速版本"
  },

  // ===== Google Gemini =====
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    provider: "google",
    contextWindow: 1000000,
    maxTokens: 16000,
    cost: { input: 2.0, output: 12.0 },
    input: ["text", "image", "video", "audio"],
    description: "顶级推理和多模态能力 (2026年2月)"
  },
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro Preview",
    provider: "google",
    contextWindow: 1000000,
    maxTokens: 16000,
    cost: { input: 2.0, output: 12.0 },
    input: ["text", "image", "video"],
    description: "Gemini 3预览版本"
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    contextWindow: 1000000,
    maxTokens: 64000,
    cost: { input: 1.25, output: 10.0 },
    input: ["text", "image"],
    description: "复杂推理和长文档处理"
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    contextWindow: 1000000,
    maxTokens: 64000,
    cost: { input: 0.3, output: 2.5 },
    input: ["text", "image"],
    description: "高吞吐量，性价比高"
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    contextWindow: 1000000,
    maxTokens: 64000,
    cost: { input: 0.1, output: 0.4 },
    description: "预算友好型任务"
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    contextWindow: 1000000,
    maxTokens: 8000,
    cost: { input: 0.1, output: 0.4 },
    description: "传统应用，最低成本"
  },
  {
    id: "gemini-pro",
    name: "Gemini Pro",
    provider: "google",
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.5, output: 1.5 },
    input: ["text", "image"],
    description: "经典Gemini模型"
  },

  // ===== Zhipu GLM =====
  {
    id: "glm-5",
    name: "GLM-5",
    provider: "zhipu",
    contextWindow: 200000,
    maxTokens: 128000,
    cost: { input: 1.0, output: 3.2 },
    description: "智谱AI 2026旗舰模型，745B参数"
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    provider: "zhipu",
    contextWindow: 200000,
    maxTokens: 128000,
    cost: { input: 0.8, output: 2.8 },
    description: "高智能GLM模型"
  },
  {
    id: "glm-4.6",
    name: "GLM-4.6",
    provider: "zhipu",
    contextWindow: 200000,
    maxTokens: 128000,
    cost: { input: 0.7, output: 2.5 },
    description: "超强性能GLM模型"
  },
  {
    id: "glm-4-long",
    name: "GLM-4-Long",
    provider: "zhipu",
    contextWindow: 1000000,
    maxTokens: 128000,
    cost: { input: 1.0, output: 3.0 },
    description: "超长上下文处理"
  },
  {
    id: "glm-4-flash",
    name: "GLM-4-Flash",
    provider: "zhipu",
    contextWindow: 128000,
    maxTokens: 16000,
    cost: { input: 0.0, output: 0.0 },
    description: "免费模型"
  },
  {
    id: "glm-4",
    name: "GLM-4",
    provider: "zhipu",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.1, output: 0.1 },
    description: "经典GLM-4模型"
  },
  {
    id: "glm-3-turbo",
    name: "GLM-3-Turbo",
    provider: "zhipu",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.005, output: 0.005 },
    description: "GLM-3快速版本"
  },

  // ===== DeepSeek =====
  {
    id: "deepseek-v4",
    name: "DeepSeek V4",
    provider: "deepseek",
    contextWindow: 1000000,
    maxTokens: 16000,
    cost: { input: 0.3, output: 0.5 },
    description: "DeepSeek 2026旗舰模型"
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat (V3.2)",
    provider: "deepseek",
    contextWindow: 128000,
    maxTokens: 8000,
    cost: { input: 0.28, output: 0.42, cacheRead: 0.028 },
    description: "DeepSeek对话模型"
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner (V3.2)",
    provider: "deepseek",
    contextWindow: 128000,
    maxTokens: 64000,
    cost: { input: 0.28, output: 0.42, cacheRead: 0.028 },
    reasoning: true,
    description: "DeepSeek推理模型"
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    provider: "deepseek",
    contextWindow: 128000,
    maxTokens: 8000,
    cost: { input: 0.28, output: 0.42 },
    description: "DeepSeek编程专用模型"
  },

  // ===== Moonshot AI Kimi =====
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "moonshot",
    contextWindow: 262144,
    maxTokens: 16000,
    cost: { input: 0.45, output: 2.2, cacheRead: 0.225 },
    description: "Moonshot 2026最新模型"
  },
  {
    id: "kimi-k2.5-thinking",
    name: "Kimi K2.5 Thinking",
    provider: "moonshot",
    contextWindow: 262144,
    maxTokens: 16000,
    cost: { input: 0.45, output: 2.2, cacheRead: 0.225 },
    reasoning: true,
    description: "Kimi K2.5推理版本"
  },
  {
    id: "kimi-k2-0905-exacto",
    name: "Kimi K2 0905 Exacto",
    provider: "moonshot",
    contextWindow: 131072,
    maxTokens: 16000,
    cost: { input: 0.4, output: 2.0, cacheRead: 0.15 },
    description: "Kimi K2精确版本"
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    provider: "moonshot",
    contextWindow: 131072,
    maxTokens: 16000,
    cost: { input: 0.47, output: 2.0, cacheRead: 0.141 },
    reasoning: true,
    description: "Kimi K2推理模型"
  },
  {
    id: "kimi-k2-0711",
    name: "Kimi K2 0711",
    provider: "moonshot",
    contextWindow: 131000,
    maxTokens: 16000,
    cost: { input: 0.55, output: 2.2 },
    description: "Kimi K2经典版本"
  },
  {
    id: "moonshot-v1-8k",
    name: "Moonshot v1 8K",
    provider: "moonshot",
    contextWindow: 8000,
    maxTokens: 4096,
    cost: { input: 0.12, output: 0.12 },
    description: "Moonshot第一代模型"
  },
  {
    id: "moonshot-v1-32k",
    name: "Moonshot v1 32K",
    provider: "moonshot",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.24, output: 0.24 },
    description: "Moonshot第一代32K版本"
  },
  {
    id: "moonshot-v1-128k",
    name: "Moonshot v1 128K",
    provider: "moonshot",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.6, output: 0.6 },
    description: "Moonshot第一代128K版本"
  },

  // ===== Alibaba Bailian =====
  // Qwen commercial
  {
    id: "qwen3-max",
    name: "Qwen3 Max",
    provider: "bailian",
    contextWindow: 262144,
    maxTokens: 8192,
    cost: { input: 0.343, output: 1.371, cacheRead: 0.034 }, // ~2.4 CNY/M -> $0.343/M, cache supported
    reasoning: true,
    description: "百炼旗舰模型，复杂任务能力最强，支持思考模式"
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    provider: "bailian",
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.217, output: 0.543, cacheRead: 0.022 }, // ~1.52 CNY/M -> $0.217/M
    reasoning: true,
    description: "百炼高性价比模型，效果、速度、成本均衡"
  },
  {
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    provider: "bailian",
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.043, output: 0.086, cacheRead: 0.004 }, // ~0.3 CNY/M -> $0.043/M
    reasoning: true,
    description: "百炼极速模型，简单任务速度快、成本低"
  },
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "bailian",
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.043, output: 0.086 }, // ~0.3 CNY/M
    reasoning: true,
    description: "百炼快速版本，支持百万级上下文"
  },
  {
    id: "qwen-long",
    name: "Qwen Long",
    provider: "bailian",
    contextWindow: 10000000,
    maxTokens: 8192,
    cost: { input: 0.071, output: 0.143 }, // ~0.5 CNY/M
    description: "百炼超长上下文模型，支持千万级token"
  },
  {
    id: "qwen-omni-turbo",
    name: "Qwen Omni Turbo",
    provider: "bailian",
    contextWindow: 100000,
    maxTokens: 8192,
    cost: { input: 0.143, output: 0.429 }, // ~1 CNY/M in, ~3 CNY/M out
    input: ["text", "image", "audio"],
    description: "百炼全模态模型，支持文本、图像、音频"
  },
  {
    id: "qwq-plus",
    name: "QwQ Plus",
    provider: "bailian",
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.514, output: 1.543 }, // ~3.6 CNY/M in, ~10.8 CNY/M out
    reasoning: true,
    description: "百炼推理增强模型"
  },
  {
    id: "qvq-72b-preview",
    name: "QVQ 72B Preview",
    provider: "bailian",
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0.057, output: 0.143 }, // ~0.4 CNY/M, ~1 CNY/M
    input: ["text", "image"],
    reasoning: true,
    description: "百炼视觉推理模型"
  },
  {
    id: "qwen-vl-max",
    name: "Qwen VL Max",
    provider: "bailian",
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0.057, output: 0.143 },
    input: ["text", "image"],
    description: "百炼视觉理解旗舰模型"
  },
  {
    id: "qwen-vl-plus",
    name: "Qwen VL Plus",
    provider: "bailian",
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0.029, output: 0.057 }, // ~0.2 CNY/M, ~0.4 CNY/M
    input: ["text", "image"],
    description: "百炼视觉理解高性价比模型"
  },
  
  // Qwen open-weight (hosted on Bailian)
  {
    id: "qwen2.5-72b-instruct",
    name: "Qwen2.5 72B Instruct",
    provider: "bailian",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.057, output: 0.171 }, // $0.40/M, $1.20/M (intl)
    description: "百炼托管的Qwen2.5开源旗舰模型"
  },
  {
    id: "qwen2.5-32b-instruct",
    name: "Qwen2.5 32B Instruct",
    provider: "bailian",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.029, output: 0.086 },
    description: "百炼托管的Qwen2.5开源模型"
  },
  {
    id: "qwen2.5-14b-instruct",
    name: "Qwen2.5 14B Instruct",
    provider: "bailian",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.014, output: 0.043 },
    description: "百炼托管的Qwen2.5开源14B模型"
  },
  {
    id: "qwen2.5-7b-instruct",
    name: "Qwen2.5 7B Instruct",
    provider: "bailian",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.007, output: 0.021 },
    description: "百炼托管的Qwen2.5开源7B模型"
  },
  {
    id: "qwen2.5-coder-32b-instruct",
    name: "Qwen2.5 Coder 32B",
    provider: "bailian",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.029, output: 0.086 }, // $0.20/M, $0.60/M
    description: "百炼托管的Qwen2.5代码专用模型"
  },
  {
    id: "qwen3-coder-next",
    name: "Qwen3 Coder Next",
    provider: "bailian",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.286, output: 0.857 }, // ~2 CNY/M, ~6 CNY/M
    reasoning: true,
    description: "百炼代码推理模型，支持思维链"
  },
  
  // DeepSeek on Bailian
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.286, output: 0.429, cacheRead: 0.029 }, // ~2 CNY/M, ~3 CNY/M, cache supported
    description: "百炼托管的DeepSeek最新模型"
  },
  {
    id: "deepseek-v3.2-exp",
    name: "DeepSeek V3.2 Exp",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.286, output: 0.429 },
    description: "百炼托管的DeepSeek实验版"
  },
  {
    id: "deepseek-v3.1",
    name: "DeepSeek V3.1",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.571, output: 1.714 }, // ~4 CNY/M, ~12 CNY/M
    description: "百炼托管的DeepSeek V3.1"
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.286, output: 1.143 }, // ~2 CNY/M, ~8 CNY/M
    description: "百炼托管的DeepSeek V3"
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.571, output: 2.286 }, // ~4 CNY/M, ~16 CNY/M
    reasoning: true,
    description: "百炼托管的DeepSeek推理模型"
  },
  {
    id: "deepseek-r1-0528",
    name: "DeepSeek R1-0528",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.571, output: 2.286 },
    reasoning: true,
    description: "百炼托管的DeepSeek R1快照版本"
  },
  {
    id: "deepseek-r1-distill-qwen-32b",
    name: "DeepSeek R1 Distill Qwen 32B",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.286, output: 0.857 }, // ~2 CNY/M, ~6 CNY/M
    reasoning: true,
    description: "百炼托管的DeepSeek R1蒸馏版（Qwen 32B）"
  },
  {
    id: "deepseek-r1-distill-qwen-14b",
    name: "DeepSeek R1 Distill Qwen 14B",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.143, output: 0.429 }, // ~1 CNY/M, ~3 CNY/M
    reasoning: true,
    description: "百炼托管的DeepSeek R1蒸馏版（Qwen 14B）"
  },
  {
    id: "deepseek-r1-distill-qwen-7b",
    name: "DeepSeek R1 Distill Qwen 7B",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.071, output: 0.143 }, // ~0.5 CNY/M, ~1 CNY/M
    reasoning: true,
    description: "百炼托管的DeepSeek R1蒸馏版（Qwen 7B）"
  },
  
  // DeepSeek via SiliconFlow
  {
    id: "siliconflow/deepseek-v3.2",
    name: "DeepSeek V3.2 (SiliconFlow)",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.286, output: 0.429 },
    description: "百炼托管的硅基流动DeepSeek V3.2"
  },
  {
    id: "siliconflow/deepseek-v3.1-terminus",
    name: "DeepSeek V3.1 Terminus",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.571, output: 1.714 },
    description: "百炼托管的硅基流动DeepSeek V3.1终极版"
  },
  {
    id: "siliconflow/deepseek-r1-0528",
    name: "DeepSeek R1-0528 (SiliconFlow)",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.571, output: 2.286 },
    reasoning: true,
    description: "百炼托管的硅基流动DeepSeek R1"
  },
  {
    id: "siliconflow/deepseek-v3-0324",
    name: "DeepSeek V3-0324 (SiliconFlow)",
    provider: "bailian",
    contextWindow: 65536,
    maxTokens: 8192,
    cost: { input: 0.286, output: 1.143 },
    description: "百炼托管的硅基流动DeepSeek V3快照"
  },
  
  // Kimi on Bailian
  {
    id: "bailian/kimi-k2.5",
    name: "Kimi K2.5 (百炼)",
    provider: "bailian",
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.571, output: 3.0 }, // ~4 CNY/M, ~21 CNY/M
    description: "百炼托管的Kimi最新旗舰模型，超长上下文"
  },
  {
    id: "bailian/kimi-k2-thinking",
    name: "Kimi K2 Thinking (百炼)",
    provider: "bailian",
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.571, output: 2.286 }, // ~4 CNY/M, ~16 CNY/M
    reasoning: true,
    description: "百炼托管的Kimi推理模型"
  },
  {
    id: "bailian/moonshot-kimi-k2-instruct",
    name: "Moonshot Kimi K2 Instruct (百炼)",
    provider: "bailian",
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.571, output: 2.286 },
    description: "百炼托管的Kimi K2指令模型"
  },
  {
    id: "bailian/kimi-k2.5-moonshot",
    name: "Kimi K2.5 月之暗面 (百炼)",
    provider: "bailian",
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.571, output: 3.0 },
    description: "百炼托管的月之暗面Kimi K2.5"
  },
  
  // GLM on Bailian
  {
    id: "bailian/glm-5",
    name: "GLM-5 (百炼)",
    provider: "bailian",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.714, output: 2.857 }, // ~5 CNY/M, ~20 CNY/M
    reasoning: true,
    description: "百炼托管的智谱GLM-5，支持思考模式"
  },
  
  // MiniMax on Bailian (OpenAI-compatible API; model id must match console)
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5 (百炼)",
    provider: "bailian",
    contextWindow: 196608,
    maxTokens: 32768,
    cost: { input: 0.3, output: 1.2 },
    reasoning: true,
    description: "百炼 MiniMax-M2.5（兼容模式 model 字段须为此大小写）"
  },
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1 (百炼)",
    provider: "bailian",
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 0.3, output: 1.2 },
    reasoning: true,
    description: "百炼 MiniMax-M2.1"
  },
  {
    id: "bailian/abab6.5g-chat",
    name: "Abab 6.5G Chat (百炼)",
    provider: "bailian",
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0.0, output: 0.0 },
    description: "百炼托管的MiniMax Abab模型（限时免费）"
  },

  // ===== Baidu ERNIE =====
  {
    id: "ernie-4.5-21b-a3b",
    name: "ERNIE 4.5 21B",
    provider: "baidu",
    contextWindow: 120000,
    maxTokens: 4096,
    cost: { input: 0.07, output: 0.28 },
    description: "文心一言4.5 21B模型"
  },
  {
    id: "ernie-4.5-21b-a3b-thinking",
    name: "ERNIE 4.5 21B Thinking",
    provider: "baidu",
    contextWindow: 131000,
    maxTokens: 4096,
    cost: { input: 0.07, output: 0.28 },
    reasoning: true,
    description: "文心一言4.5推理版本"
  },
  {
    id: "ernie-4.5-vl-28b-a3b",
    name: "ERNIE 4.5 VL 28B",
    provider: "baidu",
    contextWindow: 30000,
    maxTokens: 4096,
    cost: { input: 0.14, output: 0.56 },
    input: ["text", "image"],
    description: "文心一言4.5视觉模型"
  },
  {
    id: "ernie-4.5-300b-a47b",
    name: "ERNIE 4.5 300B",
    provider: "baidu",
    contextWindow: 123000,
    maxTokens: 4096,
    cost: { input: 0.28, output: 1.1 },
    description: "文心一言4.5大参数模型"
  },
  {
    id: "ernie-4.5-vl-424b-a47b",
    name: "ERNIE 4.5 VL 424B",
    provider: "baidu",
    contextWindow: 123000,
    maxTokens: 4096,
    cost: { input: 0.42, output: 1.25 },
    input: ["text", "image"],
    description: "文心一言4.5视觉大模型"
  },
  {
    id: "ernie-bot-4",
    name: "ERNIE Bot 4.0",
    provider: "baidu",
    contextWindow: 5120,
    maxTokens: 2048,
    cost: { input: 0.12, output: 0.12 },
    description: "文心一言4.0经典版本"
  },
  {
    id: "ernie-bot-turbo",
    name: "ERNIE Bot Turbo",
    provider: "baidu",
    contextWindow: 11200,
    maxTokens: 1024,
    cost: { input: 0.008, output: 0.008 },
    description: "文心一言快速版本"
  },

  // ===== MiniMax =====
  {
    id: "minimax-m2.5",
    name: "MiniMax M2.5",
    provider: "minimax",
    contextWindow: 204800,
    maxTokens: 8192,
    cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
    reasoning: true,
    description: "MiniMax 2026旗舰模型"
  },
  {
    id: "minimax-m2.5-highspeed",
    name: "MiniMax M2.5 HighSpeed",
    provider: "minimax",
    contextWindow: 204800,
    maxTokens: 8192,
    cost: { input: 0.6, output: 2.4 },
    description: "MiniMax M2.5高速版本"
  },
  {
    id: "minimax-m2.1",
    name: "MiniMax M2.1",
    provider: "minimax",
    contextWindow: 204800,
    maxTokens: 8192,
    cost: { input: 0.3, output: 1.2 },
    description: "MiniMax M2.1编程增强"
  },
  {
    id: "minimax-m2.1-highspeed",
    name: "MiniMax M2.1 HighSpeed",
    provider: "minimax",
    contextWindow: 204800,
    maxTokens: 8192,
    cost: { input: 0.6, output: 2.4 },
    description: "MiniMax M2.1高速版本"
  },
  {
    id: "minimax-m2",
    name: "MiniMax M2",
    provider: "minimax",
    contextWindow: 204800,
    maxTokens: 8192,
    cost: { input: 0.3, output: 1.2 },
    description: "MiniMax M2代理能力强"
  },
  {
    id: "minimax-m2-her",
    name: "MiniMax M2-Her",
    provider: "minimax",
    contextWindow: 66000,
    maxTokens: 4096,
    cost: { input: 0.3, output: 1.2 },
    description: "MiniMax角色扮演模型"
  },
  {
    id: "minimax-01",
    name: "MiniMax-01",
    provider: "minimax",
    contextWindow: 245760,
    maxTokens: 4096,
    cost: { input: 0.2, output: 0.8 },
    description: "MiniMax第一代模型"
  },
  {
    id: "abab6.5s-chat",
    name: "Abab6.5s Chat",
    provider: "minimax",
    contextWindow: 245760,
    maxTokens: 8192,
    cost: { input: 0.015, output: 0.015 },
    description: "Abab6.5s对话模型"
  },
  {
    id: "abab6.5t-chat",
    name: "Abab6.5t Chat",
    provider: "minimax",
    contextWindow: 245760,
    maxTokens: 8192,
    cost: { input: 0.005, output: 0.005 },
    description: "Abab6.5t快速版本"
  },
  {
    id: "abab6.5g-chat",
    name: "Abab6.5g Chat",
    provider: "minimax",
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 0.1, output: 0.1 },
    description: "Abab6.5g通用版本"
  },

  // ===== Baichuan =====
  {
    id: "baichuan-m3-plus",
    name: "Baichuan M3 Plus",
    provider: "baichuan",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.007, output: 0.013 }, // converted to USD
    description: "百川M3 Plus模型"
  },
  {
    id: "baichuan-m3",
    name: "Baichuan M3",
    provider: "baichuan",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.014, output: 0.043 },
    description: "百川M3模型"
  },
  {
    id: "baichuan4-turbo",
    name: "Baichuan4 Turbo",
    provider: "baichuan",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.021, output: 0.021 },
    description: "百川4快速版本"
  },
  {
    id: "baichuan4-air",
    name: "Baichuan4 Air",
    provider: "baichuan",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.0014, output: 0.0014 },
    description: "百川4轻量版本"
  },
  {
    id: "baichuan4",
    name: "Baichuan4",
    provider: "baichuan",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.14, output: 0.14 },
    description: "百川4旗舰模型"
  },
  {
    id: "baichuan3-turbo",
    name: "Baichuan3 Turbo",
    provider: "baichuan",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.017, output: 0.017 },
    description: "百川3快速版本"
  },
  {
    id: "baichuan3-turbo-128k",
    name: "Baichuan3 Turbo 128K",
    provider: "baichuan",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.034, output: 0.034 },
    description: "百川3 128K版本"
  },
  {
    id: "baichuan2-turbo",
    name: "Baichuan2 Turbo",
    provider: "baichuan",
    contextWindow: 32000,
    maxTokens: 4096,
    cost: { input: 0.011, output: 0.011 },
    deprecated: true,
    description: "百川2模型（已停用）"
  },

  // ===== ByteDance Doubao =====
  {
    id: "doubao-pro-256k",
    name: "Doubao Pro 256K",
    provider: "doubao",
    contextWindow: 256000,
    maxTokens: 8192,
    cost: { input: 0.006, output: 0.023 }, // converted to USD
    description: "豆包Pro 256K超长上下文"
  },
  {
    id: "doubao-pro-128k",
    name: "Doubao Pro 128K",
    provider: "doubao",
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.006, output: 0.023 },
    description: "豆包Pro 128K版本"
  },
  {
    id: "doubao-pro-32k",
    name: "Doubao Pro 32K",
    provider: "doubao",
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.006, output: 0.023 },
    description: "豆包Pro 32K版本"
  },
  {
    id: "doubao-lite-128k",
    name: "Doubao Lite 128K",
    provider: "doubao",
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.001, output: 0.003 },
    description: "豆包Lite轻量版本"
  },
  {
    id: "doubao-lite-32k",
    name: "Doubao Lite 32K",
    provider: "doubao",
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.001, output: 0.003 },
    description: "豆包Lite 32K版本"
  },
  {
    id: "seed-code-256k",
    name: "Seed Code 256K",
    provider: "doubao",
    contextWindow: 256000,
    maxTokens: 8192,
    cost: { input: 0.006, output: 0.017 },
    description: "豆包专业编程模型"
  },

  // ===== Mistral AI =====
  {
    id: "mistral-large-3-2512",
    name: "Mistral Large 3 2512",
    provider: "mistral",
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.5, output: 1.5 },
    description: "Mistral 2025年12月旗舰"
  },
  {
    id: "mistral-medium-3.1",
    name: "Mistral Medium 3.1",
    provider: "mistral",
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.4, output: 2.0 },
    description: "Mistral中型模型"
  },
  {
    id: "mistral-small-3.2-24b",
    name: "Mistral Small 3.2 24B",
    provider: "mistral",
    contextWindow: 131000,
    maxTokens: 8192,
    cost: { input: 0.05, output: 0.08 },
    description: "Mistral小型高效模型"
  },
  {
    id: "ministral-3-14b-2512",
    name: "Ministral 3 14B 2512",
    provider: "mistral",
    contextWindow: 131000,
    maxTokens: 8192,
    cost: { input: 0.04, output: 0.08 },
    description: "Ministral 14B模型"
  },
  {
    id: "mistral-nemo",
    name: "Mistral Nemo",
    provider: "mistral",
    contextWindow: 131000,
    maxTokens: 8192,
    cost: { input: 0.02, output: 0.04 },
    description: "Mistral最便宜的模型"
  },
  {
    id: "ministral-3b",
    name: "Ministral 3B",
    provider: "mistral",
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.025, output: 0.05 },
    description: "Ministral 3B小型模型"
  },
  {
    id: "devstral-2-2512",
    name: "Devstral 2 2512",
    provider: "mistral",
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.3, output: 0.9 },
    description: "Devstral编程模型"
  },
  {
    id: "devstral-small-1.1",
    name: "Devstral Small 1.1",
    provider: "mistral",
    contextWindow: 131000,
    maxTokens: 8192,
    cost: { input: 0.02, output: 0.04 },
    description: "Devstral小型编程模型"
  },
  {
    id: "mistral-7b-instruct",
    name: "Mistral 7B Instruct",
    provider: "mistral",
    contextWindow: 4000,
    maxTokens: 2048,
    cost: { input: 0.005, output: 0.015 },
    description: "Mistral 7B经典模型"
  },

  // ===== Cohere =====
  {
    id: "command-a",
    name: "Command A",
    provider: "cohere",
    contextWindow: 256000,
    maxTokens: 8192,
    cost: { input: 2.5, output: 10.0 },
    description: "Cohere最强命令模型"
  },
  {
    id: "command-r-plus",
    name: "Command R+",
    provider: "cohere",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 2.5, output: 10.0 },
    description: "Cohere增强版本"
  },
  {
    id: "command-r",
    name: "Command R",
    provider: "cohere",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.15, output: 0.6 },
    description: "Cohere标准版本"
  },
  {
    id: "command-r7b-12-2024",
    name: "Command R7B",
    provider: "cohere",
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.037, output: 0.15 },
    description: "Cohere 7B模型"
  },

  // ===== xAI Grok =====
  {
    id: "grok-4.1-fast",
    name: "Grok 4.1 Fast",
    provider: "xai",
    contextWindow: 2000000,
    maxTokens: 16000,
    cost: { input: 0.2, output: 0.5, cacheRead: 0.05 },
    description: "Grok 4.1快速版本，200万上下文"
  },
  {
    id: "grok-4-fast",
    name: "Grok 4 Fast",
    provider: "xai",
    contextWindow: 2000000,
    maxTokens: 16000,
    cost: { input: 0.2, output: 0.5 },
    description: "Grok 4快速版本"
  },
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "xai",
    contextWindow: 256000,
    maxTokens: 16000,
    cost: { input: 3.0, output: 15.0, cacheRead: 0.75 },
    description: "Grok 4标准版本"
  },
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 3.0, output: 15.0, cacheRead: 0.5 },
    description: "Grok 3模型"
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xai",
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.3, output: 0.5 },
    description: "Grok 3迷你版本"
  },
  {
    id: "grok-code-fast",
    name: "Grok Code Fast",
    provider: "xai",
    contextWindow: 256000,
    maxTokens: 16000,
    cost: { input: 0.25, output: 0.6 },
    description: "Grok编程专用模型"
  },

  // ===== 01.AI Yi =====
  {
    id: "yi-large",
    name: "Yi Large",
    provider: "01ai",
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 3.0, output: 3.0 },
    description: "零一万物大型模型"
  },
  {
    id: "yi-large-turbo",
    name: "Yi Large Turbo",
    provider: "01ai",
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 1.71, output: 1.71 }, // ~12 CNY
    description: "零一万物快速版本"
  },
  {
    id: "yi-medium",
    name: "Yi Medium",
    provider: "01ai",
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.36, output: 0.36 }, // ~2.5 CNY
    description: "零一万物中型模型"
  },
  {
    id: "yi-34b-chat-200k",
    name: "Yi 34B Chat 200K",
    provider: "01ai",
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 0.5, output: 0.5 },
    description: "零一万物200K超长上下文"
  },
  {
    id: "yi-34b-chat",
    name: "Yi 34B Chat",
    provider: "01ai",
    contextWindow: 4000,
    maxTokens: 4096,
    cost: { input: 0.3, output: 0.3 },
    description: "零一万物34B对话模型"
  },
]

/**
 * Models grouped by provider id
 */
export const MODELS_BY_PROVIDER = MODELS_DATABASE.reduce((acc, model) => {
  if (!acc[model.provider]) {
    acc[model.provider] = []
  }
  acc[model.provider].push(model)
  return acc
}, {} as Record<string, ModelInfo[]>)

/**
 * Provider display metadata
 */
export const PROVIDER_INFO: Record<string, { name: string; description: string }> = {
  openai: { name: "OpenAI", description: "GPT系列模型，业界领先" },
  anthropic: { name: "Anthropic", description: "Claude系列，安全性强" },
  google: { name: "Google", description: "Gemini系列，多模态能力强" },
  zhipu: { name: "智谱AI", description: "GLM系列，国产领先" },
  deepseek: { name: "DeepSeek", description: "性价比最高，支持超长上下文" },
  moonshot: { name: "Moonshot AI", description: "Kimi系列，超长上下文专家" },
  bailian: { name: "阿里云百炼", description: "Qwen、DeepSeek、Kimi、GLM、MiniMax等全模型平台" },
  baidu: { name: "百度文心", description: "ERNIE系列，百度生态" },
  minimax: { name: "MiniMax", description: "Abab系列，角色扮演能力强" },
  baichuan: { name: "百川智能", description: "Baichuan系列，中文优化" },
  doubao: { name: "字节豆包", description: "Doubao系列，性价比高" },
  mistral: { name: "Mistral AI", description: "欧洲AI领导者" },
  cohere: { name: "Cohere", description: "企业级AI解决方案" },
  xai: { name: "xAI", description: "Grok系列，超长上下文" },
  "01ai": { name: "零一万物", description: "Yi系列，高性能中文模型" },
}

/**
 * Lookup model by id
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODELS_DATABASE.find(m => m.id === modelId)
}

/**
 * List models for one provider
 */
export function getModelsByProvider(provider: string): ModelInfo[] {
  return MODELS_BY_PROVIDER[provider] || []
}

/**
 * Fuzzy search across id, name, provider, description
 */
export function searchModels(query: string): ModelInfo[] {
  const q = query.toLowerCase()
  return MODELS_DATABASE.filter(m => 
    m.id.toLowerCase().includes(q) ||
    m.name.toLowerCase().includes(q) ||
    m.provider.toLowerCase().includes(q) ||
    m.description?.toLowerCase().includes(q)
  )
}

/**
 * Sorted provider ids present in the database
 */
export function getAllProviders(): string[] {
  return Object.keys(MODELS_BY_PROVIDER).sort()
}
