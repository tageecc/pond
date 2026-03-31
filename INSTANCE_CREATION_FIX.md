# Instance Creation Flow Fix

## 问题

用户反馈创建新实例时存在两个严重问题：

1. **创建流程缺失配置引导**：创建新实例时没有要求用户填写 provider 和 API key
2. **对话卡住无提示**：没有配置 API key 时，发送消息会一直 loading，没有任何错误提示

## 根本原因

### 1. 创建实例流程
```typescript
// Before
createOpenClawInstance: async () => {
  // ...
  await invoke('run_openclaw_agents_add', { agentId: id })
  await get().loadConfigs()
  await get().switchInstance(id, true)
  toast.success('实例已就绪')  // ❌ 即使没配置也显示成功
}
```

### 2. 对话发送检查
```typescript
// Before
const handleSend = useCallback(async () => {
  if (!canSend) {  // ❌ 只检查 gateway 是否运行
    updateChatSession(chatStoreKey, {
      error: i18n.t("chat.startGatewayFirst"),
    });
    return;
  }
  // 直接发送消息，没有检查 API key
}
```

## 解决方案

### 1. 创建实例后检测配置状态

**修改**: `src/stores/appStore.ts`

```typescript
createOpenClawInstance: async () => {
  // ...
  await invoke('run_openclaw_agents_add', { agentId: id })
  await get().loadConfigs()
  await get().switchInstance(id, true)
  
  // ✅ 检查新实例是否配置了 API key
  const config = get().openclawConfig
  if (!hasConfiguredModelFromConfig(config)) {
    toast.warning(i18n.t('toast.instanceCreatedNeedsConfig'), {
      id: toastId,
      description: i18n.t('toast.pleaseConfigureApiKey'),
      duration: 5000,
    })
  } else {
    toast.success(i18n.t('toast.instanceReady'), {
      id: toastId,
      description: i18n.t('toast.createInstanceSuccessHint'),
    })
  }
}
```

### 2. 发送消息前检查 API key

**修改**: `src/components/ChatView.tsx`

```typescript
const handleSend = useCallback(async () => {
  const text = input.trim();
  if (!text || sending) return;
  
  // Check if gateway is running
  if (!canSend) {
    updateChatSession(chatStoreKey, {
      error: i18n.t("chat.startGatewayFirst"),
    });
    return;
  }
  
  // ✅ Check if API key is configured
  const currentConfig = useAppStore.getState().openclawConfig;
  if (!currentConfig || !currentConfig.models?.providers || Object.keys(currentConfig.models.providers).length === 0) {
    updateChatSession(chatStoreKey, {
      error: i18n.t("chat.noApiKeyConfigured"),
    });
    return;
  }
  
  // ✅ Check if any provider has valid API key
  const hasValidKey = Object.values(currentConfig.models.providers).some(
    (provider) => provider?.apiKey && provider.apiKey.trim().length > 0
  );
  if (!hasValidKey) {
    updateChatSession(chatStoreKey, {
      error: i18n.t("chat.noApiKeyConfigured"),
    });
    return;
  }
  
  // 继续发送消息...
}
```

### 3. 添加 i18n 翻译

**中文** (`src/locales/zh/toast.json`):
```json
{
  "instanceCreatedNeedsConfig": "实例已创建",
  "pleaseConfigureApiKey": "请先在右侧配置页面设置 API key 后再开始对话"
}
```

**中文** (`src/locales/zh/chat.json`):
```json
{
  "noApiKeyConfigured": "请先在右侧配置页面设置 API key 后再开始对话"
}
```

**英文** (`src/locales/en/toast.json`):
```json
{
  "instanceCreatedNeedsConfig": "Instance created",
  "pleaseConfigureApiKey": "Please configure your API key in the settings panel before chatting"
}
```

**英文** (`src/locales/en/chat.json`):
```json
{
  "noApiKeyConfigured": "Please configure your API key in the settings panel before chatting"
}
```

## 用户体验改进

### Before
1. 创建实例 → 显示"实例已就绪" → 用户尝试对话 → 一直 loading 无响应 ❌
2. 用户困惑：不知道为什么卡住，没有任何错误提示 ❌

### After
1. 创建实例 → 检测没有配置 → 显示警告 toast："实例已创建，请先在右侧配置页面设置 API key 后再开始对话" ✅
2. 用户尝试对话 → 立即显示友好的错误提示："请先在右侧配置页面设置 API key 后再开始对话" ✅
3. 用户明确知道需要先配置 API key ✅

## 测试场景

### 场景 1: 创建新实例（无配置）
1. 点击"创建新实例"
2. **预期**: 显示警告 toast，提示需要配置 API key
3. 尝试发送消息
4. **预期**: 立即显示错误提示，不会一直 loading

### 场景 2: 创建新实例（已有 default 配置）
1. Default 实例已配置 API key
2. 创建新实例
3. **预期**: 新实例没有继承配置，仍显示警告
4. 需要为新实例单独配置

### 场景 3: 切换到未配置的实例
1. 切换到没有配置 API key 的实例
2. 尝试发送消息
3. **预期**: 显示错误提示，引导用户配置

## 文件修改清单

- ✅ `src/stores/appStore.ts` - 创建实例后检测配置状态
- ✅ `src/components/ChatView.tsx` - 发送消息前检查 API key
- ✅ `src/locales/zh/toast.json` - 添加中文提示
- ✅ `src/locales/en/toast.json` - 添加英文提示
- ✅ `src/locales/zh/chat.json` - 添加中文错误提示
- ✅ `src/locales/en/chat.json` - 添加英文错误提示

## 后续改进建议

### 1. 创建实例时的配置向导（可选）
可以考虑在创建实例时，直接弹出配置向导，引导用户填写：
- Provider 选择
- API key 输入
- Model ID（可选）

### 2. 首次使用引导
对于新创建的实例，可以在右侧显示一个引导面板，突出显示"模型配置"选项，帮助用户快速完成配置。

### 3. 配置状态指示器
在实例列表中显示配置状态（如图标或颜色），让用户一眼看出哪些实例已配置，哪些还需要配置。

## 验证

运行以下命令验证无编译错误：
```bash
cd /Users/tagecc/Documents/workspace/pond
pnpm lint
pnpm tauri:dev
```

测试步骤：
1. 创建新实例，观察 toast 提示
2. 不配置 API key，尝试发送消息，观察错误提示
3. 配置 API key，确认可以正常对话
