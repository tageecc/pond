use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use tauri::AppHandle;
use crate::utils::paths;
use crate::commands::config;
use crate::commands::gateway;

const CLAWHUB_SKILLS_URL: &str = "https://clawhub.ai/api/v1/skills";

fn read_clawhub_token() -> Option<String> {
    #[cfg(target_os = "macos")]
    let config_path = {
        let home = std::env::var("HOME").ok()?;
        std::path::PathBuf::from(home)
            .join("Library/Application Support/clawhub/config.json")
    };
    #[cfg(target_os = "linux")]
    let config_path = {
        let data = std::env::var("XDG_DATA_HOME")
            .unwrap_or_else(|_| format!("{}/.local/share", std::env::var("HOME").unwrap_or_default()));
        std::path::PathBuf::from(data).join("clawhub/config.json")
    };
    #[cfg(target_os = "windows")]
    let config_path = {
        let appdata = std::env::var("APPDATA").ok()?;
        std::path::PathBuf::from(appdata).join("clawhub/config.json")
    };
    let content = fs::read_to_string(config_path).ok()?;
    let json: Value = serde_json::from_str(&content).ok()?;
    json.get("token")?.as_str().map(|s| s.to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillPackage {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub enabled: bool,
    pub config: Value,
    pub author: String,
    #[serde(rename = "downloadUrl", skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SkillsIndex {
    pub skills: Vec<SkillPackage>,
    pub featured: Vec<String>,
}

#[tauri::command]
pub fn list_available_skills() -> Result<Vec<SkillPackage>, String> {
    let skills_dir = paths::skills_dir(None)?;
    let index_path = skills_dir.join("skills-index.json");

    if !index_path.exists() {
        let index = SkillsIndex {
            skills: vec![],
            featured: vec![],
        };
        if let Ok(content) = serde_json::to_string_pretty(&index) {
            let _ = std::fs::create_dir_all(&skills_dir);
            let _ = fs::write(&index_path, content);
        }
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&index_path)
        .map_err(|e| format!("Failed to read skills index: {}", e))?;

    let index: SkillsIndex = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse skills index: {}", e))?;

    Ok(index.skills)
}

/// Fetch skill catalog from ClawHub (server-side to avoid CORS; CLI token auth).
#[tauri::command]
pub async fn fetch_skills_catalog(cursor: Option<String>) -> Result<Value, String> {
    let mut url = CLAWHUB_SKILLS_URL.to_string();
    if let Some(c) = cursor {
        url.push_str("?cursor=");
        url.push_str(&c);
    }
    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    if let Some(token) = read_clawhub_token() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_after = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(60);
        return Err(format!("RATE_LIMITED:{}", retry_after));
    }
    if !status.is_success() {
        return Err(format!("ClawHub API error: {}", status));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

/// Installed skill ids across instances (`workspace/skills` + `skills`, deduped).
#[tauri::command]
pub fn list_installed_skill_ids() -> Result<Vec<String>, String> {
    use std::collections::HashSet;
    let mut all_ids = HashSet::new();

    for pond_id in config::list_openclaw_instances()? {
        let base = paths::instance_home(pond_id.as_str())?;
        for name in paths::skill_subdir_names(&base.join("workspace").join("skills")) {
            all_ids.insert(name);
        }
        for name in paths::skill_subdir_names(&base.join("skills")) {
            all_ids.insert(name);
        }
    }

    let mut ids: Vec<String> = all_ids.into_iter().collect();
    ids.sort();
    Ok(ids)
}

/// One skill entry with directory path (for "open folder" in UI).
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SkillEntry {
    pub id: String,
    pub path: String,
}

/// Per-instance skills (`all` from `openclaw skills list --json`, incl. bundled; `workspace`/`managed` for paths and uninstall).
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SkillsForInstance {
    pub workspace: Vec<SkillEntry>,
    pub managed: Vec<SkillEntry>,
    /// Enabled for this instance (bundled + workspace + managed; matches `skills.entries` disabled set).
    pub enabled: Vec<String>,
    /// Full list from OpenClaw (bundled, workspace, managed).
    pub all: Vec<gateway::OpenClawSkillListItem>,
}

fn list_skills_for_instance_inner(app: &AppHandle, id: &str) -> Result<SkillsForInstance, String> {
    let home = paths::instance_home(id)?;
    let workspace_skills_dir = home.join("workspace").join("skills");
    let workspace_ids = paths::skill_subdir_names(&workspace_skills_dir);
    let workspace: Vec<SkillEntry> = workspace_ids
        .into_iter()
        .map(|sid| SkillEntry {
            path: workspace_skills_dir.join(&sid).display().to_string(),
            id: sid,
        })
        .collect();

    let managed_dir = home.join("skills");
    let managed_ids = paths::skill_subdir_names(&managed_dir);
    let ws_set: std::collections::HashSet<_> = workspace.iter().map(|e| e.id.as_str()).collect();
    let managed: Vec<SkillEntry> = managed_ids
        .into_iter()
        .filter(|s| !ws_set.contains(s.as_str()))
        .map(|sid| SkillEntry {
            path: managed_dir.join(&sid).display().to_string(),
            id: sid,
        })
        .collect();

    let cli_json = gateway::run_cli_skills_list_sync(app, id);

    let mut all: Vec<gateway::OpenClawSkillListItem> = cli_json
        .as_ref()
        .map(|j| j.skills.clone())
        .unwrap_or_default();

    let mut seen: std::collections::HashSet<String> = all.iter().map(|a| a.name.clone()).collect();
    for e in &workspace {
        if seen.insert(e.id.clone()) {
            all.push(gateway::OpenClawSkillListItem {
                name: e.id.clone(),
                description: String::new(),
                source: "workspace".to_string(),
                bundled: false,
                eligible: true,
                disabled: false,
                blocked_by_allowlist: false,
                homepage: None,
            });
        }
    }
    for e in &managed {
        if seen.insert(e.id.clone()) {
            all.push(gateway::OpenClawSkillListItem {
                name: e.id.clone(),
                description: String::new(),
                source: "managed".to_string(),
                bundled: false,
                eligible: true,
                disabled: false,
                blocked_by_allowlist: false,
                homepage: None,
            });
        }
    }
    all.sort_by(|a, b| a.name.cmp(&b.name));

    let cfg = config::load_openclaw_config_for_instance(id.to_string())?;
    let disabled_set: std::collections::HashSet<_> = cfg.skills.iter().map(String::as_str).collect();
    let enabled: Vec<String> = all
        .iter()
        .map(|a| a.name.clone())
        .filter(|sid| !disabled_set.contains(sid.as_str()))
        .collect();

    Ok(SkillsForInstance {
        workspace,
        managed,
        enabled,
        all,
    })
}

#[tauri::command]
pub async fn list_skills_for_instance(app_handle: AppHandle, instance_id: String) -> Result<SkillsForInstance, String> {
    let id = instance_id.trim().to_string();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let app = app_handle.clone();
    let id_c = id.clone();
    tokio::task::spawn_blocking(move || list_skills_for_instance_inner(&app, &id_c))
        .await
        .map_err(|e| e.to_string())?
}

fn validate_skill_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") || id.starts_with('.') {
        return Err(format!("非法 skill_id: {}", id));
    }
    Ok(())
}

/// Open skill directory: workspace, managed, or bundled OpenClaw package path.
#[tauri::command]
pub fn open_skill_directory_for_instance(
    app_handle: AppHandle,
    instance_id: String,
    skill_name: String,
) -> Result<(), String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let name = skill_name.trim();
    if name.is_empty() {
        return Err("skill_name 不能为空".to_string());
    }
    validate_skill_id(name)?;
    let home = paths::instance_home(id)?;
    let ws = home.join("workspace").join("skills").join(name);
    if ws.is_dir() {
        return config::open_path(ws.display().to_string());
    }
    let mg = home.join("skills").join(name);
    if mg.is_dir() {
        return config::open_path(mg.display().to_string());
    }
    if let Some(dir) = gateway::bundled_skill_directory(&app_handle, name) {
        return config::open_path(dir.display().to_string());
    }
    Err("未找到本地技能目录".to_string())
}

/// Result of install-via-agent (no clawhub; URL or skill id).
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct InstallSkillViaAgentResult {
    /// Installed skill id if Agent prints SKILL_ID=xxx.
    pub skill_id: Option<String>,
    /// Short summary (e.g. Agent reply snippet for UI).
    pub message: String,
}

/// Run `openclaw agent` to install a skill (URL or id; not via clawhub).
#[tauri::command]
pub async fn install_skill_via_agent(
    app_handle: AppHandle,
    skill_input: String,
    instance_id: String,
) -> Result<InstallSkillViaAgentResult, String> {
    let input = skill_input.trim();
    if input.is_empty() {
        return Err("请输入技能链接或 ID".to_string());
    }
    const MAX_INPUT_LEN: usize = 2000;
    if input.len() > MAX_INPUT_LEN {
        return Err(format!("输入过长，请不超过 {} 个字符", MAX_INPUT_LEN));
    }

    let inst = instance_id.trim();
    let skills_dir = paths::skills_dir(Some(inst))?;
    let skills_path = skills_dir.display().to_string();

    let agent_id = config::get_default_agent_id_for_instance(inst)?;

    let prompt = format!(
        r#"你是一个技能安装助手。请将用户提供的「技能来源」安装到当前实例的技能目录中。

【用户提供的技能来源】
{}

【要求】
1. 不要使用 clawhub 命令。
2. 若来源是 URL（如 GitHub 仓库、raw 链接、ClawHub 页面），请拉取内容并解析技能结构（如 SKILL.md、包内文件），将技能写入下方目录。
3. 若来源是技能 ID（如 my-skill），请从 ClawHub 或已知来源解析并下载，写入下方目录。
4. 技能目录路径：{}
5. 安装完成后，在回复的**最后**单独一行写出以下之一：
   - 成功：SKILL_INSTALL_OK
   - 失败：SKILL_INSTALL_FAIL: <简短原因>
6. 若成功，再单独一行写出安装后的技能目录名：SKILL_ID=<目录名>"#,
        input,
        skills_path
    );

    // --local: embedded run without Gateway session so main agent history stays clean.
    let args: Vec<String> = vec![
        "agent".to_string(),
        "--local".to_string(),
        "--agent".to_string(),
        agent_id.clone(),
        "--message".to_string(),
        prompt,
        "--timeout".to_string(),
        "120".to_string(),
    ];
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(&app_handle, inst, &refs)
        .map_err(|e| format!("无法构建 OpenClaw 命令: {}", e))?;

    let run_result = tokio::time::timeout(
        std::time::Duration::from_secs(130),
        tokio::task::spawn_blocking(move || cmd.output()),
    )
    .await;

    let inner = match run_result {
        Ok(Ok(inner)) => inner,
        Ok(Err(e)) => return Err(format!("执行 Agent 失败: {}", e)),
        Err(_) => return Err("安装超时（约 2 分钟），请检查网络或稍后重试".to_string()),
    };
    let output = match inner {
        Ok(o) => o,
        Err(e) => return Err(format!("执行 Agent 失败: {}", e)),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse result markers from Agent stdout/stderr.
    let mut skill_id: Option<String> = None;
    let mut install_ok = false;
    let mut install_fail_msg: Option<String> = None;

    for line in stdout.lines().chain(stderr.lines()) {
        let line = line.trim();
        if line.contains("SKILL_ID=") {
            if let Some(rest) = line.split("SKILL_ID=").nth(1) {
                let id = rest.split_whitespace().next().unwrap_or(rest).trim();
                if !id.is_empty() && !id.contains('\n') {
                    skill_id = Some(id.to_string());
                }
            }
        }
        if line.contains("SKILL_INSTALL_OK") {
            install_ok = true;
        }
        if line.contains("SKILL_INSTALL_FAIL:") {
            if let Some(rest) = line.split("SKILL_INSTALL_FAIL:").nth(1) {
                install_fail_msg = Some(rest.trim().to_string());
            }
        }
    }

    if let Some(msg) = install_fail_msg {
        return Err(if msg.is_empty() {
            "Agent 报告安装失败".to_string()
        } else {
            msg
        });
    }

    if !output.status.success() && !install_ok {
        let err = if !stderr.is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().lines().last().unwrap_or("").to_string()
        };
        return Err(if err.is_empty() {
            "Agent 执行失败，请确认 Gateway 已启动且模型可用".to_string()
        } else {
            format!("执行失败: {}", err)
        });
    }

    if !install_ok && output.status.success() {
        return Err("未在回复中检测到 SKILL_INSTALL_OK，请确认 Agent 是否完成安装".to_string());
    }

    let message = if let Some(ref id) = skill_id {
        format!("技能「{}」已安装", id)
    } else {
        "技能已安装，请到下方列表勾选启用".to_string()
    };

    Ok(InstallSkillViaAgentResult {
        skill_id: skill_id.clone(),
        message,
    })
}

#[tauri::command]
pub async fn install_skill(
    skill_id: String,
    agent_id: Option<String>,
) -> Result<(), String> {
    validate_skill_id(&skill_id)?;
    
    let (workdir, skills_subdir) = {
        let target_agent = agent_id.as_deref();
        let skills_dir = paths::skills_dir(target_agent)?;
        let workdir = skills_dir.parent().ok_or("无法获取父目录")?.to_path_buf();
        (workdir, "skills")
    };
    
    let output = tokio::process::Command::new("clawhub")
        .arg("install")
        .arg(&skill_id)
        .arg("--workdir")
        .arg(&workdir)
        .arg("--dir")
        .arg(skills_subdir)
        .arg("--force")
        .output()
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "找不到 clawhub 命令，请先安装 ClawHub CLI: npm install -g clawhub".to_string()
            } else {
                format!("执行 clawhub install 失败: {}", e)
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if !stderr.is_empty() { stderr.trim() } else { stdout.trim() };
        return Err(format!("安装失败: {}", msg));
    }

    Ok(())
}

#[tauri::command]
pub fn uninstall_skill(app_handle: AppHandle, skill_id: String) -> Result<(), String> {
    validate_skill_id(&skill_id)?;

    for id in config::list_openclaw_instances()? {
        let base = paths::instance_home(id.as_str())?;
        let ws = base.join("workspace").join("skills").join(&skill_id);
        if ws.exists() {
            fs::remove_dir_all(&ws).map_err(|e| e.to_string())?;
        }
        let mg = base.join("skills").join(&skill_id);
        if mg.exists() {
            fs::remove_dir_all(&mg).map_err(|e| e.to_string())?;
        }
        let mut cfg = config::load_openclaw_config_for_instance(id.clone())?;
        let had_disabled = cfg.skills.iter().any(|s| s == &skill_id);
        cfg.skills.retain(|s| s != &skill_id);
        if had_disabled {
            config::merge_write_openclaw_config(id.as_str(), cfg, &app_handle, None)?;
        }
    }
    Ok(())
}

