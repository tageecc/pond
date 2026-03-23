use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize)]
pub struct TailscaleStatus {
    pub online: bool,
    #[serde(skip_serializing_if = "Option::is_none", rename = "deviceName")]
    pub device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "tailnetIp")]
    pub tailnet_ip: Option<String>,
    #[serde(rename = "connectedPeers")]
    pub connected_peers: Vec<TailscalePeer>,
}

#[derive(Serialize)]
pub struct TailscalePeer {
    pub name: String,
    #[serde(rename = "tailscaleIp")]
    pub tailscale_ip: String,
}

/// Subset of `tailscale status --json` (tolerates version differences).
#[derive(Deserialize)]
struct TailscaleJson {
    #[serde(default, rename = "Self")]
    self_node: Option<SelfNode>,
    #[serde(default, rename = "Peer")]
    peer: Option<std::collections::HashMap<String, PeerNode>>,
}

#[derive(Deserialize)]
struct SelfNode {
    #[serde(rename = "HostName", default)]
    host_name: Option<String>,
    #[serde(rename = "TailscaleIPs", default)]
    tailscale_ips: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct PeerNode {
    #[serde(rename = "HostName", default)]
    host_name: Option<String>,
    #[serde(rename = "TailscaleIPs", default)]
    tailscale_ips: Option<Vec<String>>,
}

/// Tailscale status (offline when not installed or not logged in).
#[tauri::command]
pub fn get_tailscale_status() -> Result<TailscaleStatus, String> {
    let out = match Command::new("tailscale").args(["status", "--json"]).output() {
        Ok(o) => o,
        Err(_) => {
            return Ok(TailscaleStatus {
                online: false,
                device_name: None,
                tailnet_ip: None,
                connected_peers: vec![],
            });
        }
    };

    if !out.status.success() {
        return Ok(TailscaleStatus {
            online: false,
            device_name: None,
            tailnet_ip: None,
            connected_peers: vec![],
        });
    }

    let json_str = String::from_utf8_lossy(&out.stdout);
    let parsed: TailscaleJson = match serde_json::from_str(&json_str) {
        Ok(p) => p,
        Err(_) => {
            return Ok(TailscaleStatus {
                online: false,
                device_name: None,
                tailnet_ip: None,
                connected_peers: vec![],
            });
        }
    };

    let device_name = parsed.self_node.as_ref().and_then(|s| s.host_name.clone());
    let tailnet_ip = parsed
        .self_node
        .as_ref()
        .and_then(|s| s.tailscale_ips.as_ref())
        .and_then(|v| v.first().cloned());

    let connected_peers: Vec<TailscalePeer> = parsed
        .peer
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(_, p)| {
            let name = p.host_name.unwrap_or_else(|| "?".to_string());
            let ip = p.tailscale_ips.and_then(|v| v.into_iter().next()).unwrap_or_default();
            if ip.is_empty() {
                None
            } else {
                Some(TailscalePeer { name, tailscale_ip: ip })
            }
        })
        .collect();

    Ok(TailscaleStatus {
        online: true,
        device_name,
        tailnet_ip,
        connected_peers,
    })
}

/// Restart Tailscale (`down` then `up`; no-op if binary missing).
#[tauri::command]
pub fn restart_tailscale() -> Result<(), String> {
    let _ = std::process::Command::new("tailscale").arg("down").status();
    std::process::Command::new("tailscale").arg("up").status().map_err(|e| e.to_string())?;
    Ok(())
}
