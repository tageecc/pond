/// Type-safe ID wrappers to prevent mixing up Instance IDs and Agent IDs
/// 
/// This module uses newtype pattern to create distinct types that cannot be confused
/// at compile time. The compiler will reject any attempt to pass an AgentId where
/// an InstanceId is expected, and vice versa.

use serde::{Deserialize, Serialize};

/// OpenClaw / ClawTeam instance ID (e.g., "default", "abc123")
/// Maps to directory: ~/.openclaw/ or ~/.openclaw-{id}/
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct InstanceId(String);

impl InstanceId {
    pub fn new(id: impl Into<String>) -> Self {
        let id = id.into();
        Self(if id.trim().is_empty() { "default".to_string() } else { id })
    }
    
    pub fn as_str(&self) -> &str {
        &self.0
    }
    
    pub fn is_default(&self) -> bool {
        self.0.eq_ignore_ascii_case("default")
    }
}

impl Default for InstanceId {
    fn default() -> Self {
        Self("default".to_string())
    }
}

impl From<String> for InstanceId {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}

impl From<&str> for InstanceId {
    fn from(s: &str) -> Self {
        Self::new(s)
    }
}

impl From<Option<String>> for InstanceId {
    fn from(opt: Option<String>) -> Self {
        opt.map(Self::new).unwrap_or_default()
    }
}

impl AsRef<str> for InstanceId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// OpenClaw agent/role ID (e.g., "main", "researcher")
/// Defined in agents.list[].id within an instance's config
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AgentId(String);

impl AgentId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }
    
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for AgentId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for AgentId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl AsRef<str> for AgentId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_id_default() {
        assert_eq!(InstanceId::new("").as_str(), "default");
        assert_eq!(InstanceId::new("  ").as_str(), "default");
        assert_eq!(InstanceId::default().as_str(), "default");
    }

    #[test]
    fn instance_id_custom() {
        assert_eq!(InstanceId::new("abc123").as_str(), "abc123");
    }

    #[test]
    fn agent_id_creation() {
        assert_eq!(AgentId::new("main").as_str(), "main");
        assert_eq!(AgentId::from("researcher").as_str(), "researcher");
    }

    // This test would fail to compile - that's the point!
    // fn cannot_mix_types() {
    //     let instance: InstanceId = InstanceId::new("default");
    //     let agent: AgentId = instance; // ❌ Compile error!
    // }
}
