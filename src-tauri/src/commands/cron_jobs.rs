use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use crate::utils::paths;

#[derive(Deserialize)]
struct OpenClawCronFile {
    #[serde(default)]
    jobs: Vec<OpenClawCronJob>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenClawCronJob {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    schedule: OpenClawSchedule,
    #[serde(default)]
    payload: OpenClawPayload,
    #[serde(default)]
    state: OpenClawState,
}

#[derive(Deserialize, Default)]
struct OpenClawSchedule {
    #[serde(default)]
    expr: String,
    #[serde(default)]
    tz: String,
}

#[derive(Deserialize, Default)]
struct OpenClawPayload {
    #[serde(default)]
    message: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OpenClawState {
    #[serde(default)]
    next_run_at_ms: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CronJobWithNext {
    pub id: String,
    pub name: String,
    pub schedule: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<String>,
    pub agent_id: String,
    pub agent_name: String,
}

fn format_next_run(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .map(|dt| {
            dt.with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M")
                .to_string()
        })
        .unwrap_or_default()
}

/// Derive OpenClaw base dir from agentDir (e.g. .../agents/default/agent -> .../.openclaw).
fn base_dir_from_agent_dir(agent_dir: &str) -> Option<PathBuf> {
    let p = Path::new(agent_dir);
    // agentDir: {base}/agents/{id}/agent → three parents up
    p.parent()?.parent()?.parent().map(PathBuf::from)
}

fn read_cron_from_dir(base: &Path, agent_id: &str, agent_name: &str) -> Vec<CronJobWithNext> {
    let jobs_path = base.join("cron").join("jobs.json");
    if !jobs_path.exists() {
        return vec![];
    }
    let content = match fs::read_to_string(&jobs_path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let file: OpenClawCronFile = match serde_json::from_str(&content) {
        Ok(f) => f,
        Err(_) => return vec![],
    };
    file.jobs
        .into_iter()
        .map(|j| {
            let schedule_display = if j.schedule.tz.is_empty() {
                j.schedule.expr.clone()
            } else {
                format!("{} ({})", j.schedule.expr, j.schedule.tz)
            };
            CronJobWithNext {
                id: j.id,
                name: j.name,
                schedule: schedule_display,
                enabled: j.enabled,
                description: if j.description.is_empty() { None } else { Some(j.description) },
                message: if j.payload.message.is_empty() { None } else { Some(j.payload.message) },
                next_run_at: j.state.next_run_at_ms.map(format_next_run),
                agent_id: agent_id.to_string(),
                agent_name: agent_name.to_string(),
            }
        })
        .collect()
}

fn collect_cron_jobs_from_root(root: &serde_json::Value) -> Vec<CronJobWithNext> {
    let mut all_jobs: Vec<CronJobWithNext> = Vec::new();
    let mut seen_dirs: HashSet<PathBuf> = HashSet::new();

    if let Some(list) = root.get("agents").and_then(|a| a.get("list")).and_then(|l| l.as_array()) {
        for item in list {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or(id);
            let agent_dir = item.get("agentDir").and_then(|v| v.as_str());

            if let Some(base) = agent_dir.and_then(base_dir_from_agent_dir) {
                if seen_dirs.insert(base.clone()) {
                    all_jobs.extend(read_cron_from_dir(&base, id, name));
                }
            }
        }
    }

    all_jobs
}

/// Cron jobs from each role's data dir for the current instance `openclaw.json`.
#[tauri::command]
pub fn list_cron_jobs_for_instance(instance_id: String) -> Result<Vec<CronJobWithNext>, String> {
    let config_path = paths::instance_config_path(instance_id.trim())?;
    if !config_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let root: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(collect_cron_jobs_from_root(&root))
}
