# Pond Instance ID vs OpenClaw Agent ID

## Critical Distinction

**NEVER confuse instance IDs with agent IDs:**

- **Instance ID** (Pond concept): `"default"`, `"abc123"`, etc. Used for `~/.openclaw/` vs `~/.openclaw-{id}/` directories
- **Agent ID** (OpenClaw concept): `"main"`, `"researcher"`, etc. Defined in `agents.list[].id` within an instance's config

## Rule

**NEVER use `getAgentIds(openclawConfig)` as a fallback for instance IDs.**

```typescript
// ❌ WRONG - Uses agent IDs as instance IDs
const instances = instanceIds.length > 0 
  ? instanceIds 
  : getAgentIds(openclawConfig) // Returns ["main"] - WRONG!

// ✅ CORRECT - Always use instanceIds or default
const instances = instanceIds.length > 0 
  ? instanceIds 
  : ["default"]
```

## Why This Matters

When agent ID `"main"` is used as an instance ID:
1. Code calls `paths::instance_home("main")`
2. Returns `~/.openclaw-main/` (thinking it's a secondary instance)
3. Functions try to access `~/.openclaw-main/workspace/IDENTITY.md`
4. OpenClaw CLI may create the directory structure

**Result: Unwanted `~/.openclaw-main/` directory is created!**

## Historical Bug

This bug existed in:
- `AgentView.tsx:279`
- `Dashboard.tsx:162`, `Dashboard.tsx:192`
- `pondInstanceId.ts:8`

All fixed by removing `getAgentIds` fallback and using `["default"]` instead.

## See Also

- `.cursor/rules/no-env-vars.md` - OpenClaw CLI flag rules
- `src-tauri/src/utils/paths.rs` - Instance directory logic
