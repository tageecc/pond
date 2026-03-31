# 创建实例优化 - 支持多配置选择

## 问题

之前的实现只能复用"第一个有 API key 的 provider"，但实际场景中：
- 用户可能配置了多个 providers（Anthropic、OpenAI、Google 等）
- 不同 provider 用于不同用途
- 用户应该能自主选择要复用哪个配置

## 解决方案

### UI 设计

#### 1. 当前实例有多个配置时

```
┌─────────────────────────────────────────┐
│ 新建 OpenClaw 实例                       │
├─────────────────────────────────────────┤
│ ● 复用当前实例配置                       │
│   选择要复用的配置                       │
│                                         │
│   ┌───────────────────────────────────┐ │
│   │ Anthropic (Claude)            ▼  │ │
│   │ API key: sk-ant-•••• · claude... │ │
│   └───────────────────────────────────┘ │
│                                         │
│   下拉选项:                              │
│   • Anthropic (Claude)                  │
│     API key: sk-ant-•••• · claude-...   │
│   • OpenAI (GPT)                        │
│     API key: sk-proj-•••• · gpt-4o      │
│   • Google (Gemini)                     │
│     API key: AIzaSy•••• · gemini-2.5... │
│                                         │
│ ○ 手动配置                               │
│                                         │
│               [取消]  [创建]             │
└─────────────────────────────────────────┘
```

#### 2. 当前实例只有一个配置时

```
┌─────────────────────────────────────────┐
│ ● 复用当前实例配置                       │
│   选择要复用的配置                       │
│                                         │
│   ┌───────────────────────────────────┐ │
│   │ Anthropic (Claude)               │ │
│   │ API key: sk-ant-•••• · claude... │ │
│   └───────────────────────────────────┘ │
│                                         │
│   只有一个选项，自动选中                  │
└─────────────────────────────────────────┘
```

#### 3. 当前实例未配置时

```
┌─────────────────────────────────────────┐
│ ○ 复用当前实例配置（禁用）               │
│   当前实例未配置 API key，无法复用       │
│                                         │
│ ● 手动配置（自动选中）                   │
│   为新实例单独配置 provider 和 API key   │
└─────────────────────────────────────────┘
```

## 核心代码实现

### 1. 获取所有已配置的 Providers

```typescript
// Get all configured providers from current instance
const configuredProviders = openclawConfig?.models?.providers 
  ? Object.entries(openclawConfig.models.providers)
      .filter(([_, p]) => p?.apiKey && p.apiKey.trim().length > 0)
      .map(([id, p]) => ({
        id,
        name: getProvider(id)?.name || id,
        apiKey: p?.apiKey || '',
        baseUrl: p?.baseUrl,
        model: p?.defaultModel || p?.models?.[0]?.id,
      }))
  : []

const hasCurrentConfig = configuredProviders.length > 0
```

### 2. 下拉列表展示

```typescript
<Select value={inheritProviderId} onValueChange={setInheritProviderId}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {configuredProviders.map((cp) => (
      <SelectItem key={cp.id} value={cp.id}>
        <div className="flex flex-col">
          <span className="font-medium">{cp.name}</span>
          <span className="text-xs text-app-muted">
            API key: {cp.apiKey.slice(0, 8)}••••
            {cp.model && ` · ${cp.model}`}
          </span>
        </div>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 3. 复制选中的 Provider 配置

```typescript
if (options?.mode === 'inherit' && options.inheritProviderId) {
  const currentConfig = get().openclawConfig
  if (currentConfig?.models?.providers) {
    const providers = currentConfig.models.providers
    const selectedProviderId = options.inheritProviderId
    const provider = providers[selectedProviderId]
    
    if (provider?.apiKey) {
      const authChoice = NATIVE_PROVIDERS[selectedProviderId] || 'custom-api-key'
      const needsCustomParams = !(selectedProviderId in NATIVE_PROVIDERS)
      
      await invoke('run_openclaw_onboard_non_interactive', {
        instanceId: id,
        gatewayPort: 18789,
        authChoice,
        anthropicApiKey: selectedProviderId === 'anthropic' ? provider.apiKey : undefined,
        openaiApiKey: selectedProviderId === 'openai' ? provider.apiKey : undefined,
        geminiApiKey: selectedProviderId === 'google' ? provider.apiKey : undefined,
        customBaseUrl: needsCustomParams ? provider.baseUrl : undefined,
        customModelId: needsCustomParams ? (provider.defaultModel || provider.models?.[0]?.id) : undefined,
        customApiKey: needsCustomParams ? provider.apiKey : undefined,
      })
    }
  }
}
```

## 用户体验

### 场景 1: 当前实例配置了多个 Provider

**用户操作**:
1. 点击"创建新实例"
2. 看到复用模式默认选中，下拉列表显示所有已配置的 providers
3. 下拉列表显示：
   - Anthropic (Claude) - API key: sk-ant-•••• · claude-sonnet-4-5
   - OpenAI (GPT) - API key: sk-proj-•••• · gpt-4o
   - Google (Gemini) - API key: AIzaSy•••• · gemini-2.5-pro
4. 选择想要复用的 provider（比如 OpenAI）
5. 点击"创建"
6. **结果**: 新实例使用 OpenAI 配置，立即可用 ✅

**优点**:
- 清楚看到所有可用配置
- 灵活选择要复用哪个
- API key 脱敏显示，安全又清晰

### 场景 2: 当前实例只配置了一个 Provider

**用户操作**:
1. 点击"创建新实例"
2. 看到复用模式默认选中
3. 下拉列表只有一个选项（自动选中）：
   - Anthropic (Claude) - API key: sk-ant-•••• · claude-sonnet-4-5
4. 点击"创建"
5. **结果**: 新实例使用 Anthropic 配置，立即可用 ✅

**优点**:
- 仍然显示配置详情，用户确认无误
- 一键创建，简单快速

### 场景 3: 需要使用不同的配置

**用户操作**:
1. 当前实例配置了 Anthropic 和 OpenAI
2. 但想为新实例配置 Google Gemini
3. 选择"手动配置"
4. 选择 Google，输入 API key
5. 点击"创建"
6. **结果**: 新实例使用 Google 配置 ✅

## 显示信息说明

### API Key 脱敏规则

```typescript
API key: {cp.apiKey.slice(0, 8)}••••
```

- 显示前 8 个字符
- 后面用 `••••` 替代
- 例如: `sk-ant-api03-AbCdEf1234...` → `sk-ant-a••••`

### 模型 ID 显示

```typescript
{cp.model && ` · ${cp.model}`}
```

- 如果配置了模型，显示在 API key 后面
- 用 ` · ` 分隔
- 例如: `API key: sk-ant-•••• · claude-sonnet-4-5`

### Provider 名称

使用 `PROVIDERS` 常量中定义的友好名称：
- `anthropic` → `Anthropic (Claude)`
- `openai` → `OpenAI (GPT)`
- `google` → `Google (Gemini)`

## 智能默认选择

### 1. 自动选择第一个配置

```typescript
// Auto-select first configured provider
if (hasCurrentConfig && !inheritProviderId) {
  setInheritProviderId(configuredProviders[0].id)
}
```

### 2. 模式默认选择逻辑

- 有配置 → 默认选择"复用配置"
- 无配置 → 自动切换到"手动配置"（复用选项禁用）

## 修改的文件

- ✅ `src/components/CreateOpenClawInstanceDialog.tsx`
  - 添加 `configuredProviders` 列表
  - 添加 `inheritProviderId` 状态
  - 添加下拉列表组件
  - 自动选择第一个配置

- ✅ `src/stores/appStore.ts`
  - 扩展 `createOpenClawInstance` 参数，添加 `inheritProviderId`
  - 根据选中的 provider ID 复制配置
  - 支持复制所有 provider 类型（native 和 custom）

- ✅ `src/locales/zh/createInstance.json`
  - 更新描述文案："选择要复用的 provider 配置"
  - 添加："选择要复用的配置"

- ✅ `src/locales/en/createInstance.json`
  - 更新描述文案："Select a provider configuration to copy"
  - 添加："Select configuration to copy"

## 测试场景

### 测试 1: 多配置选择

**前置条件**: 当前实例配置了 Anthropic、OpenAI、Google

**步骤**:
1. 打开创建实例对话框
2. 验证下拉列表显示 3 个选项
3. 验证每个选项显示正确的名称、API key 前缀、模型
4. 选择 OpenAI
5. 点击创建
6. 验证新实例使用 OpenAI 配置

**预期**: ✅ 新实例配置 OpenAI，可以立即对话

### 测试 2: 单配置自动选择

**前置条件**: 当前实例只配置了 Anthropic

**步骤**:
1. 打开创建实例对话框
2. 验证下拉列表只有 1 个选项
3. 验证自动选中 Anthropic
4. 点击创建

**预期**: ✅ 新实例配置 Anthropic，无需手动选择

### 测试 3: 无配置时的降级

**前置条件**: 当前实例未配置任何 provider

**步骤**:
1. 打开创建实例对话框
2. 验证"复用配置"选项禁用
3. 验证自动选择"手动配置"
4. 填写配置创建

**预期**: ✅ 正确降级到手动模式

### 测试 4: API Key 脱敏

**验证点**:
- API key 只显示前 8 个字符
- 后面显示 `••••`
- 不同长度的 API key 都正确处理

### 测试 5: 切换模式

**步骤**:
1. 选择"复用配置"，选择 Anthropic
2. 切换到"手动配置"
3. 再切换回"复用配置"
4. 验证之前的选择保持

**预期**: ✅ 状态正确保持

## 与之前版本的对比

### Before（单选 + 自动选第一个）
```
问题：
- 看不到有哪些配置可用
- 无法选择要复用哪个
- 多个配置时用户困惑
```

### After（下拉列表 + 手动选择）
```
优点：
✅ 清楚显示所有可用配置
✅ 灵活选择要复用的 provider
✅ 显示关键信息（API key 前缀、模型）
✅ 支持 1 个或多个配置
✅ 安全（API key 脱敏）
```

## 总结

现在的实现完美支持：

1. **多配置场景** - 下拉列表展示所有已配置的 providers
2. **灵活选择** - 用户自主选择要复用哪个配置
3. **信息清晰** - 显示 provider 名称、API key 前缀、模型 ID
4. **安全性** - API key 脱敏显示
5. **智能默认** - 自动选择第一个配置，减少操作步骤
6. **优雅降级** - 无配置时自动切换到手动模式

用户体验大幅提升！✨
