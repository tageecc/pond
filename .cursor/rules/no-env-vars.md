# Pond Instance Management Rules

## Instance CLI Flags Policy

**CRITICAL: Never use environment variables for OpenClaw instance scoping.**

### Rules

1. **Default instance** (`instance_id` is empty or `"default"`, case-insensitive):
   - **DO NOT** use `--profile` flag
   - **DO NOT** set environment variables
   - Let OpenClaw naturally use `~/.openclaw` directory

2. **Non-default instances** (`instance_id` is any other value):
   - **MUST** use `--profile <instance_id>` as a **global flag BEFORE subcommand**
   - **DO NOT** use environment variables
   - Correct order: `openclaw --profile <id> subcommand ...`

### Implementation

```rust
// Correct: --profile must come BEFORE subcommand (it's a global flag)
fn build_cli_args_with_profile<'a>(instance_id: &'a str, subargs: &'a [&'a str]) -> Vec<&'a str> {
    let k = instance_id.trim();
    let mut args = Vec::new();
    if !k.is_empty() && !k.eq_ignore_ascii_case("default") {
        args.push("--profile");
        args.push(k);
    }
    args.extend_from_slice(subargs);  // subcommand comes AFTER --profile
    args
}

// Example usage:
// openclaw --profile abc12 setup --workspace xxx  ✅ Correct
// openclaw setup --workspace xxx --profile abc12  ❌ Wrong (profile ignored!)
```

### Why

- Environment variables can interfere with OpenClaw's natural behavior
- User has explicitly requested this restriction multiple times
- Using `--profile` for non-default instances is sufficient and clean
- Default instance should use standard `~/.openclaw` without any override

## Agent Creation Policy

**CRITICAL: Never automatically create agents via `openclaw agents add`.**

### Rules

1. **DO NOT** call `openclaw agents add` automatically when:
   - Creating a new instance
   - Starting Gateway
   - Saving configuration
   - Importing configuration

2. **DO NOT** call `sync_agents_list_with_openclaw_cli` automatically

3. Let users manually manage agents through OpenClaw CLI or Pond UI

### Why

- User wants explicit control over agent creation
- Automatic `openclaw agents add main` causes unwanted `~/.openclaw-main` directory
- Agent creation should be user-initiated, not system-initiated
- Agents declared in `agents.list` config are automatically recognized by OpenClaw CLI without needing `openclaw agents add`

## Historical Issue: `~/.openclaw-main` Directory

If you see a `~/.openclaw-main` directory alongside `~/.openclaw`:
- This was created by a bug in older versions where `--profile` was placed AFTER the subcommand
- OpenClaw ignored the misplaced `--profile` flag and operated on `~/.openclaw` instead
- When it saw `agents.list: [{ id: "main" }]` in the config, it created `.openclaw-main` as a profile directory
- **Safe to delete**: `rm -rf ~/.openclaw-main`
- The correct agent directory is in `~/.openclaw/agents/main/` (NOT `.openclaw-main`)

### How the Bug Happened

```bash
# ❌ Old buggy code:
openclaw setup --workspace xxx --profile abc12
# Result: --profile ignored, operated on ~/.openclaw, created ~/.openclaw-main

# ✅ Fixed code:
openclaw --profile abc12 setup --workspace xxx
# Result: correctly operates on ~/.openclaw-abc12
```
