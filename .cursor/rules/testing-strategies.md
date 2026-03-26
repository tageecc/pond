# Testing Strategies - Catch Concept Confusion Early

## 🎯 Goal

Catch ID confusion bugs before they reach production through targeted testing.

## 🧪 Unit Tests

### Test ID Type Constraints

```rust
#[cfg(test)]
mod id_type_tests {
    use super::*;
    use crate::types::ids::{InstanceId, AgentId};

    #[test]
    fn cannot_use_agent_id_as_instance_id() {
        // This test verifies that our type system prevents mixing
        // If this compiles, our type safety is broken!
        
        // let agent = AgentId::new("main");
        // let _ = paths::instance_home(agent);  // Should not compile
    }

    #[test]
    fn instance_id_normalization() {
        assert_eq!(InstanceId::new("").as_str(), "default");
        assert_eq!(InstanceId::new("  ").as_str(), "default");
        assert_eq!(InstanceId::new("Default").as_str(), "Default");
    }

    #[test]
    fn agent_id_preserves_value() {
        let id = AgentId::new("main");
        assert_eq!(id.as_str(), "main");
    }
}
```

### Test Directory Creation

```rust
#[test]
fn only_creates_instance_directories() {
    // Setup: clean environment
    let temp_home = create_temp_home();
    
    // Act: create default instance
    let instance = InstanceId::default();
    create_instance(&instance).unwrap();
    
    // Assert: only ~/.openclaw/ exists
    assert!(temp_home.join(".openclaw").exists());
    assert!(!temp_home.join(".openclaw-main").exists());
    assert!(!temp_home.join(".openclaw-default").exists());
    
    // Cleanup
    cleanup_temp_home(temp_home);
}
```

### Test Function Signatures

```rust
#[test]
fn gateway_functions_accept_instance_ids() {
    // Verify all gateway functions use InstanceId, not String
    let instance = InstanceId::new("test");
    
    // These should compile:
    let _ = start_gateway_impl(instance.clone());
    let _ = stop_gateway_impl(instance.clone());
    let _ = get_gateway_status(instance);
    
    // This should NOT compile:
    // let _ = start_gateway_impl("test");  // ❌
}
```

## 🔬 Integration Tests

### Test Instance-Agent Relationship

```rust
#[tokio::test]
async fn agent_belongs_to_instance() {
    let instance = InstanceId::new("test-instance");
    let agent = AgentId::new("main");
    
    // Setup instance
    create_instance(&instance).await.unwrap();
    add_agent_to_instance(&instance, &agent).await.unwrap();
    
    // Verify agent exists in correct location
    let agent_path = paths::agent_dir(&instance, &agent);
    assert!(agent_path.exists());
    
    // Verify agent doesn't create instance-level directory
    let home = std::env::home_dir().unwrap();
    assert!(!home.join(".openclaw-main").exists());
}
```

### Test CLI Argument Construction

```rust
#[test]
fn cli_args_use_correct_profile() {
    let default_inst = InstanceId::default();
    let custom_inst = InstanceId::new("custom");
    
    let default_args = build_cli_args(&default_inst, &["setup"]);
    let custom_args = build_cli_args(&custom_inst, &["setup"]);
    
    // Default instance: no --profile flag
    assert!(!default_args.contains(&"--profile"));
    
    // Custom instance: --profile before subcommand
    assert_eq!(custom_args[0], "--profile");
    assert_eq!(custom_args[1], "custom");
    assert_eq!(custom_args[2], "setup");
}
```

## 🎭 Property-Based Tests

Use property-based testing to verify invariants:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn instance_id_always_normalizes_empty(s in "\\s*") {
        let id = InstanceId::new(s);
        prop_assert_eq!(id.as_str(), "default");
    }
    
    #[test]
    fn agent_id_preserves_non_empty(s in "[a-zA-Z0-9_-]+") {
        let id = AgentId::new(&s);
        prop_assert_eq!(id.as_str(), s);
    }
    
    #[test]
    fn instance_dirs_match_ids(id in "[a-z]{3,10}") {
        let instance = InstanceId::new(&id);
        let path = paths::instance_home(&instance).unwrap();
        
        if instance.is_default() {
            prop_assert_eq!(path.file_name().unwrap(), ".openclaw");
        } else {
            let expected = format!(".openclaw-{}", id);
            prop_assert_eq!(path.file_name().unwrap(), expected.as_str());
        }
    }
}
```

## 📊 Regression Tests

Document and test previous bugs:

```rust
/// Regression test for issue #XXX
/// Previously, using agent ID "main" as instance ID created ~/.openclaw-main/
#[test]
fn does_not_create_openclaw_main_directory() {
    let temp_home = create_temp_home();
    
    // Setup: instance with agent "main"
    let instance = InstanceId::default();
    let agent = AgentId::new("main");
    
    create_instance_with_agent(&instance, &agent).unwrap();
    
    // Verify: no .openclaw-main directory
    assert!(!temp_home.join(".openclaw-main").exists());
    assert!(temp_home.join(".openclaw").exists());
    assert!(temp_home.join(".openclaw/agents/main").exists());
    
    cleanup_temp_home(temp_home);
}
```

## 🔄 TypeScript Tests

### Test Type Constraints

```typescript
import { InstanceId, AgentId, toInstanceId, toAgentId } from "@/types/branded"

describe("ID type safety", () => {
  it("prevents mixing instance and agent IDs", () => {
    const instance = toInstanceId("default")
    const agent = toAgentId("main")
    
    function takesInstance(id: InstanceId) {}
    function takesAgent(id: AgentId) {}
    
    takesInstance(instance) // ✅
    takesAgent(agent) // ✅
    
    // @ts-expect-error - Cannot pass AgentId where InstanceId expected
    takesInstance(agent)
    
    // @ts-expect-error - Cannot pass InstanceId where AgentId expected
    takesAgent(instance)
  })
  
  it("converts strings explicitly", () => {
    expect(() => toInstanceId("")).toThrow()
    expect(() => toInstanceId("  ")).toThrow()
    expect(toInstanceId("default")).toBe("default")
  })
})
```

### Test API Calls

```typescript
describe("Gateway API", () => {
  it("passes instance ID, not agent ID", async () => {
    const instanceId = toInstanceId("default")
    const agentId = toAgentId("main")
    
    // Correct: pass instance ID
    await invoke("start_gateway", { instanceId })
    
    // Incorrect: don't pass agent ID
    // @ts-expect-error - Type error prevents this
    await invoke("start_gateway", { instanceId: agentId })
  })
})
```

## 🎯 Test Coverage Goals

Aim for:
- **100%** coverage of ID conversion functions
- **100%** coverage of paths.rs (directory resolution)
- **90%+** coverage of gateway.rs (ID handling)
- **Property tests** for all ID normalizations

## 📋 Pre-Commit Checklist

Before committing ID-related changes:

- [ ] Added unit tests for new ID conversions
- [ ] Verified type constraints prevent mixing
- [ ] Tested directory creation doesn't create extra dirs
- [ ] Added regression test if fixing a bug
- [ ] Ran full test suite: `cargo test && pnpm test`

## 🚨 CI/CD Integration

Add to CI pipeline:

```yaml
test:
  - cargo test --all-features
  - cargo test --doc  # Test examples in docs
  - pnpm test
  - pnpm tsc --noEmit  # Type checking
```

## 🔍 Mutation Testing

Use mutation testing to verify test quality:

```bash
cargo install cargo-mutants
cargo mutants --in-place -- src/types/ids.rs
```

Tests should catch mutations in ID handling logic.
