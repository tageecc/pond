//! Chat sessions: OpenClaw Gateway is the source of truth.
//! Transcripts live under instance root `agents/<agentId>/sessions/<SessionId>.jsonl` (e.g. `~/.openclaw/agents/main/sessions/`),
//! with `sessions.json` mapping sessionKey -> { sessionId, updatedAt, ... }.

use std::fs;
use std::io::BufRead;

use serde_json::Value;

/// OpenClaw session dir: `<instance root>/agents/<agent_id>/sessions/` (instance root is `~/.openclaw` or `~/.openclaw-*`).
fn session_store_dir(instance_id: &str, session_key: &str) -> Result<std::path::PathBuf, String> {
    let instance_dir = crate::utils::paths::instance_home(instance_id)?;
    let agent_id = session_key.split(':').nth(1).unwrap_or("main");
    Ok(instance_dir.join("agents").join(agent_id).join("sessions"))
}

/// Read ts/createdAt/timestamp from jsonl line top-level or inside `message` (ms number or string) as string.
fn ts_value_to_string(v: &Value) -> Option<String> {
    v.as_str()
        .map(String::from)
        .or_else(|| v.as_i64().map(|i| i.to_string()))
        .or_else(|| v.as_u64().map(|u| u.to_string()))
}

/// Extract timestamp text inside `[...]` from user message raw content; None if absent.
fn extract_sent_at_from_content(content: &str) -> Option<String> {
    let s = content.trim();
    let cut = match (s.rfind("] "), s.rfind("]\n")) {
        (Some(a), Some(b)) => (a + 2).max(b + 2),
        (Some(a), None) => a + 2,
        (None, Some(b)) => b + 2,
        (None, None) => return None,
    };
    if cut <= 2 {
        return None;
    }
    let before = &s[..cut - 2];
    let last_open = before.rfind('[')?;
    let after = &before[last_open + 1..];
    let close = after.find(']')?;
    Some(after[..close].trim().to_string())
}

/// Strip OpenClaw "Sender (untrusted metadata):" line, following JSON, and timestamp lines; keep body only.
fn strip_sender_metadata_from_content(content: &str) -> String {
    let s = content.trim();
    let has_metadata = s.contains("Sender (untrusted metadata)")
        || (s.starts_with('{') || (s.contains('{') && (s.contains("\"label\"") || s.contains("\"id\""))));
    if !has_metadata {
        return content.to_string();
    }
    let lines: Vec<&str> = s.lines().collect();
    let mut i = 0;
    if i < lines.len() && lines[i].contains("Sender (untrusted metadata)") {
        i += 1;
    }
    while i < lines.len() {
        let line = lines[i].trim();
        if line.starts_with('{') {
            i += 1;
            while i < lines.len() && !lines[i].trim().ends_with('}') {
                i += 1;
            }
            if i < lines.len() {
                i += 1;
            }
            continue;
        }
        if line.starts_with('[') {
            if let Some(pos) = line.find("] ") {
                let rest = line[pos + 2..].trim();
                let rest_owned = rest.to_string();
                let remainder: String = lines[i + 1..].join("\n").trim().to_string();
                if remainder.is_empty() {
                    return rest_owned;
                }
                return format!("{}\n{}", rest_owned, remainder);
            }
            if let Some(pos) = line.find(']') {
                let rest = line[pos + 1..].trim();
                if !rest.is_empty() {
                    let remainder: String = lines[i + 1..].join("\n").trim().to_string();
                    if remainder.is_empty() {
                        return rest.to_string();
                    }
                    return format!("{}\n{}", rest, remainder);
                }
            }
        }
        let from_here: String = lines[i..].join("\n").trim().to_string();
        return if from_here.is_empty() { content.to_string() } else { from_here };
    }
    content.to_string()
}

/// Resolve sessionKey -> sessionId from sessions.json (sessionKey -> { sessionId, updatedAt, ... }).
fn resolve_session_id_from_store(dir: &std::path::Path, session_key: &str) -> Option<String> {
    let path = dir.join("sessions.json");
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    let root: Value = serde_json::from_str(&content).ok()?;
    let map = root
        .as_object()
        .or_else(|| root.get("sessions").and_then(Value::as_object))
        .or_else(|| root.get("entries").and_then(Value::as_object))?;
    let entry = map.get(session_key).or_else(|| {
        map.iter()
            .find(|(k, _)| *k == session_key)
            .map(|(_, v)| v)
    })?;
    entry.get("sessionId").and_then(Value::as_str).map(String::from)
}

/// Parse OpenClaw transcript file to ChatMessage[] JSON for the frontend.
/// File name is **SessionId** (`<SessionId>.jsonl`), not sessionKey.
#[tauri::command]
pub fn load_session_transcript(
    instance_id: String,
    session_key: String,
    session_id: Option<String>,
) -> Result<String, String> {
    let dir = session_store_dir(&instance_id, &session_key)?;

    if !dir.exists() {
        return Ok("[]".to_string());
    }

    let file_session_id = session_id.or_else(|| resolve_session_id_from_store(&dir, &session_key));

    let path = if let Some(ref sid) = file_session_id {
        let p = dir.join(format!("{}.jsonl", sid));
        if p.exists() {
            Some(p)
        } else {
            None
        }
    } else {
        None
    };

    let path = path.or_else(|| {
        let base = session_key.replace(':', "-");
        let base_alt = session_key.replace(':', "_");
        [dir.join(format!("{}.jsonl", base)), dir.join(format!("{}.jsonl", base_alt))]
            .into_iter()
            .find(|p| p.exists())
    });

    let path = match path {
        Some(p) => p,
        None => return Ok("[]".to_string()),
    };

    let file = fs::File::open(&path).map_err(|e| format!("打开 transcript 失败: {}", e))?;
    let reader = std::io::BufReader::new(file);
    let mut messages: Vec<Value> = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        let json: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if json.get("type").and_then(|t| t.as_str()) != Some("message") {
            continue;
        }
        let msg = match json.get("message") {
            Some(m) => m,
            None => continue,
        };
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        if role != "user" && role != "assistant" {
            continue;
        }
        let mut content = msg
            .get("content")
            .and_then(|c| {
                if c.is_string() {
                    c.as_str().map(|s| s.to_string())
                } else if c.is_array() {
                    let parts: Vec<String> = c
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter_map(|p| {
                            if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                                p.get("text").and_then(|t| t.as_str()).map(String::from)
                            } else {
                                None
                            }
                        })
                        .collect();
                    Some(parts.join(""))
                } else {
                    None
                }
            })
            .unwrap_or_default();

        let mut sent_at: Option<String> = None;
        if role == "user" && !content.is_empty() {
            sent_at = extract_sent_at_from_content(&content);
            content = strip_sender_metadata_from_content(&content);
        }
        sent_at = sent_at
            .or_else(|| json.get("ts").and_then(ts_value_to_string))
            .or_else(|| json.get("createdAt").and_then(ts_value_to_string))
            .or_else(|| json.get("timestamp").and_then(ts_value_to_string))
            .or_else(|| msg.get("ts").and_then(ts_value_to_string))
            .or_else(|| msg.get("createdAt").and_then(ts_value_to_string))
            .or_else(|| msg.get("timestamp").and_then(ts_value_to_string));

        let id = json
            .get("id")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let mut msg_json = serde_json::json!({
            "id": id,
            "role": role,
            "content": content
        });
        if let Some(ts) = sent_at {
            msg_json["sentAt"] = serde_json::Value::String(ts);
        }
        messages.push(msg_json);
    }

    serde_json::to_string(&messages).map_err(|e| e.to_string())
}
