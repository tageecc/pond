# Anti-Confusion Strategy Summary

## 🛡️ Four-Layer Defense

### Layer 1: Type System (Strongest)
**Rust**: `src-tauri/src/types/ids.rs` - Newtype pattern
**TypeScript**: `src/types/branded.ts` - Branded types
**Effect**: Compiler rejects mixing Instance IDs with Agent IDs

### Layer 2: Naming Conventions
**File**: `.cursor/rules/naming-conventions.md`
**Effect**: Clear, explicit names (`instance_id` not `id`)

### Layer 3: Code Rules
**Files**:
- `.cursor/rules/type-safety-ids.md` - Usage guidelines
- `.cursor/rules/no-agent-id-as-instance-id.md` - Historical context
- `.cursor/rules/no-env-vars.md` - CLI patterns

### Layer 4: Automated Testing
**File**: `.cursor/rules/testing-strategies.md`
**Effect**: Catch bugs in CI/CD before production

## 📚 Quick Reference

**Instance ID**: Identifies Pond instance → `~/.openclaw/` or `~/.openclaw-{id}/`
**Agent ID**: Identifies role within instance → `agents.list[].id` (e.g., "main")

## ✅ Use This Checklist

When writing code that handles IDs:
1. [ ] Using typed IDs (`InstanceId`/`AgentId`), not plain strings?
2. [ ] Function names clearly indicate ID type?
3. [ ] No mixing of the two concepts?
4. [ ] Added tests to verify correctness?
5. [ ] TypeScript types match Rust function signatures?
