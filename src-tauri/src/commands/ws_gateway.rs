use std::collections::HashMap;
use std::env;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use ed25519_dalek::{SigningKey, Signer, VerifyingKey};
use sha2::{Sha256, Digest};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

use crate::commands::config;
use crate::utils::paths;

// ─── Device Identity ───────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
struct DeviceIdentity {
    id: String,
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "privateKey")]
    private_key_hex: String,
}

fn identity_path() -> PathBuf {
    paths::get_app_data_dir()
        .unwrap_or_else(|_| env::temp_dir())
        .join("device_identity.json")
}

fn load_or_generate_identity() -> Result<DeviceIdentity, String> {
    let path = identity_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(id) = serde_json::from_str::<DeviceIdentity>(&content) {
                return Ok(id);
            }
        }
    }
    let signing_key = {
        let mut secret = [0u8; 32];
        getrandom::fill(&mut secret).map_err(|e| format!("生成随机密钥失败: {}", e))?;
        SigningKey::from_bytes(&secret)
    };
    let verifying_key: VerifyingKey = signing_key.verifying_key();
    let pub_bytes = verifying_key.to_bytes();

    let device_id = {
        let mut hasher = Sha256::new();
        hasher.update(pub_bytes);
        hex::encode(hasher.finalize())
    };

    let identity = DeviceIdentity {
        id: device_id,
        public_key: URL_SAFE_NO_PAD.encode(pub_bytes),
        private_key_hex: hex::encode(signing_key.to_bytes()),
    };

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(&identity).map_err(|e| e.to_string())?;
    let _ = std::fs::write(&path, json);
    Ok(identity)
}

/// v2|deviceId|clientId|clientMode|role|scopes|ts|token|nonce
fn sign_challenge(identity: &DeviceIdentity, nonce: &str, ts: i64, token: &str) -> Result<Value, String> {
    let scopes = "operator.read,operator.write,operator.admin,operator.approvals,operator.pairing";
    let payload_str = format!(
        "v2|{}|cli|cli|operator|{}|{}|{}|{}",
        identity.id, scopes, ts, token, nonce
    );

    let secret_bytes = hex::decode(&identity.private_key_hex)
        .map_err(|e| format!("无效的设备私钥: {}", e))?;
    let key_bytes: [u8; 32] = secret_bytes.try_into()
        .map_err(|_| "设备私钥长度不正确".to_string())?;
    let signing_key = SigningKey::from_bytes(&key_bytes);
    let signature = signing_key.sign(payload_str.as_bytes());
    let sig_b64 = URL_SAFE_NO_PAD.encode(signature.to_bytes());

    Ok(json!({
        "id": identity.id,
        "publicKey": identity.public_key,
        "signature": sig_b64,
        "signedAt": ts,
        "nonce": nonce,
    }))
}

// --- Read gateway token ---

/// Read Gateway token for the given instance.
/// `instance_id`: instance id; None or "default" is the default instance.
fn read_gateway_token(instance_id: Option<&str>) -> String {
    let id = instance_id.unwrap_or("default");
    let Ok(config_path) = crate::utils::paths::instance_config_path(id) else {
        return String::new();
    };
    let Ok(content) = std::fs::read_to_string(&config_path) else {
        return String::new();
    };
    let Ok(val) = serde_json::from_str::<Value>(&content) else {
        return String::new();
    };
    val.get("gateway")
        .and_then(|g| g.get("auth"))
        .and_then(|a| a.get("token"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

// ─── WebSocket Connection ──────────────────────────────────────────

type WsWrite = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    WsMessage,
>;
type WsRead = futures_util::stream::SplitStream<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
>;

struct WsConn {
    write: WsWrite,
    read: WsRead,
}

const DEFAULT_SCOPES: &[&str] = &[
    "operator.read",
    "operator.write",
    "operator.admin",
    "operator.approvals",
    "operator.pairing",
];

async fn ws_connect(port: u16, identity: &DeviceIdentity, token: &str) -> Result<WsConn, String> {
    let url = format!("ws://127.0.0.1:{}", port);
    try_ws_connect_once(&url, identity, token).await
}

async fn try_ws_connect_once(url: &str, identity: &DeviceIdentity, token: &str) -> Result<WsConn, String> {
    let (ws_stream, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|e| e.to_string())?;

    let (mut write, mut read) = ws_stream.split();

    // 1. Receive connect.challenge
    let challenge_msg = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        read.next(),
    )
    .await
    .map_err(|_| "等待 challenge 超时".to_string())?
    .ok_or("连接意外关闭")?
    .map_err(|e| format!("读取 challenge 失败: {}", e))?;

    let challenge_text = challenge_msg.to_text().map_err(|e| format!("challenge 非文本: {}", e))?;
    let challenge: Value = serde_json::from_str(challenge_text).map_err(|e| format!("challenge JSON 解析失败: {}", e))?;

    if challenge.get("type").and_then(Value::as_str) != Some("event")
        || challenge.get("event").and_then(Value::as_str) != Some("connect.challenge")
    {
        return Err("未收到 connect.challenge 事件".to_string());
    }

    let nonce = challenge["payload"]["nonce"]
        .as_str()
        .ok_or("challenge 缺少 nonce")?;
    let ts = challenge["payload"]["ts"]
        .as_i64()
        .ok_or("challenge 缺少 ts")?;

    // 2. Sign and send connect
    let signed_device = sign_challenge(identity, nonce, ts, token)?;
    let scopes: Vec<Value> = DEFAULT_SCOPES.iter().map(|s| json!(s)).collect();

    let connect_req = json!({
        "type": "req",
        "id": uuid::Uuid::new_v4().to_string(),
        "method": "connect",
        "params": {
            "minProtocol": 3,
            "maxProtocol": 3,
            "client": {
                "id": "cli",
                "version": env!("CARGO_PKG_VERSION"),
                "platform": std::env::consts::OS,
                "mode": "cli",
            },
            "role": "operator",
            "scopes": scopes,
            "auth": { "token": token },
            "device": signed_device,
            "locale": "zh-CN",
            "userAgent": format!("clawteam/{}", env!("CARGO_PKG_VERSION")),
            "caps": ["agent-events", "tool-events"],
        },
    });

    write
        .send(WsMessage::Text(connect_req.to_string().into()))
        .await
        .map_err(|e| format!("发送 connect 失败: {}", e))?;

    // 3. Wait for connect response (skip interleaved health etc.)
    loop {
        let resp_msg = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            read.next(),
        )
        .await
        .map_err(|_| "等待连接响应超时".to_string())?
        .ok_or("连接意外关闭")?
        .map_err(|e| format!("读取响应失败: {}", e))?;

        let text = resp_msg.to_text().map_err(|e| format!("响应非文本: {}", e))?;
        let resp: Value = serde_json::from_str(text).map_err(|e| format!("响应 JSON 解析失败: {}", e))?;

        match resp.get("type").and_then(Value::as_str).unwrap_or("") {
            "event" => continue,
            "res" => {
                if resp.get("ok").and_then(Value::as_bool) != Some(true) {
                    let err = resp.get("error").cloned().unwrap_or(json!({}));
                    let code = err.get("code").and_then(Value::as_str).unwrap_or("UNKNOWN");
                    let msg = err.get("message").and_then(Value::as_str).unwrap_or("连接被拒绝");
                    return Err(format!("Gateway 拒绝连接: {} — {}", code, msg));
                }
                break;
            }
            _ => continue,
        }
    }

    Ok(WsConn { write, read })
}

/// When `emit_ui` is `Some`, forward events to the frontend (same as `ws_chat_send`); when `None`, do not emit (e.g. team task notify background injection).
async fn drain_gateway_chat_stream(read: &mut WsRead, emit_ui: Option<&AppHandle>) -> Result<(), String> {
    let mut terminal_error: Option<String> = None;

    loop {
        let msg = tokio::time::timeout(
            std::time::Duration::from_secs(300),
            read.next(),
        )
        .await;

        let frame = match msg {
            Ok(Some(Ok(WsMessage::Text(text)))) => {
                serde_json::from_str::<Value>(&text).ok()
            }
            Ok(Some(Ok(WsMessage::Close(_)))) | Ok(None) => break,
            Ok(Some(Ok(_))) => continue,
            Ok(Some(Err(e))) => {
                terminal_error = Some(e.to_string());
                break;
            }
            Err(_) => {
                terminal_error = Some("响应超时（5 分钟无数据）".to_string());
                break;
            }
        };

        let Some(frame) = frame else { continue };

        if frame.get("type").and_then(Value::as_str) == Some("res") {
            if frame.get("ok").and_then(Value::as_bool) == Some(false) {
                let err = frame.get("error").cloned().unwrap_or(json!({}));
                let msg = err.get("message").and_then(Value::as_str).unwrap_or("chat.send 失败");
                terminal_error = Some(msg.to_string());
                break;
            }
            continue;
        }

        let event_type = frame.get("event").and_then(Value::as_str).unwrap_or("");

        match event_type {
            "health" => {
                if let (Some(app), Some(payload)) = (emit_ui, frame.get("payload")) {
                    let _ = app.emit("ws-health", payload.clone());
                }
                continue;
            }
            "tick" => {
                if let (Some(app), Some(payload)) = (emit_ui, frame.get("payload")) {
                    let _ = app.emit("ws-tick", payload.clone());
                }
                continue;
            }
            "exec.approval.requested" => {
                if let (Some(app), Some(payload)) = (emit_ui, frame.get("payload")) {
                    let _ = app.emit("ws-approval-requested", payload.clone());
                }
                continue;
            }
            "exec.approval.resolved" => {
                if let (Some(app), Some(payload)) = (emit_ui, frame.get("payload")) {
                    let _ = app.emit("ws-approval-resolved", payload.clone());
                }
                continue;
            }
            "agent" | "chat" => {}
            _ => continue,
        }

        let Some(payload) = frame.get("payload") else { continue };
        let stream_type = payload.get("stream").and_then(Value::as_str).unwrap_or("");
        let data = payload.get("data").cloned().unwrap_or(json!({}));

        match stream_type {
            "assistant" => {
                if let Some(app) = emit_ui {
                    if let Some(delta) = data.get("delta").and_then(Value::as_str) {
                        if !delta.is_empty() {
                            let _ = app.emit("ws-chat-delta", delta);
                        }
                    }
                }
            }
            "tool" => {
                if let Some(app) = emit_ui {
                    let phase = data.get("phase").and_then(Value::as_str).unwrap_or("");
                    let tool_name = data.get("name").and_then(Value::as_str).unwrap_or("unknown");
                    let call_id = data.get("toolCallId").and_then(Value::as_str).unwrap_or("");

                    match phase {
                        "start" => {
                            let _ = app.emit("ws-chat-tool", json!({
                                "phase": "start",
                                "name": tool_name,
                                "callId": call_id,
                                "args": data.get("args").cloned().unwrap_or(json!({})).to_string(),
                            }));
                        }
                        "result" => {
                            let _ = app.emit("ws-chat-tool", json!({
                                "phase": "result",
                                "name": tool_name,
                                "callId": call_id,
                                "result": data.get("result").cloned().unwrap_or(json!({})).to_string(),
                            }));
                        }
                        _ => {}
                    }
                }
            }
            "reasoning" => {
                if let Some(app) = emit_ui {
                    if let Some(text) = data.get("text").and_then(Value::as_str) {
                        let _ = app.emit("ws-chat-reasoning", text);
                    } else if let Some(delta) = data.get("delta").and_then(Value::as_str) {
                        let _ = app.emit("ws-chat-reasoning", delta);
                    }
                }
            }
            "lifecycle" => {
                let phase = data.get("phase").and_then(Value::as_str).unwrap_or("");
                if phase == "end" || phase == "error" {
                    if phase == "error" {
                        let error_msg = data.get("error").and_then(Value::as_str).unwrap_or("未知错误");
                        terminal_error = Some(error_msg.to_string());
                    }
                    break;
                }
            }
            _ => {}
        }
    }

    if let Some(app) = emit_ui {
        let _ = app.emit("ws-chat-done", "");
    }

    if let Some(err) = terminal_error {
        Err(err)
    } else {
        Ok(())
    }
}

// ─── Tauri Commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn ws_chat_send(
    app_handle: AppHandle,
    port: u16,
    agent_id: String,
    session_key: String,
    message: String,
    profile: Option<String>,
    token_override: Option<String>,
) -> Result<(), String> {
    let identity = load_or_generate_identity()?;
    let token = match token_override.as_deref().filter(|t| !t.is_empty()) {
        Some(t) => t.to_string(),
        None => {
            let profile_ref = profile.as_deref().or(if agent_id == "default" { Some("default") } else { None });
            read_gateway_token(profile_ref)
        }
    };

    let mut conn = ws_connect(port, &identity, &token).await?;

    let req_id = uuid::Uuid::new_v4().to_string();
    let chat_req = json!({
        "type": "req",
        "id": req_id,
        "method": "chat.send",
        "params": {
            "sessionKey": session_key,
            "message": message,
            "idempotencyKey": format!("clawteam-{}", uuid::Uuid::new_v4()),
        },
    });

    conn.write
        .send(WsMessage::Text(chat_req.to_string().into()))
        .await
        .map_err(|e| format!("发送 chat.send 失败: {}", e))?;

    drain_gateway_chat_stream(&mut conn.read, Some(&app_handle)).await?;
    let _ = conn.write.send(WsMessage::Close(None)).await;

    Ok(())
}

async fn ws_handshake_ok(port: u16, identity: &DeviceIdentity, token: &str) -> bool {
    match ws_connect(port, identity, token).await {
        Ok(mut conn) => {
            let _ = conn.write.send(WsMessage::Close(None)).await;
            true
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn ws_probe_gateway(port: u16, profile: Option<String>, token_override: Option<String>) -> Result<bool, String> {
    let identity = load_or_generate_identity()?;
    let token = match token_override.as_deref().filter(|t| !t.is_empty()) {
        Some(t) => t.to_string(),
        None => read_gateway_token(profile.as_deref()),
    };
    Ok(ws_handshake_ok(port, &identity, &token).await)
}

pub(crate) async fn openclaw_gateway_ws_ready(instance_id: &str, port: u16) -> bool {
    let profile = match instance_id {
        "" | "default" => None,
        id => Some(id.to_string()),
    };
    ws_probe_gateway(port, profile, None).await.unwrap_or(false)
}

// --- Full session list (sessions.list, all channels) ---

/// One Gateway session row (all channels: in-app, Feishu, Telegram, etc.)
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GatewaySessionRow {
    pub session_key: String,
    pub session_id: Option<String>,
    /// Display label (from origin.label or channel).
    pub label: Option<String>,
    /// Channel: feishu / telegram / clawteam (in-app), etc.
    pub channel: Option<String>,
    pub updated_at: Option<u64>,
}

/// Extract session array from various sessions.list payload shapes (including grouped by agent/channel).
fn extract_sessions_array(payload: &Value) -> Result<Vec<&Value>, String> {
    if let Some(arr) = payload.as_array() {
        return Ok(arr.iter().collect());
    }
    if let Some(arr) = payload.get("sessions").and_then(Value::as_array) {
        return Ok(arr.iter().collect());
    }
    if let Some(arr) = payload.get("result").and_then(Value::as_array) {
        return Ok(arr.iter().collect());
    }
    if let Some(arr) = payload.get("list").and_then(Value::as_array) {
        return Ok(arr.iter().collect());
    }
    if let Some(arr) = payload.get("data").and_then(Value::as_array) {
        return Ok(arr.iter().collect());
    }
    if let Some(obj) = payload.as_object() {
        let mut out = Vec::new();
        for v in obj.values() {
            if let Some(arr) = v.as_array() {
                for s in arr {
                    out.push(s);
                }
            }
        }
        if !out.is_empty() {
            return Ok(out);
        }
    }
    Err("sessions.list 返回格式异常".to_string())
}

fn infer_channel_from_key(key: &str) -> Option<String> {
    if key.contains(":clawteam") {
        Some("clawteam".to_string())
    } else if key.contains(":feishu") || key.contains(":lark") {
        Some("feishu".to_string())
    } else if key.contains(":telegram") {
        Some("telegram".to_string())
    } else if key.contains(":discord") {
        Some("discord".to_string())
    } else if key.contains(":webchat") {
        Some("webchat".to_string())
    } else {
        None
    }
}

fn normalize_channel_display(channel: &str) -> String {
    match channel.to_lowercase().as_str() {
        "lark" => "feishu".to_string(),
        other => other.to_string(),
    }
}

#[tauri::command]
pub async fn list_gateway_sessions(instance_id: String, port: u16) -> Result<Vec<GatewaySessionRow>, String> {
    let identity = load_or_generate_identity()?;
    let profile = if instance_id.is_empty() || instance_id == "default" {
        None
    } else {
        Some(instance_id.as_str())
    };
    let token = read_gateway_token(profile);
    if token.is_empty() {
        return Err("该实例未配置 Gateway token".to_string());
    }

    let mut conn = ws_connect(port, &identity, &token).await?;
    // Request all session kinds; high limit so Feishu and other channels appear.
    let params = json!({ "limit": 500 });
    let payload = ws_send_req_and_wait_res(&mut conn, "sessions.list", params).await?;
    let _ = conn.write.send(WsMessage::Close(None)).await;

    let sessions = extract_sessions_array(&payload)?;

    let mut rows = Vec::new();
    for s in sessions {
        let key = s.get("key").or_else(|| s.get("sessionKey")).and_then(Value::as_str);
        let key = match key {
            Some(k) => k,
            None => continue,
        };
        let session_id = s.get("sessionId").and_then(Value::as_str).map(String::from);
        let updated_at = s
            .get("updatedAt")
            .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|i| i as u64)));

        let (label, channel_from_origin) = s
            .get("origin")
            .and_then(|o| {
                let l = o.get("label").and_then(Value::as_str).map(String::from);
                let c = o.get("provider").or_else(|| o.get("channel")).and_then(Value::as_str).map(String::from);
                Some((l, c))
            })
            .unwrap_or((None, None));

        let channel_top = s.get("channel").and_then(Value::as_str).map(String::from);
        let channel = channel_top
            .or(channel_from_origin)
            .or_else(|| infer_channel_from_key(key));
        let channel = channel.map(|c| normalize_channel_display(&c));

        rows.push(GatewaySessionRow {
            session_key: key.to_string(),
            session_id,
            label,
            channel,
            updated_at,
        });
    }
    rows.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(rows)
}

// --- Multi-agent session activity (sessions.list, exclude :subagent:, aggregate by agents.list roles) ---

/// OpenClaw main session key: `agent:<agentId>:...`; excludes subagent runs.
fn main_session_agent_id(key: &str) -> Option<&str> {
    if key.contains(":subagent:") {
        return None;
    }
    let rest = key.strip_prefix("agent:")?;
    let end = rest.find(':').unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    Some(&rest[..end])
}

fn updated_at_to_ms(v: &Value) -> u64 {
    v.as_u64()
        .or_else(|| v.as_i64().map(|i| i as u64))
        .or_else(|| v.as_f64().and_then(|f| {
            if f >= 0.0 && f <= u64::MAX as f64 {
                Some(f as u64)
            } else {
                None
            }
        }))
        .unwrap_or(0)
}

/// Normalize Gateway timestamp to ms (scale up if it looks like seconds).
fn normalize_updated_ms(raw: u64) -> u64 {
    if raw > 0 && raw < 1_000_000_000_000 {
        raw.saturating_mul(1000)
    } else {
        raw
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MultiAgentActivityRow {
    pub agent_id: String,
    /// `idle` or `active` (recent main session activity); frontend shows offline if Gateway is down.
    pub status: String,
    pub last_updated_at_ms: Option<u64>,
    pub session_count: u32,
}

/// Send one RPC and wait for matching response id.
async fn ws_send_req_and_wait_res(
    conn: &mut WsConn,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let req_id = uuid::Uuid::new_v4().to_string();
    let req = json!({
        "type": "req",
        "id": req_id,
        "method": method,
        "params": params,
    });
    conn.write
        .send(WsMessage::Text(req.to_string().into()))
        .await
        .map_err(|e| format!("发送 {} 失败: {}", method, e))?;

    let timeout = std::time::Duration::from_secs(15);
    loop {
        let msg = tokio::time::timeout(timeout, conn.read.next()).await;
        let frame = match msg {
            Ok(Some(Ok(WsMessage::Text(text)))) => serde_json::from_str::<Value>(&text).ok(),
            Ok(Some(Ok(WsMessage::Close(_)))) | Ok(None) => {
                return Err("连接已关闭".to_string());
            }
            Ok(Some(Ok(_))) => continue,
            Ok(Some(Err(e))) => return Err(e.to_string()),
            Err(_) => return Err("等待 sessions.list 响应超时".to_string()),
        };
        let Some(frame) = frame else { continue };
        if frame.get("type").and_then(Value::as_str) != Some("res") {
            continue;
        }
        if frame.get("id").and_then(Value::as_str) != Some(req_id.as_str()) {
            continue;
        }
        if frame.get("ok").and_then(Value::as_bool) == Some(false) {
            let err = frame.get("error").cloned().unwrap_or(json!({}));
            let msg = err.get("message").and_then(Value::as_str).unwrap_or("请求失败");
            return Err(msg.to_string());
        }
        return Ok(frame.get("payload").cloned().unwrap_or(json!([])));
    }
}

#[tauri::command]
pub async fn list_multi_agent_activity(instance_id: String, port: u16) -> Result<Vec<MultiAgentActivityRow>, String> {
    let cfg = config::load_openclaw_config_for_instance(instance_id.clone())?;
    let agent_ids = config::get_agent_ids(&cfg);
    if agent_ids.is_empty() {
        return Ok(vec![]);
    }

    let identity = load_or_generate_identity()?;
    let profile = if instance_id.is_empty() || instance_id == "default" {
        None
    } else {
        Some(instance_id.as_str())
    };
    let token = read_gateway_token(profile);
    if token.is_empty() {
        return Err("该实例未配置 Gateway token".to_string());
    }

    let mut conn = ws_connect(port, &identity, &token).await?;
    let payload = ws_send_req_and_wait_res(&mut conn, "sessions.list", json!({ "limit": 500 })).await?;
    let _ = conn.write.send(WsMessage::Close(None)).await;

    let sessions = extract_sessions_array(&payload)?;
    let mut agg: HashMap<String, (u64, u32)> = HashMap::new();

    for s in sessions {
        let key = s.get("key").or_else(|| s.get("sessionKey")).and_then(Value::as_str);
        let Some(key) = key else { continue };
        let Some(aid) = main_session_agent_id(key) else { continue };
        if !agent_ids.iter().any(|id| id == aid) {
            continue;
        }
        let raw = s.get("updatedAt").map(updated_at_to_ms).unwrap_or(0);
        let ts_ms = normalize_updated_ms(raw);
        let e = agg.entry(aid.to_string()).or_insert((0, 0));
        e.1 += 1;
        if ts_ms > e.0 {
            e.0 = ts_ms;
        }
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    const ACTIVE_WINDOW_MS: u64 = 120_000;

    let mut rows: Vec<MultiAgentActivityRow> = Vec::new();
    for aid in agent_ids {
        let (max_ts, count) = agg.get(&aid).copied().unwrap_or((0, 0));
        let status = if count == 0 {
            "idle"
        } else if max_ts > 0 && now_ms.saturating_sub(max_ts) < ACTIVE_WINDOW_MS {
            "active"
        } else {
            "idle"
        };
        rows.push(MultiAgentActivityRow {
            agent_id: aid,
            status: status.to_string(),
            last_updated_at_ms: if max_ts > 0 { Some(max_ts) } else { None },
            session_count: count,
        });
    }
    Ok(rows)
}

fn new_clawteam_notify_session_key(target_agent_id: &str) -> String {
    let u = uuid::Uuid::new_v4();
    let b = u.as_bytes();
    format!(
        "agent:{}:clawteam-{}",
        target_agent_id,
        hex::encode(&b[..4])
    )
}

fn pick_best_clawteam_session_key(sessions: &[&Value], target_agent_id: &str) -> Option<String> {
    let mut best: Option<(u64, String)> = None;
    for s in sessions {
        let Some(key) = s
            .get("key")
            .or_else(|| s.get("sessionKey"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        let in_app = key.contains(":clawteam");
        if main_session_agent_id(key) != Some(target_agent_id) || !in_app {
            continue;
        }
        let raw = s.get("updatedAt").map(updated_at_to_ms).unwrap_or(0);
        let ts = normalize_updated_ms(raw);
        if best.as_ref().map(|b| ts > b.0).unwrap_or(true) {
            best = Some((ts, key.to_string()));
        }
    }
    best.map(|b| b.1)
}

async fn notify_team_task_agents_impl(instance_id: String, per_agent: Vec<(String, String)>) {
    let id = instance_id.trim();
    let port = match config::get_instance_gateway_port(id) {
        Some(p) => p,
        None => {
            eprintln!("[clawteam] team task notify: no gateway port (instance id: {id:?})");
            return;
        }
    };
    let profile = if id.is_empty() || id == "default" {
        None
    } else {
        Some(id)
    };
    let token = read_gateway_token(profile);
    if token.is_empty() {
        eprintln!("[clawteam] team task notify: empty gateway token");
        return;
    }
    let Ok(identity) = load_or_generate_identity() else {
        eprintln!("[clawteam] team task notify: device identity unavailable");
        return;
    };
    let mut conn = match ws_connect(port, &identity, &token).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[clawteam] team task notify: ws connect failed: {e}");
            return;
        }
    };
    let payload = match ws_send_req_and_wait_res(&mut conn, "sessions.list", json!({ "limit": 500 })).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[clawteam] team task notify: sessions.list failed: {e}");
            let _ = conn.write.send(WsMessage::Close(None)).await;
            return;
        }
    };
    let sessions = match extract_sessions_array(&payload) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[clawteam] team task notify: sessions payload: {e}");
            let _ = conn.write.send(WsMessage::Close(None)).await;
            return;
        }
    };

    for (aid, message) in per_agent {
        let session_key =
            pick_best_clawteam_session_key(&sessions, &aid).unwrap_or_else(|| new_clawteam_notify_session_key(&aid));
        let req_id = uuid::Uuid::new_v4().to_string();
        let chat_req = json!({
            "type": "req",
            "id": req_id,
            "method": "chat.send",
            "params": {
                "sessionKey": session_key,
                "message": message.as_str(),
                "idempotencyKey": format!("clawteam-collab-{}", uuid::Uuid::new_v4()),
            },
        });
        if conn
            .write
            .send(WsMessage::Text(chat_req.to_string().into()))
            .await
            .is_err()
        {
            eprintln!("[clawteam] team task notify: chat.send write failed (agent {aid})");
            continue;
        }
        if let Err(e) = drain_gateway_chat_stream(&mut conn.read, None).await {
            eprintln!("[clawteam] team task notify: stream failed (agent {aid}): {e}");
            continue;
        }
    }
    let _ = conn.write.send(WsMessage::Close(None)).await;
}

/// After team tasks are persisted, notify agents asynchronously via Gateway `chat.send` (no UI stream forwarding).
/// Each pair is `(agent_id, message)` — message text is tailored per role (digest of relevant tasks).
pub fn spawn_team_task_notify(instance_id: String, per_agent: Vec<(String, String)>) {
    let pairs: Vec<(String, String)> = per_agent
        .into_iter()
        .filter(|(id, _)| !id.trim().is_empty())
        .collect();
    if pairs.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        notify_team_task_agents_impl(instance_id, pairs).await;
    });
}
