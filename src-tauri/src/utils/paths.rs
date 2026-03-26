use std::fs;
use std::path::{Path, PathBuf};
use anyhow::Result;

const APP_ID: &str = "ai.clawhub.pond";

pub fn get_home_dir() -> Result<String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| anyhow::anyhow!("Cannot determine home directory"))?;
    Ok(home)
}

#[cfg(windows)]
pub fn get_app_data_dir() -> Result<PathBuf> {
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("USERPROFILE").map(|p| format!("{}\\AppData\\Roaming", p)))
        .map_err(|_| anyhow::anyhow!("Cannot get app data directory"))?;
    let dir = PathBuf::from(base).join(APP_ID);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

#[cfg(target_os = "macos")]
pub fn get_app_data_dir() -> Result<PathBuf> {
    let home = get_home_dir()?;
    let dir = PathBuf::from(&home).join("Library/Application Support").join(APP_ID);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn get_app_data_dir() -> Result<PathBuf> {
    let base = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
        std::env::var("HOME")
            .map(|h| format!("{}/.local/share", h))
            .unwrap_or_else(|_| "/tmp".to_string())
    });
    let dir = PathBuf::from(base).join(APP_ID);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

/// Pond instance root: primary instance is **only** `~/.openclaw` (instance id `default`, case-insensitive).
/// Secondary instances use `~/.openclaw-{id}` (`id` is never empty). Do not use instance id `main` (reserved / confusing).
/// Note: if you see `~/.openclaw-main` directory, it was created by mistake in older versions (when `openclaw agents add main`
/// was incorrectly called without proper instance scoping). It can be safely deleted. Never use `~/.openclaw-default` (not a Pond convention).
pub fn instance_home(instance_id: &str) -> Result<PathBuf, String> {
    let id = instance_id.trim();
    if id.is_empty() {
        return Err("instance_id is empty".into());
    }
    let home = get_home_dir().map_err(|e| e.to_string())?;
    if id.eq_ignore_ascii_case("default") {
        return Ok(PathBuf::from(home).join(".openclaw"));
    }
    Ok(PathBuf::from(home).join(format!(".openclaw-{}", id)))
}

pub fn instance_config_path(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instance_home(instance_id)?.join("openclaw.json"))
}

/// `None` or empty string → `default`.
pub fn workspace_dir(instance_id: Option<&str>) -> Result<PathBuf, String> {
    let id = instance_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("default");
    Ok(instance_home(id)?.join("workspace"))
}

pub fn skills_dir(instance_id: Option<&str>) -> Result<PathBuf, String> {
    let id = instance_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("default");
    Ok(instance_home(id)?.join("skills"))
}

pub fn get_spend_file_path() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("spend.json"))
}

pub fn team_data_dir(instance_id: &str) -> Result<PathBuf, String> {
    let id = instance_id.trim();
    let id = if id.is_empty() { "default" } else { id };
    Ok(instance_home(id)?.join("team"))
}

pub fn team_instance_filename_stem(instance_id: &str) -> String {
    instance_id.replace(std::path::MAIN_SEPARATOR, "_")
}

pub fn team_meta_json_path(instance_id: &str) -> Result<PathBuf, String> {
    let dir = team_data_dir(instance_id)?;
    let stem = team_instance_filename_stem(instance_id);
    Ok(dir.join(format!("{stem}.json")))
}

pub fn team_tasks_json_path(instance_id: &str) -> Result<PathBuf, String> {
    let dir = team_data_dir(instance_id)?;
    let stem = team_instance_filename_stem(instance_id);
    Ok(dir.join(format!("{stem}_tasks.json")))
}

/// Subdirectory names under `skills` / `workspace/skills` (exclude hidden and `skills-index.json`).
pub fn skill_subdir_names(dir: &Path) -> Vec<String> {
    let mut ids = Vec::new();
    if !dir.exists() {
        return ids;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return ids;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name != "skills-index.json" && !name.starts_with('.') {
            ids.push(name.to_string());
        }
    }
    ids.sort();
    ids
}
