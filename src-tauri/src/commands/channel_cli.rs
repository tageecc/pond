//! Channels via official CLI: `channels add` / `remove`, `config set` / `unset`, `config validate` (docs.openclaw.ai/cli/channels, /cli/config). Discord uses `channels.discord.token` for `config set`; forms use `botToken`.

use crate::commands::gateway;
use crate::commands::workspace;
use serde_json::{Map, Value};
use tauri::AppHandle;

fn run_argv(app: &AppHandle, instance_id: &str, argv: Vec<String>) -> Result<(), String> {
    let refs: Vec<&str> = argv.iter().map(|s| s.as_str()).collect();
    let mut cmd = gateway::build_openclaw_cli_for_instance_sync(app, instance_id, &refs)?;
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let e = gateway::strip_npm_warn_lines(&String::from_utf8_lossy(&out.stderr));
        let o = String::from_utf8_lossy(&out.stdout);
        return Err(format!("{}\n{}", e.trim(), o.trim()));
    }
    Ok(())
}

fn require_inst_ch<'a>(inst: &'a str, ch: &'a str) -> Result<(&'a str, &'a str), String> {
    let inst = inst.trim();
    let ch = ch.trim();
    if inst.is_empty() {
        return Err("instance_id 不能为空".to_string());
    }
    if ch.is_empty() {
        return Err("channel_id 不能为空".to_string());
    }
    Ok((inst, ch))
}

fn sync_agents_and_validate(app: &AppHandle, instance_id: &str) -> Result<(), String> {
    workspace::sync_agents_list_with_openclaw_cli(app, instance_id)?;
    assert_config_valid_cli(app, instance_id)
}

/// OpenClaw config leaf name (Discord uses `token`; form field is `botToken`).
fn config_leaf_key(channel_id: &str, form_key: &str) -> String {
    if channel_id == "discord" && form_key == "botToken" {
        "token".to_string()
    } else {
        form_key.to_string()
    }
}

fn unset_optional(app: &AppHandle, instance_id: &str, path: &str) {
    let _ = workspace::run_openclaw_config_unset_sync(app, instance_id, path);
}

/// `openclaw channels add --channel <id> --token|--bot-token …` with optional `--name`.
fn argv_channels_add_with_token(
    channel: &str,
    token_flag: &str,
    token_value: &str,
    obj: &Map<String, Value>,
) -> Vec<String> {
    let mut argv = vec![
        "channels".into(),
        "add".into(),
        "--channel".into(),
        channel.to_string(),
        token_flag.into(),
        token_value.to_string(),
    ];
    if let Some(n) = obj
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        argv.push("--name".into());
        argv.push(n.to_string());
    }
    argv
}

fn assert_config_valid_cli(app: &AppHandle, instance_id: &str) -> Result<(), String> {
    let v = workspace::run_openclaw_config_validate_json_sync(app, instance_id)?;
    if v.get("valid") == Some(&Value::Bool(true)) {
        Ok(())
    } else {
        Err(format!(
            "openclaw config validate 未通过: {}",
            serde_json::to_string(&v).unwrap_or_else(|_| "{}".to_string())
        ))
    }
}

#[tauri::command]
pub fn openclaw_remove_channel(
    app: AppHandle,
    instance_id: String,
    channel_id: String,
) -> Result<(), String> {
    let (inst, ch) = require_inst_ch(&instance_id, &channel_id)?;
    run_argv(
        &app,
        inst,
        vec![
            "channels".into(),
            "remove".into(),
            "--channel".into(),
            ch.to_string(),
            "--delete".into(),
        ],
    )?;
    sync_agents_and_validate(&app, inst)?;
    Ok(())
}

/// New channel stub: `openclaw config set channels.<id> --strict-json`
#[tauri::command]
pub fn openclaw_add_channel_stub(
    app: AppHandle,
    instance_id: String,
    channel_id: String,
    agent_id: String,
    display_name: Option<String>,
) -> Result<(), String> {
    let (inst, ch) = require_inst_ch(&instance_id, &channel_id)?;
    let mut m = serde_json::Map::new();
    let aid = agent_id.trim();
    if !aid.is_empty() {
        m.insert("agentId".into(), Value::String(aid.to_string()));
    }
    if let Some(n) = display_name {
        let t = n.trim();
        if !t.is_empty() {
            m.insert("name".into(), Value::String(t.to_string()));
        }
    }
    let path = format!("channels.{}", ch);
    let json = serde_json::to_string(&Value::Object(m)).map_err(|e| e.to_string())?;
    workspace::run_openclaw_config_set_strict_json_sync(&app, inst, &path, &json)?;
    sync_agents_and_validate(&app, inst)?;
    Ok(())
}

#[tauri::command]
pub fn openclaw_apply_channel(
    app: AppHandle,
    instance_id: String,
    channel_id: String,
    payload: Value,
) -> Result<(), String> {
    let (inst, ch) = require_inst_ch(&instance_id, &channel_id)?;
    let Some(obj) = payload.as_object() else {
        return Err("payload 须为 JSON 对象".to_string());
    };

    let bot_token = obj
        .get("botToken")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let mut did_channels_add = false;
    match ch {
        "telegram" | "discord" => {
            if let Some(t) = bot_token {
                run_argv(
                    &app,
                    inst,
                    argv_channels_add_with_token(ch, "--token", t, obj),
                )?;
                did_channels_add = true;
            }
        }
        "slack" => {
            if let Some(t) = bot_token {
                run_argv(
                    &app,
                    inst,
                    argv_channels_add_with_token(ch, "--bot-token", t, obj),
                )?;
                did_channels_add = true;
            }
        }
        _ => {}
    }

    let prefix = format!("channels.{}", ch);
    for (k, v) in obj.iter() {
        if did_channels_add && (k == "botToken" || k == "name") {
            continue;
        }
        let leaf = config_leaf_key(ch, k);
        let path = format!("{}.{}", prefix, leaf);
        match v {
            Value::Null => unset_optional(&app, inst, &path),
            Value::String(s) if s.trim().is_empty() => unset_optional(&app, inst, &path),
            Value::Array(a) if a.is_empty() => unset_optional(&app, inst, &path),
            _ => {
                let json_s = serde_json::to_string(v).map_err(|e| e.to_string())?;
                workspace::run_openclaw_config_set_strict_json_sync(&app, inst, &path, &json_s)?;
            }
        }
    }

    sync_agents_and_validate(&app, inst)?;
    Ok(())
}
