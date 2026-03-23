//! Team metadata: `{instance root}/team/{instance}.json`
//! Instance-level skill `skills/pond-team/`: matches OpenClaw; shared by agents in this instance (workspace skills with the same name can override).

use fs4::fs_std::FileExt;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};

use crate::commands::config;

/// Pond client: Team Leader maps to `agents.list` id (same as frontend `TEAM_LEADER_AGENT_ID`).
pub const POND_LEADER_AGENT_ID: &str = "main";

/// Bundled collaboration skill: `{instance root}/skills/pond-team/SKILL.md`
const BUNDLED_TEAM_SKILL_ID: &str = "pond-team";
const BUNDLED_TEAM_SKILL_MD: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/bundled_skills/pond-team/SKILL.md"
));

const LEGACY_PATHS_FILE: &str = "POND_TEAM_PATHS.md";
const LEGACY_SNAPSHOT: &str = "POND_TEAM_SNAPSHOT.md";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TeamMetaMember {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TeamMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_agent_id: Option<String>,
    #[serde(default)]
    pub members: Vec<TeamMetaMember>,
}

fn team_space_has_data(instance_id: &str) -> Result<bool, String> {
    let meta = crate::utils::paths::team_meta_json_path(instance_id).map_err(|e| e.to_string())?;
    if meta.exists() {
        return Ok(true);
    }
    let tasks = crate::utils::paths::team_tasks_json_path(instance_id).map_err(|e| e.to_string())?;
    Ok(tasks.exists())
}

/// Write `skills/pond-team/SKILL.md` from bundled template (relative paths only; no absolute host paths).
pub fn sync_pond_team_skill_artifacts(instance_id: &str) -> Result<(), String> {
    let inst = instance_id.trim();
    if inst.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }

    let dir = crate::utils::paths::skills_dir(Some(inst)).map_err(|e| e.to_string())?;
    let skill_dir = dir.join(BUNDLED_TEAM_SKILL_ID);
    std::fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能目录失败: {e}"))?;

    let legacy_snapshot = skill_dir.join(LEGACY_SNAPSHOT);
    if legacy_snapshot.exists() {
        let _ = std::fs::remove_file(&legacy_snapshot);
    }
    let legacy_paths = skill_dir.join(LEGACY_PATHS_FILE);
    if legacy_paths.exists() {
        let _ = std::fs::remove_file(&legacy_paths);
    }

    std::fs::write(skill_dir.join("SKILL.md"), BUNDLED_TEAM_SKILL_MD)
        .map_err(|e| format!("写入协作技能 pond-team 失败: {e}"))?;

    Ok(())
}

/// If team metadata or task file exists, sync skill (for config save and task changes).
pub fn sync_pond_team_skill_artifacts_if_initialized(instance_id: &str) -> Result<(), String> {
    if !team_space_has_data(instance_id.trim())? {
        return Ok(());
    }
    sync_pond_team_skill_artifacts(instance_id.trim())
}

fn load_team_meta_disk(instance_id: &str) -> Result<TeamMeta, String> {
    let path = crate::utils::paths::team_meta_json_path(instance_id).map_err(|e| e.to_string())?;
    if !path.exists() {
        return Ok(TeamMeta::default());
    }
    let file = OpenOptions::new()
        .read(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.lock_exclusive()
        .map_err(|e| format!("团队元数据文件锁定失败: {e}"))?;
    let mut content = String::new();
    (&file)
        .read_to_string(&mut content)
        .map_err(|e| e.to_string())?;
    let meta: TeamMeta = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(meta)
}

/// Read team metadata for the current instance (Pond side).
#[tauri::command]
pub fn read_team_meta(instance_id: String) -> Result<TeamMeta, String> {
    load_team_meta_disk(instance_id.trim())
}

/// Overwrite `members` from current `openclaw.json` `agents.list` (keep display name/role per id); set `leader_agent_id` to `main` when present.
#[tauri::command]
pub fn sync_team_meta_members_from_agents(instance_id: String) -> Result<bool, String> {
    let inst = instance_id.trim();
    if !team_space_has_data(inst)? {
        return Ok(false);
    }
    let cfg = config::load_openclaw_config_for_instance(instance_id.clone())?;
    let agent_ids = config::get_agent_ids(&cfg);
    if agent_ids.is_empty() {
        return Ok(false);
    }
    let mut meta = load_team_meta_disk(inst)?;
    let old = std::mem::take(&mut meta.members);
    meta.members = agent_ids
        .iter()
        .map(|id| {
            old
                .iter()
                .find(|m| m.agent_id == *id)
                .cloned()
                .unwrap_or(TeamMetaMember {
                    agent_id: id.clone(),
                    display_name: None,
                    role: None,
                })
        })
        .collect();
    meta.leader_agent_id = agent_ids
        .iter()
        .any(|id| id == POND_LEADER_AGENT_ID)
        .then(|| POND_LEADER_AGENT_ID.to_string());
    save_team_meta(instance_id, meta)?;
    Ok(true)
}

/// Whether team data exists under `team/` (metadata or task file).
#[tauri::command]
pub fn is_team_space_initialized(instance_id: String) -> Result<bool, String> {
    team_space_has_data(instance_id.trim())
}

/// Persist team metadata for the current instance.
#[tauri::command]
pub fn save_team_meta(instance_id: String, meta: TeamMeta) -> Result<(), String> {
    let inst = instance_id.trim();
    if inst.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let path = crate::utils::paths::team_meta_json_path(inst).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.lock_exclusive()
        .map_err(|e| format!("团队元数据文件锁定失败: {e}"))?;
    let content = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    file.set_len(0).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    sync_pond_team_skill_artifacts(inst)?;
    Ok(())
}
