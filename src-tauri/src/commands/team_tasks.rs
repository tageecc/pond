//! Team tasks: `{instance root}/team/{instance}_tasks.json`

use crate::commands::config;
use crate::commands::team_meta::{
    sync_team_collab_skill_artifacts_if_initialized, TEAM_LEADER_AGENT_ID,
};
use crate::commands::ws_gateway::spawn_team_task_notify;
use std::collections::HashSet;
use fs4::fs_std::FileExt;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamTask {
    pub id: String,
    pub title: String,
    /// open | claimed | done | failed
    pub status: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimed_by_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct TeamTasksFile {
    #[serde(default)]
    tasks: Vec<TeamTask>,
}

fn tasks_path(instance_id: &str) -> Result<PathBuf, String> {
    crate::utils::paths::team_tasks_json_path(instance_id).map_err(|e| e.to_string())
}

fn agent_ids_for_instance(instance_id: &str) -> Result<HashSet<String>, String> {
    let cfg = config::load_openclaw_config_for_instance(instance_id.trim().to_string())?;
    Ok(config::get_agent_ids(&cfg).into_iter().collect())
}

const TASK_STATUS_ALLOWED: &[&str] = &["open", "claimed", "done", "failed"];

fn with_tasks_file_mut<R, F>(instance_id: &str, f: F) -> Result<(R, bool), String>
where
    F: FnOnce(&mut TeamTasksFile) -> Result<(R, bool), String>,
{
    let path = tasks_path(instance_id)?;
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
        .map_err(|e| format!("任务文件锁定失败: {e}"))?;
    let mut content = String::new();
    (&file)
        .read_to_string(&mut content)
        .map_err(|e| e.to_string())?;
    let mut data: TeamTasksFile = if content.trim().is_empty() {
        TeamTasksFile::default()
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    };
    let (result, persist) = f(&mut data)?;
    if persist {
        let out = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
        file.set_len(0).map_err(|e| e.to_string())?;
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        file.write_all(out.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    Ok((result, persist))
}

fn with_tasks_file_read<R, F>(instance_id: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&TeamTasksFile) -> Result<R, String>,
{
    let path = tasks_path(instance_id)?;
    if !path.exists() {
        return f(&TeamTasksFile::default());
    }
    let file = OpenOptions::new()
        .read(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.lock_exclusive()
        .map_err(|e| format!("任务文件锁定失败: {e}"))?;
    let mut content = String::new();
    (&file)
        .read_to_string(&mut content)
        .map_err(|e| e.to_string())?;
    let data: TeamTasksFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    f(&data)
}

fn team_task_change_notify_message(instance_id: &str) -> String {
    let stem = crate::utils::paths::team_instance_filename_stem(instance_id);
    format!(
        "[ClawTeam] 团队任务列表已更新。请读取你 workspace 下的 team/{}_tasks.json（相对 workspace 可用 ../team/{}_tasks.json），查看与你相关的任务。",
        stem, stem
    )
}

#[tauri::command]
pub fn list_team_tasks(instance_id: String) -> Result<Vec<TeamTask>, String> {
    with_tasks_file_read(&instance_id, |file| {
        let mut tasks = file.tasks.clone();
        tasks.sort_by(|a, b| b.updated_at_ms.cmp(&a.updated_at_ms));
        Ok(tasks)
    })
}

#[tauri::command]
pub fn add_team_task(
    instance_id: String,
    title: String,
    assigned_to_agent_id: Option<String>,
) -> Result<TeamTask, String> {
    let t = title.trim();
    if t.is_empty() {
        return Err("标题不能为空".to_string());
    }
    let assignee = assigned_to_agent_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let allowed = agent_ids_for_instance(&instance_id)?;
    if let Some(ref aid) = assignee {
        if !allowed.contains(aid) {
            return Err("指派的角色不在当前实例的 agents.list 中".to_string());
        }
    }
    let now = chrono::Utc::now().timestamp_millis();
    let (task, _) = with_tasks_file_mut(&instance_id, |file| {
        let (status, claimed) = match &assignee {
            Some(id) => ("claimed".to_string(), Some(id.clone())),
            None => ("open".to_string(), None),
        };
        let task = TeamTask {
            id: uuid::Uuid::new_v4().to_string(),
            title: t.to_string(),
            status,
            created_at_ms: now,
            updated_at_ms: now,
            claimed_by_agent_id: claimed,
            failure_reason: None,
        };
        file.tasks.push(task.clone());
        Ok((task, true))
    })?;
    let _ = sync_team_collab_skill_artifacts_if_initialized(&instance_id);
    let msg = team_task_change_notify_message(&instance_id);
    let notify_ids = assignee
        .map(|id| vec![id])
        .unwrap_or_else(|| vec![TEAM_LEADER_AGENT_ID.to_string()]);
    spawn_team_task_notify(instance_id.clone(), notify_ids, msg);
    Ok(task)
}

#[tauri::command]
pub fn update_team_task(
    instance_id: String,
    task_id: String,
    status: Option<String>,
    claimed_by_agent_id: Option<String>,
    failure_reason: Option<String>,
) -> Result<TeamTask, String> {
    let allowed = agent_ids_for_instance(&instance_id)?;
    if let Some(ref s) = status {
        let x = s.trim();
        if !x.is_empty() && !TASK_STATUS_ALLOWED.contains(&x) {
            return Err("无效的任务状态".to_string());
        }
    }
    let ((task, old_claimed), did_persist) = with_tasks_file_mut(&instance_id, |file| {
        let now = chrono::Utc::now().timestamp_millis();
        let task = file
            .tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| "任务不存在".to_string())?;
        let old_claimed = task.claimed_by_agent_id.clone();
        let fr = failure_reason
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        let wants_claim = status.as_ref().is_some_and(|s| s.trim() == "claimed");
        if wants_claim {
            if task.status != "open" {
                return Err("任务已被领取或已结束".to_string());
            }
            let cid = claimed_by_agent_id.as_ref().map(|c| c.trim()).unwrap_or("");
            if cid.is_empty() {
                return Err("领取时需指定角色".to_string());
            }
            if !allowed.contains(cid) {
                return Err("领取的角色不在当前实例的 agents.list 中".to_string());
            }
        }

        if status.as_ref().is_some_and(|s| s.trim() == "done") {
            if task.status == "done" {
                return Ok(((task.clone(), old_claimed), false));
            }
            if task.status != "claimed" {
                return Err("仅进行中的任务可标记完成".to_string());
            }
        }

        let to_failed = status.as_ref().is_some_and(|s| s.trim() == "failed");
        if to_failed {
            if task.status == "failed" {
                return Ok(((task.clone(), old_claimed), false));
            }
            if task.status == "done" {
                return Err("已完成的任务不可标记失败".to_string());
            }
            if task.status != "open" && task.status != "claimed" {
                return Err("仅待领取或进行中的任务可标记失败".to_string());
            }
            if fr.is_none() {
                return Err("标记失败时需填写原因".to_string());
            }
        }

        if let Some(s) = status {
            let x = s.trim();
            if !x.is_empty() {
                task.status = x.to_string();
            }
        }
        if let Some(ref cid) = claimed_by_agent_id {
            let t = cid.trim();
            if !t.is_empty() && !allowed.contains(t) {
                return Err("认领人不在当前实例的 agents.list 中".to_string());
            }
            task.claimed_by_agent_id = if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            };
        }
        if task.status == "open" {
            task.claimed_by_agent_id = None;
        }

        if task.status != "failed" {
            task.failure_reason = None;
        } else if to_failed {
            task.failure_reason = fr;
        }
        task.updated_at_ms = now;
        Ok(((task.clone(), old_claimed), true))
    })?;
    let _ = sync_team_collab_skill_artifacts_if_initialized(&instance_id);
    if did_persist {
        let mut notify: Vec<String> = Vec::new();
        if let Some(ref o) = old_claimed {
            if task.claimed_by_agent_id.as_ref() != Some(o) {
                notify.push(o.clone());
            }
        }
        if let Some(ref c) = task.claimed_by_agent_id {
            notify.push(c.clone());
        }
        if task.status == "failed" {
            notify.push(TEAM_LEADER_AGENT_ID.to_string());
        }
        notify.sort();
        notify.dedup();
        if !notify.is_empty() {
            spawn_team_task_notify(
                instance_id.clone(),
                notify,
                team_task_change_notify_message(&instance_id),
            );
        }
    }
    Ok(task)
}
