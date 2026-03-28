//! Remove per-instance services installed for an OpenClaw home: LaunchAgent (macOS), systemd user (Linux), scheduled tasks (Windows).

use crate::utils::paths;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

pub fn openclaw_home_match_string(profile_dir: &Path) -> String {
    let s = if profile_dir.exists() {
        fs::canonicalize(profile_dir)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| profile_dir.to_string_lossy().into_owned())
    } else {
        profile_dir.to_string_lossy().into_owned()
    };
    #[cfg(windows)]
    {
        return normalize_windows_home_match(s);
    }
    #[cfg(not(windows))]
    s
}

#[cfg(windows)]
fn normalize_windows_home_match(s: String) -> String {
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        format!(r"\{}", rest)
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        s
    }
}

#[cfg(target_os = "macos")]
fn string_refs_home(s: &str, home: &str) -> bool {
    if s == home {
        return true;
    }
    if s.len() <= home.len() || !s.starts_with(home) {
        return false;
    }
    match s.as_bytes().get(home.len()) {
        Some(b'/' | b'\\') => true,
        Some(b'"') | Some(b'\'') | Some(b' ') | Some(b'\t') | Some(b'\n' | b'\r') => true,
        Some(b'-') if home.ends_with(".openclaw") => false,
        _ => false,
    }
}

#[cfg(target_os = "macos")]
fn json_value_references_home(v: &Value, home: &str) -> bool {
    match v {
        Value::String(s) => string_refs_home(s, home),
        Value::Array(a) => a.iter().any(|x| json_value_references_home(x, home)),
        Value::Object(o) => o.values().any(|x| json_value_references_home(x, home)),
        _ => false,
    }
}

#[cfg(target_os = "macos")]
fn plist_label(v: &Value) -> Option<String> {
    v.get("Label")?.as_str().map(String::from)
}

pub fn remove_installed_services_for_openclaw_home(home_str: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    remove_macos_launch_agents(home_str)?;
    #[cfg(target_os = "linux")]
    remove_linux_user_units(home_str)?;
    #[cfg(target_os = "windows")]
    remove_windows_scheduled_tasks_for_home(home_str);
    Ok(())
}

#[cfg(target_os = "macos")]
fn remove_macos_launch_agents(home_str: &str) -> Result<(), String> {
    fn macos_uid() -> Option<String> {
        let out = Command::new("id").arg("-u").output().ok()?;
        if !out.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if s.is_empty() {
            return None;
        }
        Some(s)
    }

    let home = paths::get_home_dir().map_err(|e| e.to_string())?;
    let la_dir = PathBuf::from(home).join("Library/LaunchAgents");
    if !la_dir.is_dir() {
        return Ok(());
    }
    let uid = macos_uid();
    let entries = fs::read_dir(&la_dir).map_err(|e| e.to_string())?;
    for ent in entries.flatten() {
        let path = ent.path();
        if path.extension().map(|e| e != "plist").unwrap_or(true) {
            continue;
        }
        let out = Command::new("plutil")
            .args(["-convert", "json", "-o", "-"])
            .arg(&path)
            .output();
        let Ok(out) = out else {
            continue;
        };
        if !out.status.success() {
            continue;
        }
        let Ok(v) = serde_json::from_slice::<Value>(&out.stdout) else {
            continue;
        };
        if !json_value_references_home(&v, home_str) {
            continue;
        }
        let plist_path = path.to_string_lossy();
        match (plist_label(&v), uid.as_ref()) {
            (Some(label), Some(u)) => {
                let domain = format!("gui/{}/{}", u, label);
                let _ = Command::new("launchctl")
                    .args(["bootout", &domain])
                    .output();
            }
            _ => {
                let _ = Command::new("launchctl")
                    .args(["unload", plist_path.as_ref()])
                    .output();
            }
        }
        let _ = fs::remove_file(&path);
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn remove_linux_user_units(home_str: &str) -> Result<(), String> {
    fn unit_file_references_home(content: &str, home: &str) -> bool {
        for (idx, _) in content.match_indices(home) {
            let after = content[idx + home.len()..].chars().next();
            match after {
                None => return true,
                Some('/') | Some('\\') | Some('"') | Some('\'') | Some(' ') | Some('\t')
                | Some('\n') | Some('\r') => return true,
                Some('-') if home.ends_with(".openclaw") => continue,
                _ => {}
            }
        }
        false
    }

    let home = paths::get_home_dir().map_err(|e| e.to_string())?;
    let unit_dir = PathBuf::from(home).join(".config/systemd/user");
    if !unit_dir.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(&unit_dir).map_err(|e| e.to_string())?;
    let mut to_remove: Vec<PathBuf> = Vec::new();
    for ent in entries.flatten() {
        let path = ent.path();
        if path.extension().map(|e| e != "service").unwrap_or(true) {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        if unit_file_references_home(&content, home_str) {
            to_remove.push(path);
        }
    }
    for path in to_remove {
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let _ = Command::new("systemctl")
            .args(["--user", "disable", "--now", name])
            .output();
        let _ = fs::remove_file(&path);
    }
    let _ = Command::new("systemctl")
        .args(["--user", "daemon-reload"])
        .output();
    Ok(())
}

/// OpenClaw `gateway install` registers Windows scheduled tasks; match task XML referencing this instance path to avoid deleting other profiles.
#[cfg(target_os = "windows")]
fn remove_windows_scheduled_tasks_for_home(home_str: &str) {
    if home_str.is_empty() {
        return;
    }
    let b64 = B64.encode(home_str.as_bytes());
    let script = format!(
        r#"$h = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{b64}'))
function Test-RefHome($t) {{
  $i = 0
  while (($i = $t.IndexOf($h, $i, [StringComparison]::Ordinal)) -ge 0) {{
    $end = $i + $h.Length
    if ($end -ge $t.Length) {{ return $true }}
    $c = $t[$end]
    if ($c -eq [char]92 -or $c -eq [char]47 -or $c -eq [char]34 -or $c -eq [char]39 -or [char]::IsWhiteSpace($c)) {{ return $true }}
    if ($c -eq [char]45 -and $h.EndsWith('.openclaw', [StringComparison]::OrdinalIgnoreCase)) {{ $i++; continue }}
    $i++
  }}
  return $false
}}
Get-ScheduledTask -ErrorAction SilentlyContinue | ForEach-Object {{
  try {{
    $x = Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction Stop | Out-String
    if (Test-RefHome $x) {{
      Unregister-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Confirm:$false -ErrorAction SilentlyContinue
    }}
  }} catch {{}}
}}"#
    );
    let _ = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output();
}
