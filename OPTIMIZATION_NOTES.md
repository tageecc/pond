# Onboarding Performance Optimization

## Problem Analysis

### Original Issue
- Onboarding taking ~60 seconds to complete
- Root cause: Multiple OpenClaw CLI process spawns for skill synchronization

### Performance Bottleneck Details

1. **Old Flow**: `completeOnboarding` → `save_openclaw_config_for_instance` → `merge_write_openclaw_config`
   - First-time save triggers `skills_changed = true` (old_config is None)
   - Calls `sync_skills_disabled_with_openclaw_cli`
   - Runs `openclaw skills list --json` (1 full CLI process)
   - For each skill (e.g., 50 skills): runs `openclaw config set/unset` (50 CLI processes)
   - Each CLI call = Node.js cold start + OpenClaw module loading
   - **Total time**: ~50-60 seconds (50 skills × ~1s per CLI call)

## Solution Implemented

### Changes Made

#### 1. Extended Rust Backend (`src-tauri/src/commands/workspace.rs`)

Enhanced `run_openclaw_onboard_non_interactive` to support:
- `gemini_api_key` parameter
- `custom_base_url` parameter
- `custom_model_id` parameter
- `custom_api_key` parameter

This allows one-shot initialization via `openclaw onboard --non-interactive` for all provider types.

#### 2. Refactored Frontend (`src/stores/appStore.ts`)

Replaced manual config writing with direct `onboard` call:

**Before**:
```typescript
// Build config manually
const nextConfig = buildAgentsAndModelsFromProvider(...)
await invoke('save_openclaw_config_for_instance', { config: nextConfig })
await ensureInstanceSetup('default')
```

**After**:
```typescript
// Use OpenClaw's official onboard command
await invoke('run_openclaw_onboard_non_interactive', {
  instanceId: 'default',
  authChoice: 'openai-api-key',
  openaiApiKey: key,
  // ... other params
})
```

### Performance Improvements

- **Eliminated**: N CLI calls for skill synchronization (N = number of skills)
- **Reduced to**: 1 CLI call via `openclaw onboard --non-interactive`
- **Expected speedup**: ~60s → ~5-10s (6-12x faster)

## Benefits

1. **Official Workflow**: Uses OpenClaw's designed onboarding flow
2. **Atomic Operation**: All initialization happens in one command
3. **No Race Conditions**: Avoids manual merge/sync logic
4. **Future-Proof**: Automatically supports new OpenClaw features

## Provider Mapping

The implementation maps Pond's provider IDs to OpenClaw's `--auth-choice` values:

| Provider | Auth Choice | Notes |
|----------|-------------|-------|
| anthropic | `anthropic-api-key` | Direct support |
| openai | `openai-api-key` | Direct support |
| google | `gemini-api-key` | Direct support |
| deepseek | `custom-api-key` | Via custom params |
| xai | `xai-api-key` | Direct support |
| mistral | `mistral-api-key` | Direct support |
| (others) | `custom-api-key` | Via custom params |

## Testing Recommendations

### Test Cases

1. **Fresh Onboarding - Major Providers**
   - [ ] OpenAI with API key
   - [ ] Anthropic with API key
   - [ ] Google Gemini with API key

2. **Fresh Onboarding - Custom Providers**
   - [ ] DeepSeek (custom params)
   - [ ] Groq (custom params)
   - [ ] Ollama (local, custom params)

3. **Performance Verification**
   - [ ] Measure time from "Complete" click to dashboard
   - [ ] Should complete in <10 seconds
   - [ ] Check Gateway starts successfully

4. **Edge Cases**
   - [ ] Invalid API key (should show error quickly)
   - [ ] Network timeout
   - [ ] Existing `default` instance (should handle gracefully)

### Test Script

```bash
# 1. Clean state
rm -rf ~/.openclaw

# 2. Start Pond
pnpm tauri:dev

# 3. Time the onboarding
# Click "Complete" and measure time to dashboard

# 4. Verify instance created
ls ~/.openclaw/openclaw.json
openclaw --profile default status
```

## Remaining Optimizations (Optional)

### Low Priority Items

1. **LoadSkills Background Loading**
   - Already implemented for `switchInstance(id, true)`
   - Could apply to more scenarios

2. **Gateway Startup**
   - Currently has 1.5s sleep in restart flow
   - Could be optimized with better health checks

3. **Config Validation**
   - Multiple `openclaw config validate` calls
   - Could batch or cache validation results

## Rollback Plan

If issues arise, revert to old flow by:

```typescript
// In completeOnboarding, replace onboard call with:
const config = get().openclawConfig ?? ({} as OpenClawConfig)
const { agents, models } = buildAgentsAndModelsFromProvider(...)
const nextConfig: OpenClawConfig = { ...config, agents, models }
await invoke('save_openclaw_config_for_instance', {
  instanceId: defaultId,
  config: nextConfig,
})
await get().ensureInstanceSetup('default')
```

## References

- [OpenClaw CLI Docs](https://docs.openclaw.ai/cli)
- [Onboarding Reference](https://docs.openclaw.ai/start/wizard-cli-reference)
- [CLI Automation](https://docs.openclaw.ai/start/wizard-cli-automation)
