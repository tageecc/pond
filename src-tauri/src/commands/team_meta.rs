//! Team metadata: `{instance root}/team/{instance}.json`
//! Instance-level skill `skills/clawteam-collab/`: matches OpenClaw; shared by agents in this instance (workspace skills with the same name can override).

use fs4::fs_std::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};

use crate::commands::config;

/// Team Leader role id in `agents.list` (same as frontend `TEAM_LEADER_AGENT_ID`).
pub const TEAM_LEADER_AGENT_ID: &str = "main";

/// Bundled collaboration skill: `{instance root}/skills/clawteam-collab/SKILL.md`
const BUNDLED_TEAM_SKILL_ID: &str = "clawteam-collab";
const BUNDLED_TEAM_SKILL_MD: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/bundled_skills/clawteam-collab/SKILL.md"
));

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TeamMetaMember {
    pub agent_id: String,
    /// Member display name (synced from agents.list[].name)
    pub name: String,
    /// Role description: what this agent does in the team
    pub role: String,
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

/// Write `skills/clawteam-collab/SKILL.md` from bundled template (relative paths only; no absolute host paths).
pub fn sync_team_collab_skill_artifacts(instance_id: &str) -> Result<(), String> {
    let inst = instance_id.trim();
    if inst.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }

    let dir = crate::utils::paths::skills_dir(Some(inst)).map_err(|e| e.to_string())?;
    let skill_dir = dir.join(BUNDLED_TEAM_SKILL_ID);
    std::fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能目录失败: {e}"))?;

    std::fs::write(skill_dir.join("SKILL.md"), BUNDLED_TEAM_SKILL_MD)
        .map_err(|e| format!("写入协作技能 clawteam-collab 失败: {e}"))?;

    Ok(())
}

/// If team metadata or task file exists, sync skill (for config save and task changes).
pub fn sync_team_collab_skill_artifacts_if_initialized(instance_id: &str) -> Result<(), String> {
    if !team_space_has_data(instance_id.trim())? {
        return Ok(());
    }
    sync_team_collab_skill_artifacts(instance_id.trim())
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

fn dedupe_preserve_order(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if seen.insert(id.clone()) {
            out.push(id);
        }
    }
    out
}

fn lookup_agent_name(agents_list: &[Value], id: &str) -> String {
    agents_list
        .iter()
        .find(|agent_val| {
            agent_val
                .get("id")
                .and_then(|i| i.as_str())
                .map(|s| s == id)
                .unwrap_or(false)
        })
        .and_then(|agent_val| agent_val.get("name"))
        .and_then(|name_val| name_val.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| id.to_string())
}

/// Build canonical team metadata from `openclaw.json` `agents.list` and merge role hints (`client` vs `old_disk`).
/// Returns `None` when `agents.list` has no ids (nothing to persist).
fn merge_team_meta_with_agents_list(
    instance_id: &str,
    client: &TeamMeta,
    old_disk: &TeamMeta,
) -> Result<Option<TeamMeta>, String> {
    let cfg = config::load_openclaw_config_for_instance(instance_id.to_string())?;
    let agent_ids = dedupe_preserve_order(config::get_agent_ids(&cfg));
    if agent_ids.is_empty() {
        return Ok(None);
    }

    let agents_list: Vec<Value> = cfg
        .agents
        .get("list")
        .and_then(|l| l.as_array())
        .cloned()
        .unwrap_or_default();

    let team_name = client.team_name.clone().or_else(|| old_disk.team_name.clone());

    let members: Vec<TeamMetaMember> = agent_ids
        .iter()
        .map(|id| {
            let name = lookup_agent_name(&agents_list, id);
            let role = client
                .members
                .iter()
                .find(|m| &m.agent_id == id)
                .map(|m| m.role.clone())
                .or_else(|| {
                    old_disk
                        .members
                        .iter()
                        .find(|m| &m.agent_id == id)
                        .map(|m| m.role.clone())
                })
                .unwrap_or_default();
            TeamMetaMember {
                agent_id: id.clone(),
                name,
                role,
            }
        })
        .collect();

    let leader_agent_id = agent_ids
        .iter()
        .any(|id| id == TEAM_LEADER_AGENT_ID)
        .then(|| TEAM_LEADER_AGENT_ID.to_string());

    Ok(Some(TeamMeta {
        team_name,
        leader_agent_id,
        members,
    }))
}

fn persist_team_meta(app_handle: &tauri::AppHandle, instance_id: &str, meta: &TeamMeta) -> Result<(), String> {
    let inst = instance_id.trim();
    if inst.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }

    let path = crate::utils::paths::team_meta_json_path(inst).map_err(|e| e.to_string())?;
    let is_first_time = !path.exists();

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
    let content = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    file.set_len(0).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;

    if is_first_time {
        ensure_team_file_access(app_handle, inst)?;
    }

    sync_team_collab_skill_artifacts(inst)?;
    Ok(())
}

/// Read team metadata for the current instance.
#[tauri::command]
pub fn read_team_meta(instance_id: String) -> Result<TeamMeta, String> {
    load_team_meta_disk(instance_id.trim())
}

/// Overwrite `members` from current `openclaw.json` `agents.list` (keep display name/role per id); set `leader_agent_id` to `main` when present.
#[tauri::command]
pub fn sync_team_meta_members_from_agents(
    app_handle: tauri::AppHandle,
    instance_id: String,
) -> Result<bool, String> {
    let inst = instance_id.trim();
    if !team_space_has_data(inst)? {
        return Ok(false);
    }
    let hint = load_team_meta_disk(inst)?;
    let Some(normalized) = merge_team_meta_with_agents_list(inst, &hint, &hint)? else {
        return Ok(false);
    };
    persist_team_meta(&app_handle, &instance_id, &normalized)?;
    Ok(true)
}

/// Whether team data exists under `team/` (metadata or task file).
#[tauri::command]
pub fn is_team_space_initialized(instance_id: String) -> Result<bool, String> {
    team_space_has_data(instance_id.trim())
}

/// Persist team metadata for the current instance. Members and leader are derived from `agents.list`; client payload only supplies role/name hints.
#[tauri::command]
pub fn save_team_meta(
    app_handle: tauri::AppHandle,
    instance_id: String,
    meta: TeamMeta,
) -> Result<(), String> {
    let inst = instance_id.trim();
    let old_disk = load_team_meta_disk(inst).unwrap_or_default();
    let Some(normalized) = merge_team_meta_with_agents_list(inst, &meta, &old_disk)? else {
        return Err("agents.list has no roles".to_string());
    };
    persist_team_meta(&app_handle, &instance_id, &normalized)
}

/// Configure file system permissions and session visibility for team collaboration (via OpenClaw CLI only).
fn ensure_team_file_access(app_handle: &tauri::AppHandle, instance_id: &str) -> Result<(), String> {
    use crate::commands::workspace;

    workspace::run_openclaw_config_set_strict_json_sync(
        app_handle,
        instance_id,
        "tools.fs.workspaceOnly",
        "false",
    )?;

    workspace::run_openclaw_config_set_strict_json_sync(
        app_handle,
        instance_id,
        "tools.sessions.visibility",
        "\"all\"",
    )
}
