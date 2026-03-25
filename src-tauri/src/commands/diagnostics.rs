use serde::Serialize;
use std::net::TcpStream;
use std::process::Command;
use std::sync::Mutex;
use sysinfo::System;
use tauri::AppHandle;
use crate::commands::config;
use crate::commands::gateway;
use crate::commands::workspace;
use crate::utils::paths;

static SYSTEM_CACHE: std::sync::LazyLock<Mutex<System>> =
    std::sync::LazyLock::new(|| Mutex::new(System::new_all()));

#[derive(Serialize)]
pub struct DiagnosticResult {
    pub name: String,
    pub passed: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

#[tauri::command]
pub fn run_doctor(app: AppHandle) -> Result<Vec<DiagnosticResult>, String> {
    let mut results = Vec::new();

    let cli_resolution = gateway::get_openclaw_cli_resolution(app.clone());

    // Check app data directory
    match paths::get_app_data_dir() {
        Ok(dir) => {
            let exists = dir.exists();
            results.push(DiagnosticResult {
                name: "应用数据目录".to_string(),
                passed: exists,
                message: if exists {
                    format!("应用数据目录存在: {}", dir.display())
                } else {
                    "应用数据目录不存在".to_string()
                },
                suggestion: if !exists {
                    Some("将自动创建".to_string())
                } else {
                    None
                },
            });
        }
        Err(e) => {
            results.push(DiagnosticResult {
                name: "应用数据目录".to_string(),
                passed: false,
                message: format!("无法获取应用数据目录: {}", e),
                suggestion: Some("检查权限或路径".to_string()),
            });
        }
    }

    match cli_resolution.clone() {
        Ok(r) => {
            results.push(DiagnosticResult {
                name: "OpenClaw CLI".to_string(),
                passed: true,
                message: format!("{} — {}", r.source, r.detail),
                suggestion: None,
            });
        }
        Err(e) => {
            results.push(DiagnosticResult {
                name: "OpenClaw CLI".to_string(),
                passed: false,
                message: e,
                suggestion: Some(
                    "运行 node scripts/bundle-tauri-resources.mjs，或安装全局 openclaw（npm/pnpm），或设置 POND_FORCE_BUNDLED_OPENCLAW=1 强制内置"
                        .to_string(),
                ),
            });
        }
    }

    match config::list_openclaw_instances() {
        Err(e) => {
            results.push(DiagnosticResult {
                name: "OpenClaw 实例".to_string(),
                passed: false,
                message: format!("列举实例失败: {}", e),
                suggestion: Some("检查主目录权限或磁盘".to_string()),
            });
        }
        Ok(ids) if ids.is_empty() => {
            results.push(DiagnosticResult {
                name: "OpenClaw 实例".to_string(),
                passed: false,
                message: "未发现 ~/.openclaw 或 ~/.openclaw-* 配置目录".to_string(),
                suggestion: Some("在应用内新建实例或完成 OpenClaw 初始化".to_string()),
            });
        }
        Ok(ids) => {
            let mut parts = Vec::new();
            let mut all_ok = true;
            for id in &ids {
                match config::load_openclaw_config_for_instance(id.clone()) {
                    Ok(cfg) => {
                        let primary = cfg.agents.get("defaults").and_then(|d| d.get("model")).and_then(|m| m.get("primary")).and_then(serde_json::Value::as_str);
                        let has_models = primary
                            .and_then(|p| p.split_once('/').map(|(prov, _)| prov))
                            .and_then(|prov| cfg.models.get("providers").and_then(|o| o.get(prov)))
                            .and_then(|o| o.get("apiKey").and_then(serde_json::Value::as_str))
                            .map_or(false, |k| !k.is_empty());
                        parts.push(format!(
                            "{}: {}",
                            id,
                            if has_models { "可读，默认模型已配 Key" } else { "可读，默认模型未配 Key" }
                        ));
                        if !has_models {
                            all_ok = false;
                        }
                    }
                    Err(e) => {
                        all_ok = false;
                        parts.push(format!("{}: 读取失败 {}", id, e));
                    }
                }
            }
            results.push(DiagnosticResult {
                name: "OpenClaw 实例".to_string(),
                passed: all_ok,
                message: parts.join("；"),
                suggestion: if all_ok {
                    None
                } else {
                    Some("在对应实例的「模型配置」中填写 API Key".to_string())
                },
            });
        }
    }

    // Node.js on PATH (not required when using bundled Node + openclaw.mjs)
    let needs_system_node = cli_resolution
        .as_ref()
        .map(|r| r.needs_system_node)
        .unwrap_or(true);
    match Command::new("node").arg("-v").output() {
        Ok(out) if out.status.success() => {
            let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
            results.push(DiagnosticResult {
                name: "Node.js".to_string(),
                passed: true,
                message: format!("已安装: {}", v),
                suggestion: None,
            });
        }
        _ => {
            if !needs_system_node {
                results.push(DiagnosticResult {
                    name: "Node.js".to_string(),
                    passed: true,
                    message: "未检测到系统 Node（当前使用应用内置 Node 或 PATH 上的 openclaw）".to_string(),
                    suggestion: None,
                });
            } else {
                results.push(DiagnosticResult {
                    name: "Node.js".to_string(),
                    passed: false,
                    message: "未检测到 Node.js".to_string(),
                    suggestion: Some(
                        "全局 openclaw 需要系统 Node；或安装内置资源：node scripts/bundle-tauri-resources.mjs"
                            .to_string(),
                    ),
                });
            }
        }
    }

    // Default gateway port probe (informational only)
    const DEFAULT_GATEWAY_PORT: u16 = 18789;
    let port = DEFAULT_GATEWAY_PORT;
    match TcpStream::connect(format!("127.0.0.1:{}", port)) {
        Ok(_) => {
            results.push(DiagnosticResult {
                name: "端口".to_string(),
                passed: true,
                message: format!("端口 {} 已被占用（可能 Gateway 已在运行）", port),
                suggestion: None,
            });
        }
        Err(_) => {
            results.push(DiagnosticResult {
                name: "端口".to_string(),
                passed: true,
                message: format!("端口 {} 可用", port),
                suggestion: None,
            });
        }
    }

    Ok(results)
}

#[derive(serde::Serialize)]
pub struct ChannelTestResult {
    pub success: bool,
    pub channel: String,
    pub message: String,
}

/// Channel config check: delegates to official `openclaw config validate --json` (schema); no custom field rules.
#[tauri::command]
pub fn test_channel_connection(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<ChannelTestResult>, String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let v = workspace::run_openclaw_config_validate_json_sync(&app, id)?;
    let mut results: Vec<ChannelTestResult> = Vec::new();
    if v.get("valid") == Some(&serde_json::Value::Bool(true)) {
        results.push(ChannelTestResult {
            success: true,
            channel: "openclaw.json".to_string(),
            message: "openclaw config validate：配置符合 schema".to_string(),
        });
        return Ok(results);
    }
    if let Some(issues) = v.get("issues").and_then(|x| x.as_array()) {
        for issue in issues {
            let path = issue
                .get("path")
                .and_then(|p| p.as_str())
                .unwrap_or("?");
            let msg = issue
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("?");
            results.push(ChannelTestResult {
                success: false,
                channel: path.to_string(),
                message: msg.to_string(),
            });
        }
    }
    if results.is_empty() {
        results.push(ChannelTestResult {
            success: false,
            channel: "openclaw.json".to_string(),
            message: "openclaw config validate 未通过（无 issues 明细）".to_string(),
        });
    }
    Ok(results)
}

#[derive(Serialize)]
pub struct SystemInfo {
    pub cpu_usage_percent: f32,
    pub memory_total_mb: f64,
    pub memory_used_mb: f64,
}

/// Current CPU and memory snapshot (for dashboard).
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    tokio::task::spawn_blocking(|| {
        let mut sys = SYSTEM_CACHE.lock().map_err(|e| e.to_string())?;
        sys.refresh_cpu_specifics(sysinfo::CpuRefreshKind::new().with_cpu_usage());
        sys.refresh_memory();

        let cpu = sys.global_cpu_usage();
        let total = sys.total_memory();
        let used = sys.used_memory();

        Ok(SystemInfo {
            cpu_usage_percent: cpu,
            memory_total_mb: total as f64 / 1024.0 / 1024.0,
            memory_used_mb: used as f64 / 1024.0 / 1024.0,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
