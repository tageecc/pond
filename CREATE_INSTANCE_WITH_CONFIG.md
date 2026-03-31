# Create Instance with Configuration - Feature Enhancement

## 问题描述

用户反馈创建新实例时的两个核心问题：

1. **创建后无法使用** - 创建实例时没有配置 API key，导致创建后无法开始对话
2. **体验不够友好** - 没有提供复用当前实例配置的选项，每次都要重新输入

## 解决方案

### 1. 优化创建实例对话框

**位置**: `src/components/CreateOpenClawInstanceDialog.tsx`

添加两种配置模式供用户选择：

#### 模式 1: 复用当前实例配置（推荐）
- **适用场景**: 当前实例已配置 API key
- **优点**: 一键创建，自动复制 provider 和 API key
- **体验**: 无需重新输入，快速创建多个实例

#### 模式 2: 手动配置
- **适用场景**: 需要使用不同的 provider 或 API key
- **配置项**:
  - Provider 选择（支持所有 PROVIDERS）
  - API Key（必填）
  - Model ID（可选）
  - Base URL（自定义 provider 时需要）

### 2. UI 设计

```
┌──────────────────────────────────────┐
│ 新建 OpenClaw 实例                    │
├──────────────────────────────────────┤
│ ○ 复用当前实例配置                    │
│   自动复制当前实例的 provider 和       │
│   API key 配置                        │
│                                      │
│ ● 手动配置                            │
│   为新实例单独配置 provider 和 API key │
│                                      │
│   ┌──────────────────────────────┐  │
│   │ Provider: Anthropic (Claude) │  │
│   ├──────────────────────────────┤  │
│   │ API Key: ••••••••••••••••    │  │
│   ├──────────────────────────────┤  │
│   │ 模型 ID（可选）: claude-...   │  │
│   └──────────────────────────────┘  │
│                                      │
│            [取消]  [创建]             │
└──────────────────────────────────────┘
```

### 3. 核心代码实现

#### CreateOpenClawInstanceDialog 组件

**新增状态**:
```typescript
const [configMode, setConfigMode] = useState<'inherit' | 'manual'>('inherit')
const [providerId, setProviderId] = useState('anthropic')
const [apiKey, setApiKey] = useState('')
const [model, setModel] = useState('')
const [baseURL, setBaseURL] = useState('')
```

**智能默认选择**:
```typescript
// Check if current instance has valid config to inherit
const hasCurrentConfig = openclawConfig && 
  openclawConfig.models?.providers && 
  Object.values(openclawConfig.models.providers).some(
    (p) => p?.apiKey && p.apiKey.trim().length > 0
  )
```

**提交逻辑**:
```typescript
const submit = async () => {
  if (configMode === 'manual' && !apiKey.trim()) {
    return // Show error
  }
  
  if (configMode === 'inherit') {
    await createOpenClawInstance({ mode: 'inherit' })
  } else {
    await createOpenClawInstance({
      mode: 'manual',
      providerId,
      apiKey: apiKey.trim(),
      model: model.trim() || undefined,
      baseURL: baseURL.trim() || undefined,
    })
  }
}
```

#### appStore.ts 修改

**扩展 createOpenClawInstance 函数**:

```typescript
createOpenClawInstance: async (options?: {
  mode: 'inherit' | 'manual'
  providerId?: string
  apiKey?: string
  model?: string
  baseURL?: string
}) => {
  // Generate instance ID
  let id = Math.random().toString(36).slice(2, 7)
  
  // Create instance directory
  await invoke('run_openclaw_agents_add', { agentId: id })
  
  // Configure based on mode
  if (options?.mode === 'manual' && options.providerId && options.apiKey) {
    // Manual configuration
    const authChoice = NATIVE_PROVIDERS[options.providerId] || 'custom-api-key'
    await invoke('run_openclaw_onboard_non_interactive', {
      instanceId: id,
      gatewayPort: 18789,
      authChoice,
      anthropicApiKey: options.providerId === 'anthropic' ? options.apiKey : undefined,
      openaiApiKey: options.providerId === 'openai' ? options.apiKey : undefined,
      geminiApiKey: options.providerId === 'google' ? options.apiKey : undefined,
      customBaseUrl: needsCustomParams ? options.baseURL : undefined,
      customModelId: needsCustomParams ? options.model : undefined,
      customApiKey: needsCustomParams ? options.apiKey : undefined,
    })
  } else if (options?.mode === 'inherit') {
    // Copy from current instance
    const currentConfig = get().openclawConfig
    if (currentConfig?.models?.providers) {
      const providers = currentConfig.models.providers
      const firstProvider = Object.entries(providers).find(([_, p]) => p?.apiKey)?.[0]
      
      if (firstProvider) {
        // Copy provider config to new instance
        await invoke('run_openclaw_onboard_non_interactive', {
          instanceId: id,
          gatewayPort: 18789,
          authChoice: /* map provider to auth choice */,
          /* provider-specific keys */
        })
      }
    }
  }
  
  // Load and switch to new instance
  await get().loadConfigs()
  await get().switchInstance(id, true)
  
  // Show success/warning toast
  const config = get().openclawConfig
  if (!hasConfiguredModelFromConfig(config)) {
    toast.warning('实例已创建', {
      description: '请先配置 API key'
    })
  } else {
    toast.success('实例已就绪')
  }
}
```

### 4. UI 组件

#### 创建 RadioGroup 组件

**位置**: `src/components/ui/radio-group.tsx`

```typescript
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"

const RadioGroup = React.forwardRef<...>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  )
})

const RadioGroupItem = React.forwardRef<...>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-app-border text-claw-500...",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
```

### 5. 国际化

#### 中文 (`src/locales/zh/createInstance.json`)

```json
{
  "createInstance": {
    "title": "新建 OpenClaw 实例",
    "inheritConfig": "复用当前实例配置",
    "inheritConfigDesc": "自动复制当前实例的 provider 和 API key 配置",
    "noConfigToInherit": "当前实例未配置 API key，无法复用",
    "manualConfig": "手动配置",
    "manualConfigDesc": "为新实例单独配置 provider 和 API key",
    "provider": "Provider",
    "apiKeyPlaceholder": "请输入 API Key",
    "modelOptional": "模型 ID（可选）"
  }
}
```

#### 英文 (`src/locales/en/createInstance.json`)

```json
{
  "createInstance": {
    "title": "New OpenClaw instance",
    "inheritConfig": "Copy from current instance",
    "inheritConfigDesc": "Automatically copy provider and API key from current instance",
    "noConfigToInherit": "Current instance has no API key configured",
    "manualConfig": "Manual configuration",
    "manualConfigDesc": "Configure provider and API key for the new instance",
    "provider": "Provider",
    "apiKeyPlaceholder": "Enter your API key",
    "modelOptional": "Model ID (optional)"
  }
}
```

### 6. 依赖安装

```bash
pnpm add @radix-ui/react-radio-group
```

## 用户体验提升

### Before
1. 点击"创建新实例" → 直接创建 → 没有配置 → 尝试对话 → 卡住 ❌
2. 需要手动进入设置 → 配置 provider → 输入 API key → 保存 ❌

### After（模式 1: 复用配置）
1. 点击"创建新实例" → 选择"复用当前实例配置" → 点击创建 → **立即可用** ✅
2. 节省时间，避免重复输入 ✅

### After（模式 2: 手动配置）
1. 点击"创建新实例" → 选择"手动配置" → 填写 provider 和 API key → 点击创建 → **立即可用** ✅
2. 在创建时就完成配置，避免创建后无法使用 ✅

## 测试场景

### 场景 1: 当前实例已配置（推荐流程）
1. 当前实例已配置 Anthropic API key
2. 点击"创建新实例"
3. **默认选择**: "复用当前实例配置"（推荐）
4. 点击"创建"
5. **结果**: 新实例自动配置 Anthropic，立即可用

### 场景 2: 当前实例未配置
1. 当前实例没有配置 API key
2. 点击"创建新实例"
3. **复用选项**: 禁用状态，提示"当前实例未配置 API key，无法复用"
4. **自动选择**: "手动配置"
5. 填写 provider 和 API key
6. 点击"创建"
7. **结果**: 新实例配置完成，立即可用

### 场景 3: 需要使用不同 provider
1. 当前实例配置了 OpenAI
2. 点击"创建新实例"
3. 选择"手动配置"
4. 选择 Anthropic，输入 API key
5. 点击"创建"
6. **结果**: 新实例使用 Anthropic，立即可用

### 场景 4: 自定义 provider
1. 选择"手动配置"
2. Provider 选择 "Custom (OpenAI-compatible)"
3. 填写 API key 和 Base URL
4. 填写 Model ID
5. 点击"创建"
6. **结果**: 新实例使用自定义配置，立即可用

## 技术细节

### 配置继承逻辑

复用当前实例配置时，会复制以下内容：
- Provider 类型
- API Key
- Base URL（如果有）
- Model ID（如果有）

**注意**: 不会复制 skills、agents、workspace 等实例特定配置

### 验证逻辑

手动配置模式下的验证：
- API Key: 必填，不能为空
- Model ID: 可选
- Base URL: 仅 Custom provider 时需要

### 错误处理

- API Key 未填写: 禁用"创建"按钮
- 配置失败: 显示错误 toast，不切换实例
- 当前实例无配置: 禁用"复用"选项

## 文件修改清单

- ✅ `src/components/CreateOpenClawInstanceDialog.tsx` - 添加配置模式选择 UI
- ✅ `src/components/ui/radio-group.tsx` - 新建 RadioGroup 组件
- ✅ `src/stores/appStore.ts` - 扩展 createOpenClawInstance 函数
- ✅ `src/locales/zh/createInstance.json` - 添加中文翻译
- ✅ `src/locales/en/createInstance.json` - 添加英文翻译
- ✅ `package.json` - 添加 @radix-ui/react-radio-group 依赖

## 后续优化建议

### 1. 记住用户选择
保存用户上次选择的配置模式，下次打开对话框时自动选择

### 2. 批量创建
支持一次创建多个实例，都使用相同的配置

### 3. 预设模板
提供常用配置模板（如"开发环境"、"生产环境"等）

### 4. 配置验证
在创建前验证 API key 是否有效（可选）

## 总结

通过这次优化，我们解决了用户最关心的两个问题：

1. **避免创建后无法使用** - 在创建时就完成配置
2. **提升配置体验** - 支持一键复用，避免重复输入

用户现在可以：
- 快速创建多个配置相同的实例（复用模式）
- 创建配置不同的实例（手动模式）
- 明确知道实例是否已配置（即时反馈）

这是一个以用户为中心的优化，大幅提升了创建实例的体验！✨
