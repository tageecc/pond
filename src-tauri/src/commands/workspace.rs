//! Workspace bootstrap files (AGENTS.md, SOUL.md, etc.). No auto templates; when missing, return guidance only.

use crate::commands::gateway;
use crate::utils::paths;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Matches frontend `OPENCLAW_CHANNEL_TYPES` and `openclaw channels add --channel`.
const OPENCLAW_OFFICIAL_CHANNEL_IDS: &[&str] = &[
    "whatsapp", "telegram", "discord", "slack", "imessage", "signal", "msteams",
    "googlechat", "mattermost", "matrix", "irc", "feishu", "line", "nostr", "twitch",
    "bluebubbles",
];

/// Drop non-official keys under `channels` (e.g. legacy UUIDs) or OpenClaw CLI refuses to load config.
pub(crate) fn repair_openclaw_json_channel_keys_at(cfg_path: &Path) -> Result<(), String> {
    if !cfg_path.is_file() {
        return Ok(());
    }
    let raw = std::fs::read_to_string(cfg_path).map_err(|e| e.to_string())?;
    let mut root: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let Some(ch) = root
        .get_mut("channels")
        .and_then(|c| c.as_object_mut())
    else {
        return Ok(());
    };
    let before = ch.len();
    ch.retain(|k, _| OPENCLAW_OFFICIAL_CHANNEL_IDS.contains(&k.as_str()));
    if ch.len() == before {
        return Ok(());
    }
    let out = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    std::fs::write(cfg_path, out).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn repair_openclaw_json_channel_keys(instance_id: &str) -> Result<(), String> {
    let path = paths::instance_config_path(instance_id.trim())?;
    repair_openclaw_json_channel_keys_at(&path)
}

/// Default per-role workspace directory (matches `add_role_agent_with_cli` / `openclaw agents add --workspace`).
pub(crate) fn implicit_role_workspace_dir(instance_id: &str, role_id: &str) -> Result<PathBuf, String> {
    let home = paths::instance_home(instance_id)?;
    let rid = role_id.trim();
    if rid == "main" {
        Ok(home.join("workspace"))
    } else {
        Ok(home.join(format!("workspace-{rid}")))
    }
}

/// Invalidate all sessions' skillsSnapshot cache to force refresh on next message.
/// This solves the OpenClaw bug where sessions created before skill installation don't see new skills.
#[tauri::command]
pub fn invalidate_all_skills_snapshots(instance_id: String) -> Result<usize, String> {
    let inst = instance_id.trim();
    let instance_home = paths::instance_home(inst)?;
    let agents_dir = instance_home.join("agents");
    
    if !agents_dir.exists() {
        return Ok(0);
    }
    
    let mut invalidated_count = 0;
    
    // Iterate through all agent directories
    for entry in fs::read_dir(&agents_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let agent_path = entry.path();
        
        if !agent_path.is_dir() {
            continue;
        }
        
        let sessions_json = agent_path.join("sessions").join("sessions.json");
        if !sessions_json.exists() {
            continue;
        }
        
        // Read sessions.json
        let content = fs::read_to_string(&sessions_json).map_err(|e| e.to_string())?;
        let mut sessions: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        
        // Remove skillsSnapshot from all sessions
        if let Some(sessions_obj) = sessions.as_object_mut() {
            for (_session_key, session_value) in sessions_obj.iter_mut() {
                if let Some(session_obj) = session_value.as_object_mut() {
                    if session_obj.remove("skillsSnapshot").is_some() {
                        invalidated_count += 1;
                    }
                }
            }
        }
        
        // Write back
        let updated = serde_json::to_string_pretty(&sessions).map_err(|e| e.to_string())?;
        fs::write(&sessions_json, updated).map_err(|e| e.to_string())?;
    }
    
    Ok(invalidated_count)
}

/// `agent_id`: Pond instance id. `openclaw_role_id`: `agents.list[].id`; None uses default `workspace/` under the instance dir.
fn resolve_workspace_dir(
    agent_id: Option<&str>,
    openclaw_role_id: Option<&str>,
) -> Result<PathBuf, String> {
    let inst = agent_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("default");
    let default_ws = paths::workspace_dir(Some(inst))?;
    let Some(rid) = openclaw_role_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(default_ws);
    };
    let cfg_path = paths::instance_config_path(inst)?;
    if !cfg_path.is_file() {
        return implicit_role_workspace_dir(inst, rid);
    }
    let raw = std::fs::read_to_string(&cfg_path).map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let Some(list) = v
        .get("agents")
        .and_then(|a| a.get("list"))
        .and_then(|l| l.as_array())
    else {
        return implicit_role_workspace_dir(inst, rid);
    };
    for agent in list {
        let id = agent.get("id").and_then(|x| x.as_str());
        if id != Some(rid) {
            continue;
        }
        if let Some(ws) = agent.get("workspace").and_then(|x| x.as_str()) {
            let w = ws.trim();
            if !w.is_empty() {
                return expand_workspace_path(w, inst);
            }
        }
        return implicit_role_workspace_dir(inst, rid);
    }
    implicit_role_workspace_dir(inst, rid)
}

fn home_dir_string() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法解析用户主目录".to_string())
}

/// Expand `~` and relative paths (relative to instance root).
fn expand_workspace_path(raw: &str, instance_id: &str) -> Result<PathBuf, String> {
    let t = raw.trim();
    if t.starts_with('~') {
        let home = home_dir_string()?;
        let rest = t
            .strip_prefix("~/")
            .or_else(|| t.strip_prefix("~\\"))
            .unwrap_or_else(|| t.trim_start_matches('~'));
        return Ok(PathBuf::from(home).join(rest.trim_start_matches(['/', '\\'])));
    }
    let p = PathBuf::from(t);
    if p.is_absolute() {
        return Ok(p);
    }
    Ok(paths::instance_home(instance_id)?.join(t))
}

/// Allowed bootstrap filenames (per OpenClaw docs).
const ALLOWED_FILES: &[&str] = &[
    "AGENTS.md",      // Instructions + memory
    "SOUL.md",        // Persona, boundaries, tone
    "TOOLS.md",       // User-maintained tool notes
    "IDENTITY.md",    // Agent name, style, emoji
    "USER.md",        // User profile + preferred address
    "BOOT.md",        // Startup checklist (runs on Gateway restart)
    "HEARTBEAT.md",   // Heartbeat task list
    "BOOTSTRAP.md",   // First-run ritual (remove after use)
];

fn is_allowed_filename(name: &str) -> bool {
    ALLOWED_FILES.contains(&name)
}

#[tauri::command]
pub fn read_agent_workspace_file(
    agent_id: Option<String>,
    filename: String,
    openclaw_role_id: Option<String>,
) -> Result<String, String> {
    if !is_allowed_filename(filename.trim()) {
        return Err(format!(
            "仅支持编辑：{}",
            ALLOWED_FILES.join("、")
        ));
    }
    let workspace_dir = resolve_workspace_dir(agent_id.as_deref(), openclaw_role_id.as_deref())?;
    let path = workspace_dir.join(filename.trim());
    if !path.starts_with(&workspace_dir) {
        return Err("非法路径".to_string());
    }
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_agent_workspace_file(
    agent_id: Option<String>,
    filename: String,
    content: String,
    openclaw_role_id: Option<String>,
) -> Result<(), String> {
    if !is_allowed_filename(filename.trim()) {
        return Err(format!(
            "仅支持编辑：{}",
            ALLOWED_FILES.join("、")
        ));
    }
    let workspace_dir = resolve_workspace_dir(agent_id.as_deref(), openclaw_role_id.as_deref())?;
    let path = workspace_dir.join(filename.trim());
    if !path.starts_with(&workspace_dir) {
        return Err("非法路径".to_string());
    }
    std::fs::create_dir_all(&workspace_dir).map_err(|e| format!("创建工作区目录失败: {e}"))?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct ListWorkspaceFile {
    pub name: String,
    pub exists: bool,
}

#[derive(serde::Serialize)]
pub struct ListWorkspaceFilesResult {
    pub files: Vec<ListWorkspaceFile>,
    /// When none of the listed files exist: prompt user to init per OpenClaw docs or create manually (no auto template, no setup).
    pub guide: Option<String>,
}

/// List editable bootstrap files and whether they exist (`agent_id` = Pond instance; with `openclaw_role_id`, use that role's `workspace` from config).
#[tauri::command]
pub fn list_agent_workspace_files(
    agent_id: Option<String>,
    openclaw_role_id: Option<String>,
) -> Result<ListWorkspaceFilesResult, String> {
    let workspace_dir = resolve_workspace_dir(agent_id.as_deref(), openclaw_role_id.as_deref())?;
    std::fs::create_dir_all(&workspace_dir).map_err(|e| format!("创建工作区目录失败: {e}"))?;
    let mut out = Vec::new();
    let mut any_exists = false;
    for name in ALLOWED_FILES {
        let path = workspace_dir.join(*name);
        let exists = path.exists();
        if exists {
            any_exists = true;
        }
        out.push(ListWorkspaceFile {
            name: (*name).to_string(),
            exists,
        });
    }
    let guide = if !any_exists {
        Some(
            "当前工作区下没有 OpenClaw 引导文件（如 AGENTS.md、SOUL.md）。\
            若尚未初始化，请按 OpenClaw 官方文档在终端执行 `openclaw setup` 或向导完成；\
            若你主动删除了这些文件，可在左侧选择文件名后在右侧编辑并保存以新建。"
                .to_string(),
        )
    } else {
        None
    };
    Ok(ListWorkspaceFilesResult { files: out, guide })
}

/// Run `openclaw setup` when instance root exists but `openclaw.json` is missing.
pub fn ensure_openclaw_json_with_setup(app_handle: &AppHandle, instance_id: &str) -> Result<(), String> {
    let inst = instance_id.trim();
    let home = paths::instance_home(inst)?;
    if !home.exists() {
        return Err(format!(
            "实例目录不存在: {}，请先创建实例",
            home.display()
        ));
    }
    if paths::instance_config_path(inst)?.is_file() {
        return Ok(());
    }
    run_openclaw_setup_sync(app_handle, inst)
}

/// `openclaw setup --workspace <instance>/workspace` (sync; shared by Gateway start, import, etc.).
pub fn run_openclaw_setup_sync(app_handle: &AppHandle, instance_id: &str) -> Result<(), String> {
    let inst = instance_id.trim();
    let openclaw_home = paths::instance_home(inst)?;
    std::fs::create_dir_all(openclaw_home.join("workspace"))
        .map_err(|e| format!("创建 workspace 失败: {}", e))?;
    let ws_path = openclaw_home.join("workspace").to_string_lossy().to_string();
    let args: Vec<&str> = vec!["setup", "--workspace", ws_path.as_str()];
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(app_handle, inst, &args)?;
    let out = cmd
        .output()
        .map_err(|e| format!("执行 openclaw setup 失败: {}", e))?;
    if !out.status.success() {
        let stderr =
            gateway::strip_npm_warn_lines(&String::from_utf8_lossy(&out.stderr));
        return Err(format!("openclaw setup 失败: {}", stderr.trim()));
    }
    Ok(())
}

pub(crate) fn parse_openclaw_config_get_stdout(s: &str) -> String {
    let t = s.trim();
    if t.starts_with('"') {
        if let Ok(v) = serde_json::from_str::<String>(t) {
            return v;
        }
    }
    t.to_string()
}

fn skill_entry_enabled_config_path(skill_id: &str) -> Result<String, String> {
    let key = serde_json::to_string(skill_id).map_err(|e| e.to_string())?;
    Ok(format!("skills.entries[{key}].enabled"))
}

pub fn run_openclaw_config_get_sync(
    app_handle: &AppHandle,
    instance_id: &str,
    path: &str,
) -> Result<Option<String>, String> {
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(
        app_handle,
        instance_id.trim(),
        &["config", "get", path],
    )?;
    let out = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    if !out.status.success() {
        return Ok(None);
    }
    let s = parse_openclaw_config_get_stdout(&stdout);
    if s.is_empty() {
        Ok(None)
    } else {
        Ok(Some(s))
    }
}

fn run_openclaw_config_set_impl(
    app_handle: &AppHandle,
    instance_id: &str,
    path: &str,
    value: &str,
    strict_json: bool,
) -> Result<(), String> {
    let inst = instance_id.trim();
    let mut argv = vec!["config", "set", path, value];
    if strict_json {
        argv.push("--strict-json");
    }
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(app_handle, inst, &argv)?;
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let stderr =
            gateway::strip_npm_warn_lines(&String::from_utf8_lossy(&out.stderr));
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "openclaw config set {} 失败: {}\n{}",
            path,
            stderr.trim(),
            stdout.trim()
        ));
    }
    Ok(())
}

pub fn run_openclaw_config_set_sync(
    app_handle: &AppHandle,
    instance_id: &str,
    path: &str,
    value: &str,
) -> Result<(), String> {
    run_openclaw_config_set_impl(app_handle, instance_id, path, value, false)
}

pub fn run_openclaw_config_set_strict_json_sync(
    app_handle: &AppHandle,
    instance_id: &str,
    path: &str,
    value: &str,
) -> Result<(), String> {
    run_openclaw_config_set_impl(app_handle, instance_id, path, value, true)
}

/// `openclaw config validate --json` (stdout is JSON on success or failure; do not rely on exit code).
pub fn run_openclaw_config_validate_json_sync(
    app_handle: &AppHandle,
    instance_id: &str,
) -> Result<Value, String> {
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(
        app_handle,
        instance_id.trim(),
        &["config", "validate", "--json"],
    )?;
    let out = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    serde_json::from_str(&stdout).map_err(|e| {
        format!(
            "openclaw config validate --json 无法解析: {e}（stdout={stdout})"
        )
    })
}

pub fn run_openclaw_config_unset_sync(
    app_handle: &AppHandle,
    instance_id: &str,
    path: &str,
) -> Result<(), String> {
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(
        app_handle,
        instance_id.trim(),
        &["config", "unset", path],
    )?;
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let stderr =
            gateway::strip_npm_warn_lines(&String::from_utf8_lossy(&out.stderr));
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "openclaw config unset {} 失败: {}\n{}",
            path,
            stderr.trim(),
            stdout.trim()
        ));
    }
    Ok(())
}

/// Align Pond-modeled disabled skill ids with disk `openclaw.json` via CLI `skills.entries[id].enabled`.
pub fn sync_skills_disabled_with_openclaw_cli(
    app_handle: &AppHandle,
    instance_id: &str,
    disabled: &[String],
    all_skill_ids: Option<&[String]>,
) -> Result<(), String> {
    let inst = instance_id.trim();
    let all: Vec<String> = match all_skill_ids {
        Some(ids) if !ids.is_empty() => ids.to_vec(),
        _ => gateway::merged_skill_ids_for_instance_sync(app_handle, inst)?,
    };
    let disabled_set: HashSet<String> = disabled.iter().cloned().collect();
    for id in all {
        let path = skill_entry_enabled_config_path(&id)?;
        if disabled_set.contains(&id) {
            run_openclaw_config_set_sync(app_handle, inst, &path, "false")?;
        } else {
            let _ = run_openclaw_config_unset_sync(app_handle, inst, &path);
        }
    }
    Ok(())
}

/// Run `openclaw setup` to init instance directory (creates openclaw.json if missing).
#[tauri::command]
pub async fn run_openclaw_agents_add(app_handle: AppHandle, agent_id: String) -> Result<(), String> {
    let id_trim = agent_id.trim().to_string();
    let openclaw_home = paths::instance_home(&id_trim)?;
    std::fs::create_dir_all(&openclaw_home)
        .map_err(|e| format!("创建实例目录失败: {}", e))?;
    tokio::task::spawn_blocking(move || ensure_openclaw_json_with_setup(&app_handle, &id_trim))
        .await
        .map_err(|e| format!("后台任务异常: {}", e))??;
    Ok(())
}

/// Add role agent using OpenClaw CLI (creates workspace, bootstrap files, and registers agent).
#[tauri::command]
pub async fn add_role_agent_with_cli(
    app_handle: AppHandle,
    instance_id: String,
    role_id: String,
    model: Option<String>,
    name: Option<String>,
) -> Result<(), String> {
    let inst = instance_id.trim().to_string();
    let rid = role_id.trim().to_string();

    if rid.is_empty() {
        return Err("role_id cannot be empty".to_string());
    }

    let workspace_path = implicit_role_workspace_dir(&inst, &rid)?;
    let workspace_str = workspace_path.to_string_lossy().to_string();

    // Clone values for the second task
    let inst_clone = inst.clone();
    let rid_clone = rid.clone();

    let app_clone = app_handle.clone();
    tokio::task::spawn_blocking(move || {
        let model_opt = model.as_deref();
        run_openclaw_agents_add_sync(&app_clone, &inst, &rid, &workspace_str, model_opt)
    })
    .await
    .map_err(|e| format!("Background task failed: {}", e))??;

    // Set agent identity name if provided
    if let Some(agent_name) = name {
        tokio::task::spawn_blocking(move || {
            run_openclaw_agents_set_identity_sync(&app_handle, &inst_clone, &rid_clone, &agent_name)
        })
        .await
        .map_err(|e| format!("Background task failed: {}", e))??;
    }

    Ok(())
}

/// Set agent identity name using OpenClaw CLI.
pub fn run_openclaw_agents_set_identity_sync(
    app_handle: &AppHandle,
    instance_id: &str,
    agent_id: &str,
    name: &str,
) -> Result<(), String> {
    let inst = instance_id.trim();
    let aid = agent_id.trim();
    let name_trimmed = name.trim();
    
    if aid.is_empty() || name_trimmed.is_empty() {
        return Ok(());
    }
    
    let args: Vec<&str> = vec![
        "agents",
        "set-identity",
        "--agent",
        aid,
        "--name",
        name_trimmed,
    ];
    
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(app_handle, inst, &args)?;
    let out = cmd.output().map_err(|e| e.to_string())?;
    
    if !out.status.success() {
        let stderr = gateway::strip_npm_warn_lines(&String::from_utf8_lossy(&out.stderr));
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "openclaw agents set-identity 失败: {}\n{}",
            stderr.trim(),
            stdout.trim()
        ));
    }
    
    Ok(())
}

pub fn run_openclaw_agents_add_sync(
    app_handle: &AppHandle,
    instance_id: &str,
    role_id: &str,
    workspace_path: &str,
    model: Option<&str>,
) -> Result<(), String> {
    let inst = instance_id.trim();
    let rid = role_id.trim();
    if rid.is_empty() {
        return Ok(());
    }
    
    let mut args = vec![
        "agents",
        "add",
        rid,
        "--workspace",
        workspace_path,
        "--non-interactive",
    ];
    
    if let Some(m) = model.filter(|s| !s.is_empty()) {
        args.push("--model");
        args.push(m);
    }
    
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(app_handle, inst, &args)?;
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let stderr = gateway::strip_npm_warn_lines(&String::from_utf8_lossy(&out.stderr));
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "openclaw agents add {} 失败: {}\n{}",
            rid,
            stderr.trim(),
            stdout.trim()
        ));
    }
    Ok(())
}

/// Run `openclaw onboard` non-interactively; init default workspace and config (see OpenClaw wizard docs, non-interactive mode).
/// Requires at least one auth method (e.g. api_key_provider + api_key). Skips channels, skills, etc.; minimal init only.
#[tauri::command]
pub fn run_openclaw_onboard_non_interactive(
    app_handle: AppHandle,
    instance_id: String,
    gateway_port: Option<u16>,
    auth_choice: Option<String>,
    anthropic_api_key: Option<String>,
    openai_api_key: Option<String>,
) -> Result<(), String> {
    let port = gateway_port.unwrap_or(18789);
    let port_str = port.to_string();
    let mut args: Vec<&str> = vec![
        "onboard",
        "--non-interactive",
        "--mode", "local",
        "--gateway-port", &port_str,
        "--gateway-bind", "loopback",
        "--skip-skills",
    ];
    if let Some(a) = auth_choice.as_deref() {
        args.push("--auth-choice");
        args.push(a);
    }
    if let Some(k) = anthropic_api_key.as_deref() {
        if !k.is_empty() {
            args.push("--anthropic-api-key");
            args.push(k);
        }
    }
    if let Some(k) = openai_api_key.as_deref() {
        if !k.is_empty() {
            args.push("--openai-api-key");
            args.push(k);
        }
    }
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let mut cmd =
        gateway::build_openclaw_cli_for_instance_sync(&app_handle, id, &args)?;
    let out = cmd.output().map_err(|e| format!("执行 openclaw onboard 失败: {}", e))?;
    if !out.status.success() {
        let stderr =
            gateway::strip_npm_warn_lines(&String::from_utf8_lossy(&out.stderr));
        return Err(format!("openclaw onboard 失败: {}", stderr.trim()));
    }
    Ok(())
}
