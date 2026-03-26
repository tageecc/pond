# Naming Conventions - Prevent Concept Confusion

## 🎯 Core Principle

**Names must be precise and unambiguous. When in doubt, be explicit.**

## 📝 ID Naming Standards

### Variable Names

| Concept | Type | Variable Name | ❌ Don't Use |
|---------|------|--------------|-------------|
| Pond Instance | `InstanceId` | `instance_id`, `instanceId` | `id`, `agent_id`, `key` |
| OpenClaw Agent | `AgentId` | `agent_id`, `agentId` | `id`, `instance_id`, `role` |
| Any ID | `String` | ❌ **Avoid** - be specific! | `id`, `key` |

### Function Names

Functions should clearly indicate what type of ID they operate on:

```rust
// ✅ Good - clear about ID type
pub fn start_instance_gateway(instance_id: InstanceId) { ... }
pub fn get_agent_config(instance_id: InstanceId, agent_id: AgentId) { ... }
pub fn list_instance_ids() -> Vec<InstanceId> { ... }

// ❌ Bad - ambiguous
pub fn start_gateway(id: String) { ... }
pub fn get_config(id: String) { ... }
pub fn list_ids() -> Vec<String> { ... }
```

### Parameter Names

When a function takes multiple IDs, disambiguate clearly:

```rust
// ✅ Explicit
pub fn configure_agent(
    instance_id: InstanceId,  // Which instance?
    agent_id: AgentId,         // Which agent within that instance?
    config: Config
) { ... }

// ❌ Confusing
pub fn configure_agent(
    id1: String,  // Which is which?
    id2: String,
    config: Config
) { ... }
```

## 🗂️ Directory Structure Naming

Match code concepts to file system layout:

```
~/.openclaw/              ← InstanceId "default"
~/.openclaw-work/         ← InstanceId "work"
~/.openclaw/agents/main/  ← AgentId "main" in instance "default"
```

**Rule**: Instance IDs map to directories, Agent IDs map to subdirectories.

## 🏷️ Type Aliases - Use Sparingly

Type aliases can hide the real type:

```typescript
// ❌ Bad - loses type information
type Id = string
function process(id: Id) { ... }

// ✅ Good - explicit type
function process(instanceId: InstanceId) { ... }
```

**Rule**: Only use type aliases when the underlying type truly doesn't matter.

## 📐 Collection Naming

Pluralize appropriately and indicate content type:

```rust
// ✅ Clear - collections of specific types
let instance_ids: Vec<InstanceId> = ...
let agent_ids: HashSet<AgentId> = ...
let instance_to_agents: HashMap<InstanceId, Vec<AgentId>> = ...

// ❌ Unclear
let ids: Vec<String> = ...  // IDs of what?
let items: HashSet<String> = ...
let mapping: HashMap<String, Vec<String>> = ...
```

## 🔤 Abbreviations - Avoid When Ambiguous

| Abbreviation | Meaning | Use Instead |
|--------------|---------|-------------|
| `id` | Instance? Agent? | `instance_id` or `agent_id` |
| `key` | Instance? Agent? | Be specific |
| `agent` | ID or full object? | `agent_id` or `agent_config` |

**Rule**: If an abbreviation could mean two different things, spell it out.

## 🎨 Hungarian Notation - Use for Disambiguation

When type system isn't enough, prefix to clarify:

```rust
// In functions with many IDs
let inst_id = InstanceId::new("default");
let agent_id = AgentId::new("main");
let src_inst = InstanceId::new("source");
let dst_inst = InstanceId::new("destination");
```

**Rule**: Only use prefixes when there are multiple IDs of the same type.

## 📖 Comments - When Names Aren't Enough

If a name could still be ambiguous, add a comment:

```rust
/// Get the default agent ID for a given instance
///
/// # Arguments
/// * `instance_id` - The Pond instance (e.g., "default", "work")
///
/// # Returns
/// The ID of the first agent in that instance's agents.list (typically "main")
pub fn get_default_agent_id_for_instance(
    instance_id: InstanceId
) -> Result<AgentId, String> { ... }
```

## 🚫 Anti-Patterns

### ❌ Generic "key" or "id"

```rust
// BAD
fn resolve_key(id: &Option<String>) -> String
```

### ❌ Using one concept's name for another

```rust
// BAD - agent_key is actually an instance ID
let agent_key = "default";
paths::instance_home(agent_key)
```

### ❌ Reusing variable names

```rust
// BAD - id changes meaning
let id = instance_id.as_str();
let id = AgentId::new(id);  // Confusing!
```

## ✅ Best Practices

1. **Be explicit**: Use full names like `instance_id`, not `id`
2. **Be consistent**: Same name pattern across codebase
3. **Match domain**: Use Pond/OpenClaw terminology
4. **Add types**: Use `InstanceId` and `AgentId` types
5. **Comment edge cases**: Explain non-obvious conversions

## 🔍 Code Review Questions

When reviewing code:
- Can you tell what type of ID each variable holds?
- Are function names clear about what they operate on?
- Would a new developer understand the difference?
- Are conversions between types explicit and justified?
