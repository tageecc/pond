use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::collections::{HashMap, HashSet};
use chrono::{Local, Utc};
use tauri::{AppHandle, State};
use crate::commands::team_meta::sync_pond_team_skill_artifacts_if_initialized;
use crate::commands::workspace;
use crate::utils::paths;

/// Exit-related prefs synced from the frontend Store (window close / tray quit).
pub struct ExitPreferences(pub Mutex<(bool, bool)>); // (minimize_to_tray, stop_agents_on_exit)

impl Default for ExitPreferences {
    fn default() -> Self {
        Self(Mutex::new((true, false))) // Default: minimize to tray; do not stop agents on quit
    }
}

/// Called after frontend loads/updates Store; backend reads on close/quit.
#[tauri::command]
pub fn set_exit_preferences(
    state: State<'_, ExitPreferences>,
    minimize_to_tray: bool,
    stop_agents_on_exit: bool,
) {
    if let Ok(mut g) = state.0.lock() {
        *g = (minimize_to_tray, stop_agents_on_exit);
    }
}

fn default_agents_value() -> Value {
    json!({
        "list": [{"id": "main", "default": true}],
        "defaults": {"model": {"primary": "openai/gpt-4o"}}
    })
}

fn default_models_value() -> Value {
    json!({ "mode": "merge", "providers": {} })
}

fn empty_json_object() -> Value {
    json!({})
}

/// OpenClaw requires root `channels` / `messages` to be objects; null/missing/non-object breaks gateway validation.
fn normalize_channels_messages(config: &mut OpenClawConfig) {
    if config.channels.is_null() || !config.channels.is_object() {
        config.channels = json!({});
    }
    if config.messages.is_null() || !config.messages.is_object() {
        config.messages = json!({});
    }
}

/// If `agents.list` is empty or missing, inject default role `main` (`default: true`), same as `agents_value_for_instance` on save.
fn normalize_agents_list_if_empty(agents: &mut Value) {
    let list_empty = agents
        .get("list")
        .and_then(|v| v.as_array())
        .map(|a| a.is_empty())
        .unwrap_or(true);
    if !list_empty {
        return;
    }
    let defaults = agents
        .get("defaults")
        .cloned()
        .unwrap_or_else(|| json!({ "model": { "primary": "openai/gpt-4o" } }));
    if let Some(obj) = agents.as_object_mut() {
        obj.insert(
            "list".to_string(),
            json!([{ "id": "main", "default": true }]),
        );
        obj.insert("defaults".to_string(), defaults);
    }
}

/// Parse agent ids from OpenClaw `agents.list` (for other modules).
pub fn get_agent_ids(config: &OpenClawConfig) -> Vec<String> {
    agent_ids_from_value(&config.agents)
}

fn agent_ids_from_value(agents: &Value) -> Vec<String> {
    agents
        .get("list")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.get("id").and_then(Value::as_str).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Whether a skills entry is disabled (explicit `false` or `enabled: false` only).
fn skill_entry_disabled(val: &Value) -> bool {
    match val {
        Value::Bool(b) => !*b,
        Value::Object(o) => o.get("enabled").and_then(Value::as_bool) == Some(false),
        _ => false,
    }
}

/// Deserialize skills: build disabled id list from OpenClaw `skills.entries` (only `enabled == false`).
fn deserialize_skills<'de, D>(d: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let v: Value = Value::deserialize(d)?;
    let Some(entries) = v.get("entries").and_then(Value::as_object) else {
        return Ok(vec![]);
    };
    let disabled: Vec<String> = entries
        .iter()
        .filter(|(_, val)| skill_entry_disabled(val))
        .map(|(k, _)| k.clone())
        .collect();
    Ok(disabled)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OpenClawConfig {
    #[serde(default = "empty_json_object")]
    pub channels: Value,
    #[serde(default = "empty_json_object")]
    pub messages: Value,
    /// Disabled skill ids (`enabled == false` in skills.entries; omitted means enabled).
    #[serde(default, deserialize_with = "deserialize_skills")]
    pub skills: Vec<String>,
    /// OpenClaw agents: { list: [...], defaults: { model: { primary } } }
    #[serde(default = "default_agents_value")]
    pub agents: Value,
    /// OpenClaw models: { mode, providers: { ... } }
    #[serde(default = "default_models_value")]
    pub models: Value,
    /// Session (OpenClaw native).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<Value>,
    /// Heartbeat (OpenClaw native).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heartbeat: Option<Value>,
    /// Bindings (OpenClaw).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bindings: Option<Value>,
    /// Tools (OpenClaw).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Value>,
    /// Env (OpenClaw).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<Value>,
    /// Gateway (OpenClaw root key "gateway").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gateway: Option<Value>,
    /// Web (OpenClaw; WhatsApp heartbeat, etc.).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web: Option<Value>,
    /// Cron (OpenClaw).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cron: Option<Value>,
    /// Hooks / webhooks.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hooks: Option<Value>,
    /// Privacy.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub privacy: Option<Value>,
}

impl Default for OpenClawConfig {
    fn default() -> Self {
        Self {
            channels: serde_json::json!({}),
            messages: serde_json::json!({}),
            skills: vec![],
            agents: default_agents_value(),
            models: default_models_value(),
            session: None,
            heartbeat: None,
            bindings: None,
            tools: None,
            env: None,
            gateway: None,
            web: None,
            cron: None,
            hooks: None,
            privacy: None,
        }
    }
}

/// Diagnostics: summary of Gateway-related keys in instance openclaw.json (503 troubleshooting).
#[tauri::command]
pub fn openclaw_config_diagnostic(instance_id: String) -> Result<std::collections::HashMap<String, serde_json::Value>, String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let config_path = paths::instance_config_path(id)?;
    let mut out = std::collections::HashMap::new();
    out.insert("configPath".to_string(), Value::String(config_path.display().to_string()));
    out.insert("configExists".to_string(), Value::Bool(config_path.exists()));
    if !config_path.exists() {
        return Ok(out);
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let root: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let _obj = root.as_object().ok_or("不是 JSON 对象")?;
    let primary = root
        .get("agents")
        .and_then(|a| a.get("defaults"))
        .and_then(|d| d.get("model"))
        .and_then(|m| m.get("primary"))
        .and_then(Value::as_str);
    out.insert("hasModels".to_string(), Value::Bool(primary.is_some()));
    if let Some(id) = primary {
        out.insert("defaultModelPrimary".to_string(), Value::String(id.to_string()));
    }
    Ok(out)
}

/// Sanitize apiKey: ASCII printable only, max 500 chars; strip emoji/control/too-short/placeholder.
fn sanitize_api_key(key: &str) -> String {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    
    // Filter common placeholders (case-insensitive)
    let lower = trimmed.to_lowercase();
    let placeholders = [
        "null", "none", "undefined", "your-api-key", "your_api_key",
        "placeholder", "example", "test", "sk-xxx", "sk-...",
        "change-me", "todo", "tbd", "填写你的key",
    ];
    if placeholders.iter().any(|p| lower == *p || lower.contains(p)) {
        eprintln!("[config] apiKey 是占位符「{}」，已清空", trimmed);
        return String::new();
    }
    
    // Non-ASCII or control chars -> reject
    if trimmed.chars().any(|c| c > '\u{007F}' || c.is_control()) {
        eprintln!("[config] apiKey 包含非 ASCII 字符（可能是 emoji 或乱码），已清空");
        return String::new();
    }
    // Over 500 chars -> reject
    if trimmed.len() > 500 {
        eprintln!("[config] apiKey 长度 {} 超过 500，已清空", trimmed.len());
        return String::new();
    }
    // Too short (< 10) -> reject
    if trimmed.len() < 10 {
        eprintln!("[config] apiKey 长度 {} 太短，已清空", trimmed.len());
        return String::new();
    }
    trimmed.to_string()
}

/// Raw JSON save: drop unknown root keys; ensure channels/messages/tools/session/skills shape.
fn prepare_raw_root_for_openclaw(root: &mut serde_json::Map<String, Value>) {
    root.remove("llm");
    for key in ["channels", "messages", "tools", "session"] {
        if root.get(key).map_or(false, Value::is_null) {
            root.insert(key.to_string(), json!({}));
        }
    }
    if root.get("skills").is_none() {
        root.insert("skills".to_string(), json!({}));
    }
}

/// Build `agents` section for this instance's `openclaw.json`.
///
/// `agents.list[].id` is the **OpenClaw role id** (primary role is usually `main`; not the same as Pond instance id).
/// Write `list` as-is; if empty, fall back to a single `main` entry.
fn agents_value_for_instance(agents: &Value) -> Value {
    let defaults = agents.get("defaults").cloned().unwrap_or_else(|| json!({ "model": { "primary": "openai/gpt-4o" } }));
    let list = agents.get("list").cloned().unwrap_or_else(|| json!([]));
    let list = if list.as_array().map_or(true, |a| a.is_empty()) {
        json!([{ "id": "main", "default": true }])
    } else {
        list
    };
    json!({ "list": list, "defaults": defaults })
}

/// Gateway log path (OpenClaw: `logging.file` or default /tmp/openclaw/openclaw-YYYY-MM-DD.log).
pub fn get_gateway_log_file_path(instance_id: &str) -> Result<PathBuf, String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let config_path = paths::instance_config_path(id)?;
    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        if let Ok(root) = serde_json::from_str::<Value>(&content) {
            if let Some(path_str) = root
                .get("logging")
                .and_then(|l| l.get("file"))
                .and_then(Value::as_str)
            {
                let s = path_str.trim();
                if !s.is_empty() {
                    let expanded = if s.starts_with("~/") {
                        if let Ok(home) = std::env::var("HOME") {
                            format!("{}{}", home, &s[1..])
                        } else {
                            s.to_string()
                        }
                    } else if s == "~" {
                        std::env::var("HOME").unwrap_or_else(|_| s.to_string())
                    } else {
                        s.to_string()
                    };
                    return Ok(PathBuf::from(expanded));
                }
            }
        }
    }
    let date = Local::now().format("%Y-%m-%d").to_string();
    Ok(PathBuf::from(format!("/tmp/openclaw/openclaw-{}.log", date)))
}

/// Read gateway port from instance openclaw config (OpenClaw convention).
pub fn get_instance_gateway_port(instance_id: &str) -> Option<u16> {
    let id = instance_id.trim();
    if id.is_empty() {
        return None;
    }
    load_openclaw_config_for_instance(id.to_string())
        .ok()
        .and_then(|c| {
            c.gateway
                .as_ref()
                .and_then(|v| v.get("port").and_then(Value::as_u64))
                .map(|p| p as u16)
        })
}

/// `default` -> `~/.openclaw/openclaw.json`; other ids -> `~/.openclaw-{id}/openclaw.json`.
/// Skip `.openclaw-default`-style dirs (not a Pond convention; avoids duplicating `~/.openclaw`).
#[tauri::command]
pub fn list_openclaw_instances() -> Result<Vec<String>, String> {
    let home = paths::get_home_dir().map_err(|e| e.to_string())?;
    let home = PathBuf::from(home);
    let mut ids = Vec::new();
    if home.join(".openclaw").join("openclaw.json").exists() {
        ids.push("default".to_string());
    }
    if let Ok(entries) = fs::read_dir(&home) {
        for entry in entries.flatten() {
            let Ok(name) = entry.file_name().into_string() else { continue };
            if !name.starts_with(".openclaw-") {
                continue;
            }
            let suffix = name.trim_start_matches(".openclaw-");
            if suffix.is_empty() || suffix == "default" || !entry.path().join("openclaw.json").exists() {
                continue;
            }
            ids.push(suffix.to_string());
        }
    }
    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// Read display name from workspace IDENTITY.md (OpenClaw convention).
/// Supports "- Name:", "Name:", full-width colon, Markdown **Name**:, etc.
fn get_instance_display_name_sync(instance_id: &str) -> String {
    let fallback = || instance_id.to_string();
    let instance_dir = match paths::instance_home(instance_id) {
        Ok(d) => d,
        Err(_) => return fallback(),
    };
    let identity_path = instance_dir.join("workspace").join("IDENTITY.md");
    if !identity_path.exists() {
        return fallback();
    }
    let content = match fs::read_to_string(&identity_path) {
        Ok(c) => c,
        Err(_) => return fallback(),
    };
    let placeholder = "(pick something you like)";
    for line in content.lines() {
        let line = line.trim();
        for prefix in ["- Name:", "- Name：", "- name:", "- name：", "Name:", "Name：", "name:", "name："] {
            if let Some(s) = line.strip_prefix(prefix) {
                let n = s.trim().trim_matches('*').trim();
                if !n.is_empty() && n != placeholder {
                    return n.to_string();
                }
            }
        }
        let lower = line.to_lowercase();
        if let Some(i) = lower.find("name") {
            let after_name = line.get(i + 4..).unwrap_or("").trim_start();
            let colon_pos = after_name.find(':').or_else(|| after_name.find('：'));
            if let Some(cp) = colon_pos {
                let n = after_name.get(cp + 1..).unwrap_or("").trim().trim_matches('*').trim();
                if !n.is_empty() && n != placeholder && n.len() < 100 {
                    return n.to_string();
                }
            }
        }
    }
    fallback()
}

/// Same as `get_instance_display_name_sync` (command wrapper).
#[tauri::command]
pub fn get_instance_display_name(instance_id: String) -> Result<String, String> {
    Ok(get_instance_display_name_sync(instance_id.trim()))
}

/// Load openclaw.json for the instance directory.
#[tauri::command]
pub fn load_openclaw_config_for_instance(instance_id: String) -> Result<OpenClawConfig, String> {
    let id = instance_id.trim();
    let config_path = paths::instance_config_path(id)?;
    if !config_path.exists() {
        return Ok(OpenClawConfig::default());
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut config: OpenClawConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if config.agents.is_null() || config.agents.as_object().map_or(true, |o| o.is_empty()) {
        config.agents = default_agents_value();
    } else {
        normalize_agents_list_if_empty(&mut config.agents);
    }
    if config.models.is_null() || config.models.as_object().map_or(true, |o| o.is_empty()) {
        config.models = default_models_value();
    }
    normalize_channels_messages(&mut config);
    Ok(config)
}

/// Shallow-merge write to `openclaw.json` (skills disabled entries via CLI set/unset, not raw `skills.entries`).
///
/// Must shallow-merge with on-disk JSON: only modeled keys are overwritten; preserve other roots (`browser`, `logging`, ...)
/// or a save / `start_gateway` load→save would wipe user edits.
pub(crate) fn merge_write_openclaw_config(
    instance_id: &str,
    mut config: OpenClawConfig,
    app: &AppHandle,
    skills_sync_all_ids: Option<Vec<String>>,
) -> Result<(), String> {
    let id = instance_id.trim();
    normalize_channels_messages(&mut config);
    config.agents = agents_value_for_instance(&config.agents);
    let config_path = paths::instance_config_path(id)?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut root: serde_json::Map<String, Value> = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let v: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        v.as_object()
            .cloned()
            .ok_or("openclaw.json 根节点须为 JSON 对象")?
    } else {
        serde_json::Map::new()
    };

    let patch = serde_json::to_value(&config)
        .map_err(|e| e.to_string())?
        .as_object()
        .cloned()
        .ok_or("config is not object")?;
    for (k, v) in patch {
        if k == "skills" {
            continue;
        }
        root.insert(k, v);
    }

    let content = serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;
    workspace::sync_skills_disabled_with_openclaw_cli(app, id, &config.skills, skills_sync_all_ids.as_deref())?;
    Ok(())
}

/// Save openclaw.json for instance.
#[tauri::command]
pub fn save_openclaw_config_for_instance(
    app_handle: AppHandle,
    instance_id: String,
    config: OpenClawConfig,
) -> Result<(), String> {
    let id = instance_id.trim();
    merge_write_openclaw_config(id, config, &app_handle, None)?;
    let _ = sync_pond_team_skill_artifacts_if_initialized(id);
    Ok(())
}

/// Update root `bindings` only and run `openclaw config validate`.
#[tauri::command]
pub fn save_openclaw_bindings_for_instance(
    app_handle: AppHandle,
    instance_id: String,
    bindings: Value,
) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    if !bindings.is_array() {
        return Err("bindings 须为 JSON 数组".to_string());
    }
    let mut config = load_openclaw_config_for_instance(id.to_string())?;
    config.bindings = Some(bindings);
    merge_write_openclaw_config(id, config, &app_handle, None)?;
    let v = workspace::run_openclaw_config_validate_json_sync(&app_handle, id)?;
    if v.get("valid") != Some(&Value::Bool(true)) {
        return Err(format!(
            "openclaw config validate 未通过: {}",
            serde_json::to_string(&v).unwrap_or_else(|_| "{}".to_string())
        ));
    }
    Ok(())
}

/// Save skill enablement only (official: persist `enabled: false` entries; omit enabled skills).
#[tauri::command]
pub fn save_skill_enabled_for_instance(
    app_handle: AppHandle,
    instance_id: String,
    enabled_skill_ids: Vec<String>,
    all_skill_ids: Vec<String>,
) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    if all_skill_ids.is_empty() {
        return Err("all_skill_ids 不能为空".to_string());
    }
    let enabled_set: HashSet<String> = enabled_skill_ids.into_iter().collect();
    let disabled: Vec<String> = all_skill_ids.iter().filter(|s| !enabled_set.contains(*s)).cloned().collect();
    let mut config = load_openclaw_config_for_instance(id.to_string())?;
    config.skills = disabled;
    merge_write_openclaw_config(id, config, &app_handle, Some(all_skill_ids))
}

/// Import a discovered profile: ensure `openclaw.json` exists so `list_openclaw_instances` includes it.
/// Optionally seed IDENTITY.md Name.
#[tauri::command]
pub fn import_discovered_instance(
    app_handle: AppHandle,
    instance_id: String,
    display_name: Option<String>,
) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() || id.eq_ignore_ascii_case("default") {
        return Err("不能导入 default 或空 ID".to_string());
    }
    let instance_dir = paths::instance_home(id)?;
    fs::create_dir_all(&instance_dir).map_err(|e| format!("创建实例目录失败: {}", e))?;
    let config_path = instance_dir.join("openclaw.json");
    if !config_path.exists() {
        workspace::run_openclaw_setup_sync(&app_handle, id)?;
    }
    if let Some(name) = display_name.filter(|s| !s.trim().is_empty()) {
        let workspace_dir = instance_dir.join("workspace");
        fs::create_dir_all(&workspace_dir).map_err(|e| format!("创建 workspace 失败: {}", e))?;
        let identity_path = workspace_dir.join("IDENTITY.md");
        let content = format!("- Name: {}\n", name.trim());
        fs::write(&identity_path, content).map_err(|e| format!("写入 IDENTITY.md 失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn export_config(export_path: String, instance_id: String) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let config_path = paths::instance_config_path(id)?;
    if !config_path.exists() {
        return Err("源配置文件不存在".to_string());
    }
    let export = std::path::Path::new(&export_path);
    if let Some(p) = export.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    fs::copy(&config_path, export)
        .map_err(|e| format!("导出失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn import_config(import_path: String, instance_id: String) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let import = std::path::Path::new(&import_path);
    if !import.exists() {
        return Err("导入文件不存在".to_string());
    }
    let config_path = paths::instance_config_path(id)?;
    if let Some(p) = config_path.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    fs::copy(import, &config_path)
        .map_err(|e| format!("导入失败: {}", e))?;
    Ok(())
}

/// Whether any instance dir exists (`~/.openclaw` or `~/.openclaw-*`).
#[tauri::command]
pub fn detect_system_openclaw() -> Result<serde_json::Value, String> {
    let ids = list_openclaw_instances()?;
    let exists = !ids.is_empty();
    let pick = ids
        .iter()
        .find(|i| i.as_str() == "default")
        .or_else(|| ids.first());
    let config_path = pick
        .map(|i| paths::instance_config_path(i.as_str()))
        .transpose()?
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(serde_json::json!({
        "exists": exists,
        "configPath": config_path,
    }))
}

/// Import system ~/.openclaw into Pond.
#[tauri::command]
pub fn import_system_openclaw_config() -> Result<(), String> {
    let config_path = paths::instance_config_path("default")?;
    if !config_path.exists() {
        return Err("未找到 default 实例配置（~/.openclaw/openclaw.json）".to_string());
    }
    Ok(())
}

/// Absolute path to instance `openclaw.json`.
fn agent_openclaw_config_path(agent_id: &str) -> Result<std::path::PathBuf, String> {
    paths::instance_config_path(agent_id)
}

/// Get default agent id from instance config (fallback to "main").
pub fn get_default_agent_id_for_instance(instance_id: &str) -> Result<String, String> {
    let config = load_openclaw_config_for_instance(instance_id.to_string())?;
    if let Some(list_arr) = config.agents.get("list").and_then(|v| v.as_array()) {
        for item in list_arr {
            if let Some(obj) = item.as_object() {
                let is_default = obj.get("default").and_then(|v| v.as_bool()).unwrap_or(false);
                if is_default {
                    if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                        return Ok(id.to_string());
                    }
                }
            }
        }
        if let Some(first) = list_arr.first() {
            if let Some(obj) = first.as_object() {
                if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                    return Ok(id.to_string());
                }
            }
        }
    }
    Ok("main".to_string())
}

/// Read raw openclaw.json string for an instance id (raw editor).
#[tauri::command]
pub fn load_agent_raw_config(agent_id: String) -> Result<String, String> {
    let path = agent_openclaw_config_path(&agent_id)?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取 Agent 配置失败: {}", e))
}

/// Write raw JSON; strip unknown keys before save to avoid invalid config.
#[tauri::command]
pub fn save_agent_raw_config(
    _app_handle: AppHandle,
    agent_id: String,
    raw_json: String,
) -> Result<(), String> {
    let path = agent_openclaw_config_path(&agent_id)?;
    let val: Value = serde_json::from_str(&raw_json)
        .map_err(|e| format!("JSON 格式错误: {}", e))?;
    if !val.is_object() {
        return Err("配置必须是 JSON 对象".to_string());
    }
    let mut root = val.as_object().ok_or("配置必须是 JSON 对象")?.clone();
    prepare_raw_root_for_openclaw(&mut root);
    let _id = agent_id.trim();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let pretty = serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| format!("写入 Agent 配置失败: {}", e))?;
    Ok(())
}

/// Path to openclaw.json for display in UI.
#[tauri::command]
pub fn get_agent_config_path(agent_id: String) -> Result<String, String> {
    agent_openclaw_config_path(&agent_id).map(|p| p.to_string_lossy().to_string())
}

/// Ensure `gateway.auth.token` exists; generate and `openclaw config set` auth + remote token.
#[tauri::command]
pub fn ensure_gateway_tokens_for_instance(
    app_handle: AppHandle,
    instance_id: String,
) -> Result<(), String> {
    let id = instance_id.trim();
    workspace::ensure_openclaw_json_with_setup(&app_handle, id)?;
    let token = match workspace::run_openclaw_config_get_sync(&app_handle, id, "gateway.auth.token")? {
        Some(t) if !t.is_empty() => t,
        _ => uuid::Uuid::new_v4().to_string(),
    };
    workspace::run_openclaw_config_set_sync(&app_handle, id, "gateway.auth.token", &token)?;
    workspace::run_openclaw_config_set_sync(&app_handle, id, "gateway.remote.token", &token)?;
    Ok(())
}

/// Align `gateway.remote.token` with `gateway.auth.token` via CLI get/set.
#[tauri::command]
pub fn ensure_gateway_remote_token(
    app_handle: AppHandle,
    instance_id: String,
) -> Result<(), String> {
    let id = instance_id.trim();
    let path = paths::instance_config_path(id)?;
    if !path.exists() {
        return Ok(());
    }
    let Some(auth) = workspace::run_openclaw_config_get_sync(&app_handle, id, "gateway.auth.token")? else {
        return Ok(());
    };
    if auth.is_empty() {
        return Ok(());
    }
    workspace::run_openclaw_config_set_sync(&app_handle, id, "gateway.remote.token", &auth)?;
    Ok(())
}

/// Test AI connectivity. Requires `llm_config` from the form; do not fall back to global ~/.openclaw (wrong instance).
#[tauri::command]
pub async fn test_ai_connection(llm_config: Option<Value>) -> Result<String, String> {
    let provider = match llm_config {
        Some(Value::Object(m)) => m,
        Some(_) => return Err("llm_config 需为对象".to_string()),
        None => {
            return Err("请传入模型配置：在模型配置页填写 API Key 后点击测试".to_string());
        }
    };
    let api_key = provider
        .get("apiKey")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or("请填写 API Key")?;
    let base_url = provider
        .get("baseURL")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("https://api.openai.com");
    let base_url = base_url.trim_end_matches('/');
    let model = provider
        .get("model")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("gpt-3.5-turbo");

    // Normalize baseURL to avoid double /v1
    let url = if base_url.ends_with("/v1") {
        format!("{}/chat/completions", base_url)
    } else {
        format!("{}/v1/chat/completions", base_url)
    };
    let body = json!({
        "model": model,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 5
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        return Ok("连接成功".to_string());
    }
    let status = res.status();
    let text = res.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    Err(format!(
        "请求失败 {}: {}",
        status,
        if text.is_empty() {
            "无响应体"
        } else {
            &text[..text.len().min(200)]
        }
    ))
}

// ============================================================================
// API key pool (per-instance api-keys.json)
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ApiKeyConfig {
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "baseUrl")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "importedAt")]
    pub imported_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ApiKeyPool {
    #[serde(default, rename = "apiKeys")]
    pub api_keys: HashMap<String, ApiKeyConfig>,
}

impl Default for ApiKeyPool {
    fn default() -> Self {
        Self {
            api_keys: HashMap::new(),
        }
    }
}

/// Provider row discovered during import scan.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscoveredProvider {
    pub provider: String,
    /// Masked API key for display only.
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "baseURL")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Config path label for re-read on import.
    pub source: String,
    #[serde(rename = "hasKey")]
    pub has_key: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<bool>,
}

fn get_api_key_pool_path(instance_id: &str) -> Result<std::path::PathBuf, String> {
    Ok(paths::instance_home(instance_id)?.join("api-keys.json"))
}

/// Load api-keys.json for an instance.
#[tauri::command]
pub fn load_api_key_pool(instance_id: String) -> Result<ApiKeyPool, String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let path = get_api_key_pool_path(id)?;
    if !path.exists() {
        return Ok(ApiKeyPool::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取 API Key 池失败: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析 API Key 池失败: {}", e))
}

/// Save api-keys.json for an instance.
#[tauri::command]
pub fn save_api_key_pool(instance_id: String, pool: ApiKeyPool) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let path = get_api_key_pool_path(id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let content = serde_json::to_string_pretty(&pool)
        .map_err(|e| format!("序列化 API Key 池失败: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("写入 API Key 池失败: {}", e))?;
    Ok(())
}

/// Scan instance openclaw.json for providers importable into the key pool.
#[tauri::command]
pub fn scan_openclaw_configs(instance_id: String) -> Result<Vec<DiscoveredProvider>, String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let mut discovered = Vec::new();
    let existing_pool = load_api_key_pool(id.to_string()).unwrap_or_default();
    let config_path = paths::instance_config_path(id)?;
    let source = if id == "default" {
        "~/.openclaw".to_string()
    } else {
        format!("~/.openclaw-{}", id)
    };
    if config_path.exists() {
        if let Ok(providers) = scan_single_config(&config_path, &source, &existing_pool) {
            discovered.extend(providers);
        }
    }

    // Sort: keys first, then non-conflict
    discovered.sort_by(|a, b| {
        match (a.has_key, b.has_key) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => match (a.conflict.unwrap_or(false), b.conflict.unwrap_or(false)) {
                (false, true) => std::cmp::Ordering::Less,
                (true, false) => std::cmp::Ordering::Greater,
                _ => a.provider.cmp(&b.provider),
            }
        }
    });
    
    Ok(discovered)
}

/// Scan one openclaw.json file.
fn scan_single_config(
    config_path: &std::path::Path,
    source: &str,
    existing_pool: &ApiKeyPool,
) -> Result<Vec<DiscoveredProvider>, String> {
    let mut providers = Vec::new();
    let content = fs::read_to_string(config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;
    let root: Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;
    
    // Read models.providers (OpenClaw native)
    if let Some(models) = root.get("models").and_then(Value::as_object) {
        if let Some(providers_obj) = models.get("providers").and_then(Value::as_object) {
            for (provider_name, provider_val) in providers_obj {
                if let Some(provider_obj) = provider_val.as_object() {
                    let api_key = provider_obj.get("apiKey")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let base_url = provider_obj.get("baseUrl")
                        .and_then(Value::as_str)
                        .map(String::from);
                    let model = provider_obj.get("models")
                        .and_then(Value::as_array)
                        .and_then(|arr| arr.first())
                        .and_then(|m| m.get("id"))
                        .and_then(Value::as_str)
                        .map(String::from);
                    
                    let has_key = !api_key.is_empty() && sanitize_api_key(&api_key).len() > 0;
                    let conflict = existing_pool.api_keys.contains_key(provider_name);
                    
                    providers.push(DiscoveredProvider {
                        provider: provider_name.clone(),
                        api_key: if has_key { mask_api_key(&api_key) } else { String::new() },
                        base_url,
                        model,
                        source: source.to_string(),
                        has_key,
                        conflict: if conflict { Some(true) } else { None },
                    });
                }
            }
        }
    }
    Ok(providers)
}

/// Mask API key (prefix/suffix only).
fn mask_api_key(key: &str) -> String {
    if key.len() <= 12 {
        return format!("{}***", &key[..key.len().min(3)]);
    }
    format!("{}...{}", &key[..6], &key[key.len()-4..])
}

/// Bulk import keys (re-read config file for full key/baseURL).
#[tauri::command]
pub fn import_api_keys(instance_id: String, providers: Vec<DiscoveredProvider>) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let mut pool = load_api_key_pool(id.to_string()).unwrap_or_default();
    let now = Utc::now().to_rfc3339();
    
    for provider_info in providers {
        // Re-read file for full key and baseURL
        let config_path = match resolve_config_path(&provider_info.source) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[import] 跳过 {} (路径错误): {}", provider_info.provider, e);
                continue;
            }
        };
        
        let (full_key, file_base_url) = match extract_provider_config(&config_path, &provider_info.provider) {
            Ok(config) => config,
            Err(e) => {
                eprintln!("[import] 跳过 {} (读取失败): {}", provider_info.provider, e);
                continue;
            }
        };
        
        let sanitized_key = sanitize_api_key(&full_key);
        if sanitized_key.is_empty() {
            eprintln!("[import] 跳过无效 key: {}", provider_info.provider);
            continue;
        }
        
        // Prefer baseURL from file; else from scan row
        let final_base_url = file_base_url.or(provider_info.base_url);
        
        pool.api_keys.insert(
            provider_info.provider.clone(),
            ApiKeyConfig {
                key: sanitized_key,
                base_url: final_base_url,
                source: Some(provider_info.source),
                imported_at: Some(now.clone()),
            },
        );
    }
    
    save_api_key_pool(id.to_string(), pool)?;
    Ok(())
}

/// Resolve display source string to real openclaw.json path.
fn resolve_config_path(source: &str) -> Result<std::path::PathBuf, String> {
    // Home dir
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法获取用户目录".to_string())?;
    
    // Expand ~
    let expanded = if source.starts_with("~/") {
        source.replacen("~/", &format!("{}/", home_dir), 1)
    } else if source == "~" {
        home_dir.clone()
    } else if source.starts_with("~\\") {
        // Windows ~\ path
        source.replacen("~\\", &format!("{}\\", home_dir), 1)
    } else {
        source.to_string()
    };
    
    // If path is already a file, use it; else append openclaw.json
    let path = if expanded.ends_with("openclaw.json") {
        std::path::PathBuf::from(expanded)
    } else {
        std::path::Path::new(&expanded).join("openclaw.json")
    };
    
    if !path.exists() {
        return Err(format!("配置文件不存在: {}", path.display()));
    }
    
    Ok(path)
}

/// Extract provider apiKey and baseUrl from a config file.
fn extract_provider_config(config_path: &std::path::Path, provider: &str) -> Result<(String, Option<String>), String> {
    let content = fs::read_to_string(config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;
    let root: Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;
    
    if let Some(models) = root.get("models").and_then(Value::as_object) {
        if let Some(providers_obj) = models.get("providers").and_then(Value::as_object) {
            if let Some(provider_obj) = providers_obj.get(provider).and_then(Value::as_object) {
                if let Some(key) = provider_obj.get("apiKey").and_then(Value::as_str) {
                    let base_url = provider_obj.get("baseUrl")
                        .and_then(Value::as_str)
                        .map(String::from);
                    return Ok((key.to_string(), base_url));
                }
            }
        }
    }
    Err(format!("未找到 {} 的配置", provider))
}

/// User home directory path.
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    paths::get_home_dir().map_err(|e| e.to_string())
}

/// Instance root: `default` -> `~/.openclaw`, else `~/.openclaw-{id}`.
#[tauri::command]
pub fn get_agent_directory(agent_id: Option<String>) -> Result<String, String> {
    let id = agent_id.as_deref().unwrap_or("default");
    let instance_dir = paths::instance_home(id)?;
    Ok(instance_dir.to_string_lossy().to_string())
}

/// Default OpenClaw-managed browser user-data-dir for the instance.
#[tauri::command]
pub fn get_browser_default_user_data_dir(agent_id: Option<String>) -> Result<String, String> {
    let id = agent_id.as_deref().unwrap_or("default");
    let instance_dir = paths::instance_home(id)?;
    let path = instance_dir.join("browser").join("openclaw").join("user-data");
    Ok(path.to_string_lossy().to_string())
}

/// Example browser executable path for placeholder hints.
#[tauri::command]
pub fn get_browser_executable_placeholder() -> String {
    #[cfg(target_os = "macos")]
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".to_string();
    #[cfg(target_os = "windows")]
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return "/usr/bin/google-chrome".to_string();
}

/// Open file or directory with OS handler.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开失败: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开失败: {}", e))?;
    }
    Ok(())
}
