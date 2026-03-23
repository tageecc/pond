use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command as StdCommand;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, oneshot};
use tokio::fs::File;
use serde_json::{json, Value};
use crate::commands::config;
use crate::commands::instance_cleanup;
use crate::commands::workspace;
use crate::utils::paths;
use crate::utils::process;

fn bundled_node_platform() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "darwin-arm64";
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "darwin-x64";
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return "win-x64";
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    return "win-arm64";
    #[cfg(all(target_os = "windows", target_arch = "x86"))]
    return "win-x86";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "linux-x64";
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return "linux-arm64";
    #[cfg(all(target_os = "linux", target_arch = "arm"))]
    return "linux-armv7l";
    #[allow(unreachable_code)]
    "unknown"
}

fn bundled_node_binary_name() -> &'static str {
    if cfg!(target_os = "windows") { "node.exe" } else { "node" }
}

fn bundled_node_path(res_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let node_path = res_dir.join("node").join(bundled_node_platform()).join(bundled_node_binary_name());
    if node_path.exists() { Some(node_path) } else { None }
}

fn clear_openclaw_scope_env(c: &mut std::process::Command) {
    for k in [
        "OPENCLAW_HOME",
        "OPENCLAW_CONFIG_PATH",
        "OPENCLAW_STATE_DIR",
        "OPENCLAW_PROFILE",
    ] {
        c.env_remove(k);
    }
}

/// Global `--profile <id>` (not `default`); clears inherited OPENCLAW_* to avoid cross-instance bleed.
fn apply_openclaw_instance_cli_flags(c: &mut std::process::Command, instance_id: &str) {
    clear_openclaw_scope_env(c);
    let k = instance_id.trim();
    if !k.is_empty() && !k.eq_ignore_ascii_case("default") {
        c.arg("--profile").arg(k);
    }
}

fn build_openclaw_cli(
    app_handle: &AppHandle,
    instance_id: &str,
    subargs: &[&str],
) -> Result<std::process::Command, String> {
    let inst = instance_id.trim();
    let cwd = PathBuf::from(paths::get_home_dir().map_err(|e| e.to_string())?);
    let res_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {}", e))?;
    let cli = res_dir.join("openclaw").join("openclaw.mjs");
    if !cli.is_file() {
        return Err(
            "Bundled OpenClaw missing (resources/openclaw/openclaw.mjs). Run: node scripts/bundle-tauri-resources.mjs"
                .to_string(),
        );
    }
    let node_exe = bundled_node_path(&res_dir).ok_or_else(|| {
        format!(
            "Bundled Node missing (resources/node/{}/{}). Run: node scripts/bundle-tauri-resources.mjs",
            bundled_node_platform(),
            bundled_node_binary_name()
        )
    })?;
    let mut c = StdCommand::new(&node_exe);
    c.arg(&cli);
    apply_openclaw_instance_cli_flags(&mut c, inst);
    c.args(subargs).current_dir(cwd);
    Ok(c)
}

fn openclaw_gateway_service_teardown_sync(app_handle: &AppHandle, instance_key: &str) {
    let k = instance_key.trim();
    let Ok(dir) = paths::instance_home(k) else {
        return;
    };
    if !dir.is_dir() {
        return;
    }
    for tail in [&["gateway", "stop", "--json"][..], &["gateway", "uninstall", "--json"][..]] {
        if let Ok(mut cmd) = build_openclaw_cli(app_handle, k, tail) {
            let _ = cmd.output();
        }
    }
}

pub fn build_openclaw_cli_for_instance_sync(
    app_handle: &AppHandle,
    instance_id: &str,
    args: &[&str],
) -> Result<std::process::Command, String> {
    workspace::repair_openclaw_json_channel_keys(instance_id)?;
    build_openclaw_cli(app_handle, instance_id, args)
}

/// Strip lines starting with "npm warn" so npx env warnings are not shown as errors in the UI.
pub(crate) fn strip_npm_warn_lines(s: &str) -> String {
    s.lines()
        .filter(|line| !line.trim().to_lowercase().starts_with("npm warn"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Run openclaw browser subcommands (status / start / stop / open) for an instance (UI "Manage browser").
#[tauri::command]
pub fn run_browser_command(
    app_handle: AppHandle,
    instance_id: String,
    profile: String,
    subcommand: String,
    extra_args: Option<Vec<String>>,
) -> Result<HashMap<String, String>, String> {
    let mut args_vec: Vec<String> = vec![
        "browser".to_string(),
        "--browser-profile".to_string(),
        profile,
        subcommand,
    ];
    if let Some(a) = extra_args {
        args_vec.extend(a);
    }
    let args_ref: Vec<&str> = args_vec.iter().map(|s| s.as_str()).collect();
    let mut cmd = build_openclaw_cli_for_instance_sync(&app_handle, &instance_id, &args_ref)?;
    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_str = strip_npm_warn_lines(&String::from_utf8_lossy(&output.stderr));
    let mut m = HashMap::new();
    m.insert("stdout".to_string(), stdout_str);
    m.insert("stderr".to_string(), stderr_str);
    m.insert(
        "success".to_string(),
        output.status.success().to_string(),
    );
    Ok(m)
}

// --- Multi-agent Gateway management ---

const BASE_PORT: u16 = 18789;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(tag = "status", content = "message")]
pub enum GatewayStatus {
    #[serde(rename = "stopped")]
    Stopped,
    #[serde(rename = "starting")]
    Starting,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "error")]
    Error(String),
}

fn status_str(s: &GatewayStatus) -> &'static str {
    match s {
        GatewayStatus::Stopped => "stopped",
        GatewayStatus::Starting => "starting",
        GatewayStatus::Running => "running",
        GatewayStatus::Error(_) => "error",
    }
}

struct AgentGatewayEntry {
    child: Option<Child>,
    port: u16,
    status: GatewayStatus,
    started_at: Option<Instant>,
    pid: Option<u32>,
}

pub struct GatewayState {
    agents: Mutex<HashMap<String, AgentGatewayEntry>>,
    pub log_tx: broadcast::Sender<String>,
    /// Cancel send on current log tail so the task exits.
    log_tail_cancel_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl Default for GatewayState {
    fn default() -> Self {
        let (log_tx, _) = broadcast::channel::<String>(1000);
        Self {
            agents: Mutex::new(HashMap::new()),
            log_tx,
            log_tail_cancel_tx: Mutex::new(None),
        }
    }
}

/// On app quit: stop all Agent Gateway child processes (synchronous).
pub fn stop_all_gateways_on_exit(app: &tauri::AppHandle) {
    let state: State<'_, GatewayState> = app.state();
    let mut map = match state.agents.lock() {
        Ok(m) => m,
        Err(_) => return,
    };
    for (key, entry) in map.iter_mut() {
        if let Some(ref mut child) = entry.child {
            eprintln!("[gateway] 退出清理: 停止 agent={}", key);
            let _ = child.start_kill();
        }
    }
}

/// Normalize instance id: empty or "main" -> "default".
fn resolve_key(agent_id: &Option<String>) -> String {
    match agent_id.as_deref() {
        None | Some("") => "default".to_string(),
        Some("default") | Some("main") => "default".to_string(),
        Some(id) => id.to_string(),
    }
}

/// Each OpenClaw gateway uses ports N and N+2, so auto-assign steps by 3.
/// Persist port only via `openclaw config set gateway.port --strict-json` (run `openclaw setup` first if no `openclaw.json`).
fn persist_gateway_port_cli(app: &AppHandle, agent_key: &str, port: u16) -> Result<(), String> {
    workspace::ensure_openclaw_json_with_setup(app, agent_key)?;
    workspace::run_openclaw_config_set_strict_json_sync(
        app,
        agent_key,
        "gateway.port",
        &port.to_string(),
    )
}

fn resolve_port(
    agent_key: &str,
    explicit_port: Option<u16>,
    app: &AppHandle,
) -> Result<u16, String> {
    if let Some(p) = explicit_port {
        return Ok(p);
    }
    if let Some(p) = config::get_instance_gateway_port(agent_key) {
        return Ok(p);
    }
    if agent_key == "default" {
        persist_gateway_port_cli(app, agent_key, BASE_PORT)?;
        return Ok(BASE_PORT);
    }
    let managed = config::list_openclaw_instances()?;
    let used: Vec<u16> = managed
        .iter()
        .filter_map(|id| config::get_instance_gateway_port(id))
        .collect();
    let occupied: std::collections::HashSet<u16> = used
        .iter()
        .flat_map(|&p| [p, p + 1, p + 2])
        .chain([BASE_PORT, BASE_PORT + 1, BASE_PORT + 2])
        .collect();
    let mut port = BASE_PORT + 3;
    while occupied.contains(&port) || occupied.contains(&(port + 2)) {
        port += 1;
    }
    persist_gateway_port_cli(app, agent_key, port)?;
    Ok(port)
}

/// Ensure instance root exists and has `openclaw.json` (otherwise `openclaw setup`).
fn ensure_profile_config(agent_key: &str, app: &AppHandle) -> Result<std::path::PathBuf, String> {
    workspace::ensure_openclaw_json_with_setup(app, agent_key)?;
    paths::instance_home(agent_key)
}

#[derive(Clone, Serialize)]
pub struct AgentGatewayPayload {
    pub agent_id: String,
    pub status: String,
    pub message: Option<String>,
    pub port: u16,
    /// "user" = user clicked stop; unset or "process_exit" = process exited on its own (e.g. config reload); no "stopped" toast.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

fn emit_status(app: &AppHandle, key: &str, status: &GatewayStatus, port: u16, source: Option<&str>) {
    let msg = if let GatewayStatus::Error(m) = status { Some(m.clone()) } else { None };
    let _ = app.emit("gateway-status", AgentGatewayPayload {
        agent_id: key.to_string(),
        status: status_str(status).to_string(),
        message: msg,
        port,
        source: source.map(String::from),
    });
}

/// Put tokio Command in its own process group (Unix) so parent Ctrl+C does not kill the child.
#[cfg(unix)]
fn detach_process_group(cmd: &mut Command) {
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn detach_process_group(_cmd: &mut Command) {}

// --- Tauri commands ---

#[tauri::command]
pub async fn start_gateway(
    state: State<'_, GatewayState>,
    app_handle: AppHandle,
    agent_id: Option<String>,
    port: Option<u16>,
) -> Result<(), String> {
    let key = resolve_key(&agent_id);
    ensure_profile_config(&key, &app_handle)?;
    let gw_port = resolve_port(&key, port, &app_handle)?;

    // Already running if child exists or probe sees a listener.
    {
        let map = state.agents.lock().map_err(|e| e.to_string())?;
        if let Some(entry) = map.get(&key) {
            if entry.child.is_some() || entry.status == GatewayStatus::Running {
                return Err(format!("Agent「{}」的 Gateway 已在运行（端口 {}）", key, entry.port));
            }
        }
    }

    for pass in 0..2 {
        if !tcp_port_alive(gw_port) {
            break;
        }
        if apply_running_if_ws_ready(&state, &app_handle, &key, gw_port).await? {
            return Ok(());
        }
        if pass == 0 {
            let pids = process::kill_tcp_listeners_on_port(gw_port).map_err(|e| {
                format!(
                    "端口 {} 被占用且非 OpenClaw Gateway（WebSocket 握手失败），无法结束监听进程: {}",
                    gw_port, e
                )
            })?;
            eprintln!(
                "[start_gateway] 端口 {} 已结束占用进程 PID: {:?}",
                gw_port, pids
            );
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        } else {
            return Err(format!(
                "端口 {} 仍被占用且非 OpenClaw Gateway（握手仍失败，已尝试结束监听进程）",
                gw_port
            ));
        }
    }

    // Mark Starting
    {
        let mut map = state.agents.lock().map_err(|e| e.to_string())?;
        let entry = map.entry(key.clone()).or_insert_with(|| AgentGatewayEntry {
            child: None, port: gw_port, status: GatewayStatus::Stopped, started_at: None, pid: None,
        });
        entry.status = GatewayStatus::Starting;
        entry.port = gw_port;
    }
    emit_status(&app_handle, &key, &GatewayStatus::Starting, gw_port, None);

    let cfg = config::load_openclaw_config_for_instance(key.clone())?;
    config::merge_write_openclaw_config(&key, cfg, &app_handle, None)?;
    workspace::sync_agents_list_with_openclaw_cli(&app_handle, &key)?;
    config::ensure_gateway_tokens_for_instance(app_handle.clone(), key.clone())?;

    let port_s = gw_port.to_string();
    let gw_argv = ["gateway", "--port", port_s.as_str(), "--allow-unconfigured"];
    let mut c = build_openclaw_cli_for_instance_sync(&app_handle, &key, &gw_argv)?;
    c.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut cmd = Command::from(c);
    cmd.kill_on_drop(false);
    detach_process_group(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| format!("启动 Gateway 失败: {}。若为打包版请先执行 pnpm build 以内置 Node 与 OpenClaw。", e))?;
    let pid = child.id();

    // stdout -> log stream
    if let Some(stdout) = child.stdout.take() {
        let tx = state.log_tx.clone();
        let ah = app_handle.clone();
        let k = key.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let log_line = format!("[{}] {}", k, line);
                let _ = ah.emit("gateway-log", &log_line);
                let _ = tx.send(log_line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let tx = state.log_tx.clone();
        let ah = app_handle.clone();
        let k = key.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                // Do not forward harmless npm warnings (e.g. Unknown env config "_jsr-registry").
                if trimmed.to_lowercase().starts_with("npm warn") {
                    continue;
                }
                let log_line = format!("[{}] {}", k, line);
                let _ = ah.emit("gateway-log", &log_line);
                let _ = tx.send(log_line);
            }
        });
    }

    // Store child handle
    {
        let mut map = state.agents.lock().map_err(|e| e.to_string())?;
        let entry = map.get_mut(&key).unwrap();
        entry.child = Some(child);
        entry.started_at = Some(Instant::now());
        entry.pid = pid;
    }

    // Watch for process exit
    let ah_watch = app_handle.clone();
    let k_watch = key.clone();
    let p_watch = gw_port;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        interval.tick().await;
        loop {
            interval.tick().await;
            let state = match ah_watch.try_state::<GatewayState>() { Some(s) => s, None => break };
            let child_opt = {
                let mut map = match state.agents.lock() { Ok(m) => m, Err(_) => break };
                match map.get_mut(&k_watch) { Some(e) => e.child.take(), None => break }
            };
            let mut child = match child_opt { Some(c) => c, None => break };
            match child.try_wait() {
                Ok(Some(_exit)) => {
                    if let Ok(mut map) = state.agents.lock() {
                        if let Some(e) = map.get_mut(&k_watch) {
                            e.status = GatewayStatus::Stopped;
                            e.pid = None;
                            e.started_at = None;
                        }
                    }
                    // Process exited on its own (e.g. reload); do not mark user; no "stopped" toast.
                    emit_status(&ah_watch, &k_watch, &GatewayStatus::Stopped, p_watch, Some("process_exit"));
                    break;
                }
                _ => {
                    if let Ok(mut map) = state.agents.lock() {
                        if let Some(e) = map.get_mut(&k_watch) { e.child = Some(child); }
                    }
                }
            }
        }
    });

    let mut elapsed_ms = 0u64;
    let mut gateway_ready = false;
    while elapsed_ms < 120_000 {
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
        elapsed_ms += 800;
        if super::ws_gateway::openclaw_gateway_ws_ready(&key, gw_port).await {
            gateway_ready = true;
            break;
        }
    }
    if !gateway_ready {
        let child_gone = {
            let mut map = state.agents.lock().map_err(|e| e.to_string())?;
            map.get_mut(&key)
                .and_then(|e| e.child.as_mut())
                .map(|ch| matches!(ch.try_wait(), Ok(Some(_))))
                .unwrap_or(false)
        };
        let listening = tcp_port_alive(gw_port);
        let why = if child_gone {
            "子进程已退出（请看概览 Gateway 日志中的报错）"
        } else if !listening {
            "回环端口无监听（进程可能未启动成功）"
        } else {
            "端口可连但 WebSocket 网关握手未成功（请核对 gateway.auth.token 与 Gateway 日志）"
        };
        return Err(format!("Gateway 启动超时：{why}"));
    }
    {
        let mut map = state.agents.lock().map_err(|e| e.to_string())?;
        if let Some(e) = map.get_mut(&key) {
            e.status = GatewayStatus::Running;
        }
    }
    emit_status(&app_handle, &key, &GatewayStatus::Running, gw_port, None);
    Ok(())
}

#[tauri::command]
pub async fn stop_gateway(
    state: State<'_, GatewayState>,
    app_handle: AppHandle,
    agent_id: Option<String>,
) -> Result<(), String> {
    let key = resolve_key(&agent_id);
    let (child_opt, port) = {
        let mut map = state.agents.lock().map_err(|e| e.to_string())?;
        match map.get_mut(&key) {
            Some(e) => (e.child.take(), e.port),
            None => return Ok(()),
        }
    };
    if let Some(mut child) = child_opt {
        if let Err(e) = process::terminate_process(&mut child) {
            eprintln!("terminate failed: {}", e);
            let _ = process::kill_process(&mut child);
        }
        match tokio::time::timeout(std::time::Duration::from_secs(5), child.wait()).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => eprintln!("wait error: {}", e),
            Err(_) => { let _ = child.start_kill(); let _ = tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await; }
        }
    }
    {
        let mut map = state.agents.lock().map_err(|e| e.to_string())?;
        if let Some(e) = map.get_mut(&key) {
            e.status = GatewayStatus::Stopped;
            e.pid = None;
            e.started_at = None;
        }
    }
    // User-initiated stop; UI may show "stopped" toast.
    emit_status(&app_handle, &key, &GatewayStatus::Stopped, port, Some("user"));
    Ok(())
}

#[tauri::command]
pub async fn restart_gateway(
    state: State<'_, GatewayState>,
    app_handle: AppHandle,
    agent_id: Option<String>,
) -> Result<(), String> {
    let key = resolve_key(&agent_id);
    
    // Stop Gateway first
    stop_gateway(state.clone(), app_handle.clone(), Some(key.clone())).await?;
    
    // Ensure state cleared
    {
        let mut map = state.agents.lock().map_err(|e| e.to_string())?;
        if let Some(e) = map.get_mut(&key) {
            e.child = None;
            e.status = GatewayStatus::Stopped;
            e.pid = None;
            e.started_at = None;
        }
    }
    
    // Wait for port to free
    tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
    
    // Restart
    start_gateway(state, app_handle, Some(key), None).await?;
    Ok(())
}

// --- Status queries ---

#[derive(Clone, Serialize)]
pub struct AgentGatewayInfo {
    pub agent_id: String,
    pub status: String,
    pub message: Option<String>,
    pub port: u16,
    pub pid: Option<u32>,
    pub uptime_seconds: Option<u64>,
}

#[tauri::command]
pub fn get_gateway_status(state: State<'_, GatewayState>, agent_id: Option<String>) -> Result<GatewayStatus, String> {
    let key = resolve_key(&agent_id);
    let map = state.agents.lock().map_err(|e| e.to_string())?;
    Ok(map.get(&key).map(|e| e.status.clone()).unwrap_or(GatewayStatus::Stopped))
}

#[tauri::command]
pub fn get_gateway_port(
    state: State<'_, GatewayState>,
    app_handle: AppHandle,
    agent_id: Option<String>,
) -> Result<u16, String> {
    let key = resolve_key(&agent_id);
    let map = state.agents.lock().map_err(|e| e.to_string())?;
    if let Some(e) = map.get(&key) {
        Ok(e.port)
    } else {
        resolve_port(&key, None, &app_handle)
    }
}

#[tauri::command]
pub fn get_gateway_pid(state: State<'_, GatewayState>, agent_id: Option<String>) -> Result<Option<u32>, String> {
    let key = resolve_key(&agent_id);
    let map = state.agents.lock().map_err(|e| e.to_string())?;
    Ok(map.get(&key).and_then(|e| e.pid))
}

#[tauri::command]
pub fn get_gateway_uptime_seconds(state: State<'_, GatewayState>, agent_id: Option<String>) -> Result<Option<u64>, String> {
    let key = resolve_key(&agent_id);
    let map = state.agents.lock().map_err(|e| e.to_string())?;
    Ok(map.get(&key).and_then(|e| e.started_at.map(|t| t.elapsed().as_secs())))
}

#[tauri::command]
pub fn get_gateway_memory_mb(state: State<'_, GatewayState>, agent_id: Option<String>) -> Result<Option<f64>, String> {
    let key = resolve_key(&agent_id);
    let pid = {
        let map = state.agents.lock().map_err(|e| e.to_string())?;
        map.get(&key).and_then(|e| e.pid)
    };
    let pid = match pid { Some(p) => p, None => return Ok(None) };
    #[cfg(unix)]
    {
        let out = std::process::Command::new("ps").args(["-o", "rss=", "-p", &pid.to_string()]).output().map_err(|e| e.to_string())?;
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if let Ok(rss_kb) = s.parse::<u64>() { return Ok(Some((rss_kb as f64) / 1024.0)); }
        }
    }
    #[cfg(windows)]
    {
        use sysinfo::{Pid, System};
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[Pid::from(pid as usize)]));
        if let Some(proc_info) = sys.process(Pid::from(pid as usize)) {
            return Ok(Some(proc_info.memory() as f64 / (1024.0 * 1024.0)));
        }
    }
    let _ = pid;
    Ok(None)
}

/// Gateway status for all agents (including configured but not running).
#[tauri::command]
pub fn get_all_gateway_statuses(
    state: State<'_, GatewayState>,
    app_handle: AppHandle,
) -> Result<Vec<AgentGatewayInfo>, String> {
    let map = state.agents.lock().map_err(|e| e.to_string())?;
    let managed_agents = config::list_openclaw_instances()?;

    let mut result: Vec<AgentGatewayInfo> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (k, e) in map.iter() {
        seen.insert(k.clone());
        let msg = if let GatewayStatus::Error(m) = &e.status { Some(m.clone()) } else { None };
        result.push(AgentGatewayInfo {
            agent_id: k.clone(),
            status: status_str(&e.status).to_string(),
            message: msg,
            port: e.port,
            pid: e.pid,
            uptime_seconds: e.started_at.map(|t| t.elapsed().as_secs()),
        });
    }

    for agent_id in managed_agents.iter() {
        if !seen.contains(agent_id) {
            let port = resolve_port(agent_id, None, &app_handle)?;
            result.push(AgentGatewayInfo {
                agent_id: agent_id.clone(),
                status: "stopped".to_string(),
                message: None,
                port,
                pid: None,
                uptime_seconds: None,
            });
        }
    }
    
    result.retain(|r| managed_agents.contains(&r.agent_id));

    // Sort: default first, then alphabetically
    result.sort_by(|a, b| {
        if a.agent_id == "default" { std::cmp::Ordering::Less }
        else if b.agent_id == "default" { std::cmp::Ordering::Greater }
        else { a.agent_id.cmp(&b.agent_id) }
    });

    Ok(result)
}

/// Loopback TCP: treat port as listening if either IPv4 or IPv6 connects.
fn tcp_port_alive(port: u16) -> bool {
    use std::net::{Ipv6Addr, SocketAddr, TcpStream};
    use std::time::Duration;
    let t = Duration::from_millis(800);
    let v4: SocketAddr = ([127, 0, 0, 1], port).into();
    if TcpStream::connect_timeout(&v4, t).is_ok() {
        return true;
    }
    let v6: SocketAddr = (Ipv6Addr::LOCALHOST, port).into();
    TcpStream::connect_timeout(&v6, t).is_ok()
}

fn set_agent_gateway_running_entry(
    state: &State<'_, GatewayState>,
    key: &str,
    port: u16,
) -> Result<(), String> {
    let mut map = state.agents.lock().map_err(|e| e.to_string())?;
    let entry = map.entry(key.to_string()).or_insert_with(|| AgentGatewayEntry {
        child: None,
        port,
        status: GatewayStatus::Stopped,
        started_at: None,
        pid: None,
    });
    entry.status = GatewayStatus::Running;
    entry.port = port;
    entry.started_at = Some(Instant::now());
    Ok(())
}

fn mark_agent_gateway_running(
    state: &State<'_, GatewayState>,
    app_handle: &AppHandle,
    key: &str,
    port: u16,
) -> Result<(), String> {
    set_agent_gateway_running_entry(state, key, port)?;
    emit_status(app_handle, key, &GatewayStatus::Running, port, None);
    Ok(())
}

async fn apply_running_if_ws_ready(
    state: &State<'_, GatewayState>,
    app_handle: &AppHandle,
    key: &str,
    port: u16,
) -> Result<bool, String> {
    if !super::ws_gateway::openclaw_gateway_ws_ready(key, port).await {
        return Ok(false);
    }
    mark_agent_gateway_running(state, app_handle, key, port)?;
    Ok(true)
}

/// On startup: detect existing Gateway when loopback TCP connects and WebSocket handshake succeeds.
#[tauri::command]
pub async fn probe_running_gateways(state: State<'_, GatewayState>) -> Result<u32, String> {
    let active_agents: std::collections::HashSet<String> =
        config::list_openclaw_instances()?.into_iter().collect();

    let mut candidates: HashMap<String, u16> = HashMap::new();
    for id in &active_agents {
        if let Some(p) = config::get_instance_gateway_port(id) {
            if p > 0 {
                candidates.insert(id.clone(), p);
            }
        }
    }
    if !candidates.contains_key("default") {
        candidates.insert("default".to_string(), BASE_PORT);
    }

    let mut found: u32 = 0;
    for (agent_key, port) in &candidates {
        {
            let map = state.agents.lock().map_err(|e| e.to_string())?;
            if let Some(e) = map.get(agent_key) {
                if e.child.is_some() { continue; }
                // User-stopped instance: do not flip back to Running just because port still connects.
                if e.status == GatewayStatus::Stopped {
                    continue;
                }
            }
        }
        if !tcp_port_alive(*port) {
            continue;
        }
        if !super::ws_gateway::openclaw_gateway_ws_ready(agent_key, *port).await {
            continue;
        }
        set_agent_gateway_running_entry(&state, agent_key, *port)?;
        found += 1;
    }
    Ok(found)
}

/// Instance count (`list_openclaw_instances`).
#[tauri::command]
pub fn count_openclaw_instances() -> Result<usize, String> {
    Ok(config::list_openclaw_instances()?.len())
}

/// Scan `~/.openclaw-*` for dirs not yet in the managed list (have `openclaw.json`, id not managed).
///
/// Returns [{id, name, configPath}] for the UI import prompt.
#[tauri::command]
pub fn discover_system_agents() -> Result<Vec<Value>, String> {
    let home = PathBuf::from(paths::get_home_dir().map_err(|e| e.to_string())?);

    // Managed instance ids (do not auto-insert any)
    let managed: std::collections::HashSet<String> =
        config::list_openclaw_instances()?.into_iter().collect();

    let prefix = ".openclaw-";
    let mut discovered: Vec<Value> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(home) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with(prefix) || !entry.path().is_dir() { continue; }
            let profile_id = &name[prefix.len()..];
            if profile_id.is_empty() || managed.contains(profile_id) { continue; }

            let config_path = entry.path().join("openclaw.json");
            let display_name = if config_path.exists() {
                std::fs::read_to_string(&config_path)
                    .ok()
                    .and_then(|c| serde_json::from_str::<Value>(&c).ok())
                    .and_then(|v| v.get("agents")
                        .and_then(|a| a.get("list"))
                        .and_then(Value::as_array)
                        .and_then(|arr| arr.first())
                        .and_then(|a| a.get("name"))
                        .and_then(Value::as_str)
                        .map(String::from))
                    .unwrap_or_else(|| profile_id.to_string())
            } else {
                profile_id.to_string()
            };

            discovered.push(json!({
                "id": profile_id,
                "name": display_name,
                "configPath": config_path.to_string_lossy(),
            }));
        }
    }
    Ok(discovered)
}

/// Delete an on-disk OpenClaw profile directory that exists but is not managed by Pond.
#[tauri::command]
pub fn delete_system_agent_dir(profile_id: String) -> Result<(), String> {
    if profile_id.is_empty() {
        return Err("profile_id 不能为空".to_string());
    }
    let id = profile_id.trim();
    if id.eq_ignore_ascii_case("default") {
        return Err("禁止删除 default：该 id 对应本机主目录 ~/.openclaw（含 openclaw.json），删除将清空整个 OpenClaw 配置".to_string());
    }
    let profile_dir = paths::instance_home(id)?;
    if !profile_dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&profile_dir)
        .map_err(|e| format!("删除目录 {} 失败: {}", profile_dir.display(), e))
}

/// Port assigned to agent (allocate via OpenClaw CLI and persist if missing).
#[tauri::command]
pub fn get_agent_port(app_handle: AppHandle, agent_id: Option<String>) -> Result<u16, String> {
    let key = resolve_key(&agent_id);
    resolve_port(&key, None, &app_handle)
}

/// Set Gateway port manually (same as auto: `openclaw config set gateway.port --strict-json`).
#[tauri::command]
pub fn set_agent_port(app_handle: AppHandle, agent_id: String, port: u16) -> Result<(), String> {
    let key = resolve_key(&Some(agent_id));
    if port < 1024 {
        return Err("端口号必须 >= 1024".to_string());
    }
    persist_gateway_port_cli(&app_handle, &key, port)
}

/// Delete instance: stop Gateway, uninstall OpenClaw daemon for that profile, free port, remove dir and local chat data.
#[tauri::command]
pub async fn delete_agent_cleanup(
    state: State<'_, GatewayState>,
    app_handle: AppHandle,
    agent_id: String,
) -> Result<(), String> {
    let key = resolve_key(&Some(agent_id.clone()));

    let profile_dir = paths::instance_home(&key)?;
    let home_match = instance_cleanup::openclaw_home_match_string(&profile_dir);
    let mut ports: Vec<u16> = Vec::new();
    if let Some(p) = config::get_instance_gateway_port(&key) {
        ports.push(p);
        ports.push(p.saturating_add(2));
    }

    let _ = stop_gateway(state.clone(), app_handle.clone(), Some(key.clone())).await;
    process::terminate_tcp_listeners_on_ports(&ports);

    openclaw_gateway_service_teardown_sync(&app_handle, &key);

    let _ = instance_cleanup::remove_installed_services_for_openclaw_home(&home_match);

    tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

    process::terminate_tcp_listeners_on_ports(&ports);

    {
        let mut map = state.agents.lock().map_err(|e| e.to_string())?;
        map.remove(&key);
    }

    if profile_dir.exists() {
        std::fs::remove_dir_all(&profile_dir)
            .map_err(|e| format!("删除目录 {} 失败: {}", profile_dir.display(), e))?;
    }

    if let Ok(app_data) = paths::get_app_data_dir() {
        let chat_file = app_data.join("chat").join(format!("{}.json", key));
        if chat_file.exists() {
            let _ = std::fs::remove_file(&chat_file);
        }
    }

    Ok(())
}

const GATEWAY_LOG_SEED_LINES: usize = 500;

/// After open: notify frontend and seed last chunk of file (tail from EOF stays empty until new lines).
async fn seed_and_notify_gateway_log_tail(
    app_handle: &AppHandle,
    file: &mut File,
    end_pos: u64,
    path: &std::path::Path,
    prefix: &str,
) {
    let _ = app_handle.emit(
        "gateway-log",
        format!("{} 已连接日志: {}", prefix, path.display()),
    );
    const SEED_BYTES: u64 = 96 * 1024;
    if end_pos == 0 {
        return;
    }
    let start = end_pos.saturating_sub(SEED_BYTES);
    if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return;
    }
    let n = (end_pos - start) as usize;
    let mut buf = vec![0u8; n];
    if file.read_exact(&mut buf).await.is_err() {
        let _ = file.seek(std::io::SeekFrom::Start(end_pos)).await;
        return;
    }
    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<&str> = text.lines().collect();
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    for line in lines.iter().rev().take(GATEWAY_LOG_SEED_LINES).rev() {
        let t = line.trim_end_matches('\r');
        if !t.is_empty() {
            let log_line = format!("{} {}", prefix, t);
            let _ = app_handle.emit("gateway-log", &log_line);
        }
    }
    let _ = file.seek(std::io::SeekFrom::Start(end_pos)).await;
}

/// Background: tail log file and emit gateway-log (same idea as OpenClaw logs.tail).
async fn tail_gateway_log_file(
    app_handle: AppHandle,
    path: std::path::PathBuf,
    instance_id: String,
    mut cancel_rx: oneshot::Receiver<()>,
) {
    let poll_ms = 500u64;
    let mut pos: u64 = 0;
    let mut line_buf = String::new();
    let prefix = format!("[{}]", instance_id);

    let mut file = match File::open(&path).await {
        Ok(mut f) => {
            if let Ok(meta) = f.metadata().await {
                pos = meta.len();
            }
            seed_and_notify_gateway_log_tail(&app_handle, &mut f, pos, &path, &prefix).await;
            f
        }
        Err(e) => {
            let _ = app_handle.emit("gateway-log", format!("{} 等待日志文件: {} ({})", prefix, path.display(), e));
            let mut f = None;
            for _ in 0..60 {
                tokio::time::sleep(tokio::time::Duration::from_millis(poll_ms)).await;
                if cancel_rx.try_recv().is_ok() {
                    return;
                }
                if let Ok(mut open_f) = File::open(&path).await {
                    if let Ok(meta) = open_f.metadata().await {
                        pos = meta.len();
                    }
                    seed_and_notify_gateway_log_tail(&app_handle, &mut open_f, pos, &path, &prefix).await;
                    f = Some(open_f);
                    break;
                }
            }
            match f {
                Some(open_f) => open_f,
                None => return,
            }
        }
    };

    loop {
        tokio::select! {
            _ = &mut cancel_rx => break,
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(poll_ms)) => {}
        }

        let meta = match file.metadata().await {
            Ok(m) => m,
            Err(_) => continue,
        };
        let len = meta.len();

        if len < pos {
            pos = 0;
            line_buf.clear();
            if file.seek(std::io::SeekFrom::Start(0)).await.is_err() {
                continue;
            }
        }

        if len > pos {
            if file.seek(std::io::SeekFrom::Start(pos)).await.is_err() {
                continue;
            }
            let to_read = (len - pos) as usize;
            let mut buf = vec![0u8; to_read];
            if file.read_exact(&mut buf).await.is_err() {
                continue;
            }
            line_buf.push_str(&String::from_utf8_lossy(&buf));
            pos = len;

            while let Some(nl) = line_buf.find('\n') {
                let line = line_buf[..nl].trim_end_matches('\r').to_string();
                line_buf = line_buf[nl + 1..].to_string();
                if !line.is_empty() {
                    let log_line = format!("{} {}", prefix, line);
                    let _ = app_handle.emit("gateway-log", &log_line);
                }
            }
        }
    }
}

/// Gateway log path for instance (OpenClaw `logging.file` or default /tmp/openclaw/openclaw-YYYY-MM-DD.log).
#[tauri::command]
pub fn get_gateway_log_path(instance_id: Option<String>) -> Result<String, String> {
    let id = instance_id.as_deref().unwrap_or("default").trim();
    if id.is_empty() {
        return Ok(config::get_gateway_log_file_path("default")?.to_string_lossy().to_string());
    }
    config::get_gateway_log_file_path(id).map(|p| p.to_string_lossy().to_string())
}

/// Start tailing instance Gateway log (like OpenClaw control UI logs.tail); cancels previous tail.
#[tauri::command]
pub async fn start_tail_gateway_log(
    state: State<'_, GatewayState>,
    app_handle: AppHandle,
    instance_id: Option<String>,
) -> Result<(), String> {
    let key = resolve_key(&instance_id);
    let path = config::get_gateway_log_file_path(&key)?;
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    {
        let mut guard = state.log_tail_cancel_tx.lock().map_err(|e| e.to_string())?;
        if let Some(old) = guard.take() {
            let _ = old.send(());
        }
        *guard = Some(cancel_tx);
    }

    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        tail_gateway_log_file(app_handle_clone, path, key, cancel_rx).await;
    });
    Ok(())
}

/// Stop current log tail.
#[tauri::command]
pub fn stop_tail_gateway_log(state: State<'_, GatewayState>) -> Result<(), String> {
    let mut guard = state.log_tail_cancel_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

// --- Hooks discovery (openclaw hooks list --json) ---

/// One config field: display and value rules from HOOK spec or backend; frontend renders generically.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFieldSchema {
    pub key: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    /// e.g. "stringArray" = comma-separated values parsed to array on save.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_type: Option<String>,
}

/// Matches openclaw hooks list --json; backend fills config_schema from HOOK spec; frontend renders generically.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookListEntry {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub emoji: String,
    #[serde(default)]
    pub eligible: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub source: String,
    pub plugin_id: Option<String>,
    #[serde(default)]
    pub events: Vec<String>,
    pub homepage: Option<String>,
    #[serde(default)]
    pub missing: HashMap<String, Value>,
    #[serde(default)]
    pub managed_by_plugin: bool,
    /// Config schema for this hook (labels from spec); frontend renders without hard-coded keys.
    #[serde(default)]
    pub config_schema: Vec<ConfigFieldSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HooksListResult {
    pub workspace_dir: Option<String>,
    pub managed_hooks_dir: Option<String>,
    pub hooks: Vec<HookListEntry>,
}

/// Bundled npm package root (`resources/openclaw/`); must contain `openclaw.mjs`.
fn get_bundled_openclaw_root(app_handle: &AppHandle) -> Option<std::path::PathBuf> {
    let res_dir = app_handle.path().resource_dir().ok()?;
    let root = res_dir.join("openclaw");
    root.join("openclaw.mjs").is_file().then_some(root)
}

/// Candidate OpenClaw install roots: app resources, global `npm i -g openclaw`, repo `node_modules/openclaw`.
fn openclaw_package_roots(app_handle: &AppHandle) -> Vec<PathBuf> {
    use std::collections::HashSet;
    let mut seen: HashSet<String> = HashSet::new();
    let mut push = |p: PathBuf, out: &mut Vec<PathBuf>| {
        if !p.join("package.json").exists() {
            return;
        }
        let key = p.canonicalize().unwrap_or_else(|_| p.clone()).to_string_lossy().to_string();
        if seen.insert(key) {
            out.push(p);
        }
    };
    let mut out = Vec::new();
    if let Some(r) = get_bundled_openclaw_root(app_handle) {
        push(r, &mut out);
    }
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        if let Some(parent) = PathBuf::from(&manifest).parent() {
            push(parent.join("node_modules").join("openclaw"), &mut out);
        }
    }
    if let Ok(o) = StdCommand::new("npm").args(["root", "-g"]).output() {
        if o.status.success() {
            let root = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !root.is_empty() {
                push(PathBuf::from(root).join("openclaw"), &mut out);
            }
        }
    }
    out
}

/// Bundled OpenClaw package path `skills/<id>/SKILL.md`.
pub fn bundled_skill_directory(app_handle: &AppHandle, skill_name: &str) -> Option<PathBuf> {
    let name = skill_name.trim();
    if name.is_empty() {
        return None;
    }
    for root in openclaw_package_roots(app_handle) {
        let dir = root.join("skills").join(name);
        if dir.join("SKILL.md").exists() {
            return Some(dir);
        }
    }
    None
}

/// Parse only metadata.openclaw.configSchema from HOOK.md path (Pond convention; not in OpenClaw spec yet).
fn parse_config_schema_from_hook_md(path: &Path) -> Option<Vec<ConfigFieldSchema>> {
    let (_, _, schema) = parse_hook_md(path)?;
    schema.filter(|s| !s.is_empty())
}

/// Parse hook dir HOOK.md for name, metadata.openclaw.emoji, optional configSchema (Pond convention).
fn parse_hook_md(path: &Path) -> Option<(String, String, Option<Vec<ConfigFieldSchema>>)> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut name = None;
    let mut emoji = "🔗".to_string();
    let mut config_schema = None;
    let mut in_frontmatter = content.trim_start().starts_with("---");
    for line in content.lines() {
        let line = line.trim();
        if line == "---" {
            in_frontmatter = !in_frontmatter;
            continue;
        }
        if !in_frontmatter {
            break;
        }
        if let Some(rest) = line.strip_prefix("name:") {
            name = Some(rest.trim().trim_matches('"').to_string());
        }
        if line.starts_with("metadata:") {
            if let Some(json_str) = line.strip_prefix("metadata:").map(|s| s.trim()) {
                if let Ok(v) = serde_json::from_str::<Value>(json_str) {
                    if let Some(oc) = v.get("openclaw").and_then(Value::as_object) {
                        if let Some(e) = oc.get("emoji").and_then(Value::as_str) {
                            emoji = e.to_string();
                        }
                        if let Some(arr) = oc.get("configSchema").and_then(Value::as_array) {
                            if let Ok(schema) = serde_json::from_value(Value::Array(arr.clone())) {
                                config_schema = Some(schema);
                            }
                        }
                    }
                }
            }
        }
    }
    name.map(|n| (n, emoji, config_schema))
}

fn scan_hooks_in_dir(dir: &Path, source: &str) -> Vec<HookListEntry> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else { return out };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let hook_md = p.join("HOOK.md");
        if !hook_md.exists() {
            continue;
        }
        let (name, emoji, from_md_schema) = match parse_hook_md(&hook_md) {
            Some((n, e, s)) => (n, e, s),
            None => {
                if let Some(s) = p.file_name().and_then(|n| n.to_str()) {
                    (s.to_string(), "🔗".to_string(), None)
                } else {
                    continue;
                }
            }
        };
        let config_schema = from_md_schema.unwrap_or_default();
        out.push(HookListEntry {
            name: name.clone(),
            description: String::new(),
            emoji,
            eligible: true,
            disabled: false,
            source: source.to_string(),
            plugin_id: None,
            events: Vec::new(),
            homepage: None,
            missing: HashMap::new(),
            managed_by_plugin: false,
            config_schema,
        });
    }
    out
}

/// Built-in hook names listed even when no dir on disk (for configuration).
const BUILTIN_HOOK_IDS: &[(&str, &str)] = &[
    ("session-memory", "💾"),
    ("command-logger", "📝"),
    ("bootstrap-extra-files", "📎"),
    ("boot-md", "🚀"),
];

fn run_cli_hooks_list_sync(app_handle: &AppHandle, id: &str) -> Option<HooksListResult> {
    let args = ["hooks", "list", "--json"];
    let mut cmd = build_openclaw_cli_for_instance_sync(app_handle, id, &args).ok()?;
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut result = serde_json::from_str::<HooksListResult>(&stdout).ok()?;
    apply_bundled_config_schema(app_handle, &mut result);
    Some(result)
}

/// For bundled hooks with empty config_schema, parse HOOK.md from bundled OpenClaw package when present.
fn apply_bundled_config_schema(app_handle: &AppHandle, result: &mut HooksListResult) {
    let Some(root) = get_bundled_openclaw_root(app_handle) else { return };
    let candidates = [
        root.join("dist/hooks/bundled"),
        root.join("hooks/bundled"),
    ];
    for hook in &mut result.hooks {
        if hook.config_schema.is_empty() && hook.source == "bundled" {
            for base in &candidates {
                let path = base.join(&hook.name).join("HOOK.md");
                if path.exists() {
                    if let Some(schema) = parse_config_schema_from_hook_md(&path) {
                        hook.config_schema = schema;
                    }
                    break;
                }
            }
        }
    }
}

fn hooks_list_from_disk(id: &str) -> Result<HooksListResult, String> {
    let instance_dir = paths::instance_home(id)?;
    let workspace_dir = instance_dir.join("workspace");
    let managed_dir = instance_dir.join("hooks");
    let workspace_hooks_dir = workspace_dir.join("hooks");

    let mut hooks = Vec::new();
    if managed_dir.exists() {
        hooks.extend(scan_hooks_in_dir(&managed_dir, "managed"));
    }
    if workspace_hooks_dir.exists() {
        let from_ws = scan_hooks_in_dir(&workspace_hooks_dir, "workspace");
        for h in from_ws {
            if !hooks.iter().any(|e: &HookListEntry| e.name == h.name) {
                hooks.push(h);
            }
        }
    }
    let have_builtin_names: std::collections::HashSet<String> = hooks.iter().map(|e| e.name.clone()).collect();
    for (name, emoji) in BUILTIN_HOOK_IDS {
        if !have_builtin_names.contains(*name) {
            hooks.push(HookListEntry {
                name: (*name).to_string(),
                description: String::new(),
                emoji: (*emoji).to_string(),
                eligible: true,
                disabled: false,
                source: "bundled".to_string(),
                plugin_id: None,
                events: Vec::new(),
                homepage: None,
                missing: HashMap::new(),
                managed_by_plugin: false,
                config_schema: Vec::new(),
            });
        }
    }
    hooks.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(HooksListResult {
        workspace_dir: Some(workspace_dir.to_string_lossy().to_string()),
        managed_hooks_dir: Some(managed_dir.to_string_lossy().to_string()),
        hooks,
    })
}

/// List hooks for instance: prefer `openclaw hooks list --json` (5s timeout); else scan instance dir and merge built-in names.
#[tauri::command]
pub async fn list_hooks_for_instance(app_handle: AppHandle, instance_id: String) -> Result<HooksListResult, String> {
    let id = instance_id.trim().to_string();
    if id.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    let app_handle = app_handle.clone();
    let id_clone = id.clone();

    let cli_result = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::task::spawn_blocking(move || run_cli_hooks_list_sync(&app_handle, &id_clone)),
    )
    .await;

    match cli_result {
        Ok(Ok(Some(result))) if !result.hooks.is_empty() => return Ok(result),
        _ => {}
    }

    hooks_list_from_disk(&id)
}

// --- Skills discovery (openclaw skills list --json) ---

/// One row matching `openclaw skills list --json` (display and enabled merge).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSkillListItem {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub bundled: bool,
    #[serde(default)]
    pub eligible: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub blocked_by_allowlist: bool,
    #[serde(default)]
    pub homepage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSkillsListJson {
    pub workspace_dir: Option<String>,
    pub managed_skills_dir: Option<String>,
    pub skills: Vec<OpenClawSkillListItem>,
}

pub fn run_cli_skills_list_sync(app_handle: &AppHandle, id: &str) -> Option<OpenClawSkillsListJson> {
    let args = ["skills", "list", "--json"];
    let mut cmd = build_openclaw_cli_for_instance_sync(app_handle, id, &args).ok()?;
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).ok()
}

/// Workspace / managed dir names + CLI aggregate names (for `skills.entries.*.enabled` sync).
pub fn merged_skill_ids_for_instance_sync(app_handle: &AppHandle, id: &str) -> Result<Vec<String>, String> {
    use std::collections::HashSet;
    let home = paths::instance_home(id.trim())?;
    let mut set: HashSet<String> = HashSet::new();
    for s in paths::skill_subdir_names(&home.join("workspace").join("skills")) {
        set.insert(s);
    }
    for s in paths::skill_subdir_names(&home.join("skills")) {
        set.insert(s);
    }
    if let Some(json) = run_cli_skills_list_sync(app_handle, id) {
        for s in json.skills {
            set.insert(s.name);
        }
    }
    let mut v: Vec<String> = set.into_iter().collect();
    v.sort();
    Ok(v)
}
