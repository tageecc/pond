use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::io::BufRead;
use crate::utils::paths;
use crate::models_pricing::{get_model_pricing, USD_TO_CNY};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SpendData {
    /// Today's spend (USD).
    #[serde(default, rename = "todayUsd")]
    pub today_usd: f64,
    /// Daily history YYYY-MM-DD -> amount.
    #[serde(default)]
    pub daily: HashMap<String, f64>,
    /// Last update time (ISO8601).
    #[serde(default, rename = "updatedAt")]
    pub updated_at: String,
}

fn load_spend_data() -> Result<SpendData, String> {
    let path = paths::get_spend_file_path().map_err(|e| e.to_string())?;
    if !path.exists() {
        return Ok(SpendData::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_spend_data(data: &SpendData) -> Result<(), String> {
    let path = paths::get_spend_file_path().map_err(|e| e.to_string())?;
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn today_str() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Today's spend (USD) and day-over-day / month-over-month deltas.
#[tauri::command]
pub fn get_today_spend() -> Result<TodaySpendResult, String> {
    let mut data = load_spend_data()?;
    let today = today_str();
    // Roll calendar: move yesterday to daily and reset today.
    let updated = data.updated_at.split('T').next().unwrap_or("");
    if !updated.is_empty() && updated != today {
        if data.today_usd > 0.0 {
            data.daily.insert(updated.to_string(), data.today_usd);
        }
        data.today_usd = 0.0;
    }
    data.updated_at = chrono::Utc::now().to_rfc3339();
    save_spend_data(&data)?;

    let yesterday = (chrono::Local::now() - chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
    let yesterday_amount = data.daily.get(&yesterday).copied().unwrap_or(0.0);
    let mut daily_vec: Vec<_> = data.daily.iter().collect();
    daily_vec.sort_by(|a, b| b.0.cmp(a.0));
    let last_7_days: f64 = daily_vec.iter().take(7).map(|(_, v)| *v).sum::<f64>() + data.today_usd;

    // Prior-month daily average (days 31-60 ago).
    let prev_month_end = (chrono::Local::now() - chrono::Duration::days(31)).format("%Y-%m-%d").to_string();
    let prev_month_begin = (chrono::Local::now() - chrono::Duration::days(60)).format("%Y-%m-%d").to_string();
    let prev_month_total: f64 = data.daily.iter()
        .filter(|(d, _)| d.as_str() >= prev_month_begin.as_str() && d.as_str() <= prev_month_end.as_str())
        .map(|(_, v)| v)
        .sum();
    let prev_month_daily_avg = if prev_month_total > 0.0 { prev_month_total / 30.0 } else { 0.0 };

    let pct_day = if yesterday_amount > 0.0 {
        ((data.today_usd - yesterday_amount) / yesterday_amount) * 100.0
    } else {
        0.0
    };
    let pct_mom = if prev_month_daily_avg > 0.0 {
        (data.today_usd / prev_month_daily_avg - 1.0) * 100.0
    } else {
        0.0
    };

    Ok(TodaySpendResult {
        today_usd: (data.today_usd * 100.0).round() / 100.0,
        change_day_pct: (pct_day * 100.0).round() / 100.0,
        change_mom_pct: (pct_mom * 100.0).round() / 100.0,
        last_7_days,
    })
}

#[derive(Serialize)]
pub struct TodaySpendResult {
    #[serde(rename = "todayUsd")]
    pub today_usd: f64,
    #[serde(rename = "changeDayPct")]
    pub change_day_pct: f64,
    #[serde(rename = "changeMomPct")]
    pub change_mom_pct: f64,
    #[serde(rename = "last7Days")]
    pub last_7_days: f64,
}

/// Daily spend rows for analytics cost trend chart.
#[derive(Serialize)]
pub struct DailySpendEntry {
    /// Date YYYY-MM-DD.
    pub date: String,
    /// Spend that day (USD).
    pub usd: f64,
}

/// Last N days of daily spend (includes today), ascending. Read-only; does not roll dates.
#[tauri::command]
pub fn get_spend_daily_history(days: u32) -> Result<Vec<DailySpendEntry>, String> {
    let data = load_spend_data()?;
    let today = today_str();
    let days = days.min(365);
    let start = (chrono::Local::now() - chrono::Duration::days(days as i64)).format("%Y-%m-%d").to_string();
    let mut out: Vec<DailySpendEntry> = data
        .daily
        .iter()
        .filter(|(d, _)| d.as_str() >= start.as_str() && d.as_str() <= today.as_str())
        .map(|(date, &usd)| DailySpendEntry {
            date: date.clone(),
            usd: (usd * 100.0).round() / 100.0,
        })
        .collect();
    out.sort_by(|a, b| a.date.cmp(&b.date));
    if out.last().map(|e| e.date.as_str()) != Some(today.as_str()) {
        out.push(DailySpendEntry {
            date: today,
            usd: (data.today_usd * 100.0).round() / 100.0,
        });
        out.sort_by(|a, b| a.date.cmp(&b.date));
    }
    Ok(out)
}

// --- Token usage stats ---

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct TokenData {
    #[serde(default)]
    pub agents: HashMap<String, AgentTokens>,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AgentTokens {
    #[serde(default)]
    pub input: u64,
    #[serde(default)]
    pub output: u64,
}

fn token_file_path() -> Result<std::path::PathBuf, String> {
    let dir = paths::get_app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("tokens.json"))
}

fn load_token_data() -> Result<TokenData, String> {
    let path = token_file_path()?;
    if !path.exists() { return Ok(TokenData::default()); }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_token_data(data: &TokenData) -> Result<(), String> {
    let path = token_file_path()?;
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct TokenStatsResult {
    #[serde(rename = "totalInput")]
    pub total_input: u64,
    #[serde(rename = "totalOutput")]
    pub total_output: u64,
    pub agents: HashMap<String, AgentTokens>,
}

#[tauri::command]
pub fn get_token_stats() -> Result<TokenStatsResult, String> {
    let data = load_token_data()?;
    let total_input: u64 = data.agents.values().map(|a| a.input).sum();
    let total_output: u64 = data.agents.values().map(|a| a.output).sum();
    Ok(TokenStatsResult {
        total_input,
        total_output,
        agents: data.agents,
    })
}

#[tauri::command]
pub fn record_token_usage(agent_id: String, input_tokens: u64, output_tokens: u64) -> Result<(), String> {
    let mut data = load_token_data()?;
    let entry = data.agents.entry(agent_id).or_default();
    entry.input += input_tokens;
    entry.output += output_tokens;
    data.updated_at = chrono::Utc::now().to_rfc3339();
    save_token_data(&data)?;
    Ok(())
}

/// Record one spend line (adds to today).
/// Fixed USD->CNY rate for display.
#[tauri::command]
pub fn get_exchange_rate() -> f64 {
    USD_TO_CNY
}

#[tauri::command]
pub fn record_spend(amount_usd: f64) -> Result<(), String> {
    if !amount_usd.is_finite() || amount_usd < 0.0 {
        return Err("消费金额必须为非负有限数".to_string());
    }
    let mut data = load_spend_data()?;
    let today = today_str();
    let updated = data.updated_at.split('T').next().unwrap_or("");
    if !updated.is_empty() && updated != today {
        if data.today_usd > 0.0 {
            data.daily.insert(updated.to_string(), data.today_usd);
        }
        data.today_usd = 0.0;
    }
    data.today_usd += amount_usd;
    data.updated_at = chrono::Utc::now().to_rfc3339();
    save_spend_data(&data)?;
    Ok(())
}

// --- Sync usage from OpenClaw session logs ---
//
// Performance notes:
// 1. Single pass computes total tokens and today's cost (no second file read).
// 2. Local pricing DB only (no network).
// 3. Frontend refresh ~5 min to limit IO.
//
// Sample (2026-03-13): 9 jsonl files, 96 lines, 104KB -> scan < 50ms; ~1000 files / 10MB est. < 500ms.

/// Scan all agent sessions under one OpenClaw instance root.
fn scan_openclaw_instance(
    openclaw_base: &Path,
    instance_id: &str,
    total_input: &mut u64,
    total_output: &mut u64,
    total_cost: &mut f64,
    agent_tokens: &mut HashMap<String, AgentTokens>,
    sessions_processed: &mut usize,
) -> Result<(), String> {
    let agents_dir = openclaw_base.join("agents");
    
    // Skip if no agents dir.
    if !agents_dir.exists() {
        return Ok(());
    }
    
    // Walk each agent subdir.
    if let Ok(entries) = fs::read_dir(&agents_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if let Ok(agent_name) = entry.file_name().into_string() {
                    let sessions_dir = entry.path().join("sessions");
                    if sessions_dir.exists() {
                        // Stable key: instance_id:agent_name
                        let full_agent_id = format!("{}:{}", instance_id, agent_name);
                        
                        // One pass: totals + today's cost
                        let stats = scan_sessions_dir(&sessions_dir)?;
                        
                        *total_input += stats.total_input;
                        *total_output += stats.total_output;
                        *total_cost += stats.today_cost;
                        *sessions_processed += stats.session_count;
                        
                        if stats.total_input > 0 || stats.total_output > 0 {
                            agent_tokens.insert(full_agent_id, AgentTokens {
                                input: stats.total_input,
                                output: stats.total_output,
                            });
                        }
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Scan all OpenClaw session logs; aggregate tokens and cost.
#[tauri::command]
pub fn sync_usage_from_sessions() -> Result<SyncResult, String> {
    let mut total_input = 0u64;
    let mut total_output = 0u64;
    let mut total_cost = 0.0f64;
    let mut agent_tokens: HashMap<String, AgentTokens> = HashMap::new();
    let mut sessions_processed = 0usize;
    
    let managed_agents = crate::commands::config::list_openclaw_instances()?;

    for instance_id in managed_agents {
        let root = paths::instance_home(instance_id.as_str())?;
        if root.exists() {
            scan_openclaw_instance(
                &root,
                instance_id.as_str(),
                &mut total_input,
                &mut total_output,
                &mut total_cost,
                &mut agent_tokens,
                &mut sessions_processed,
            )?;
        }
    }
    
    // Persist token stats
    let token_data = TokenData {
        agents: agent_tokens,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    save_token_data(&token_data)?;
    
    // Spend: simplified — treat total cost as today
    let mut spend_data = load_spend_data()?;
    spend_data.today_usd = (total_cost * 100.0).round() / 100.0;
    spend_data.updated_at = chrono::Utc::now().to_rfc3339();
    save_spend_data(&spend_data)?;
    
    eprintln!("[sync_usage_from_sessions] 统计完成: input={}, output={}, cost=${:.2}, sessions={}, agents={}", 
        total_input, total_output, total_cost, sessions_processed, token_data.agents.len());
    
    Ok(SyncResult {
        total_input,
        total_output,
        total_cost_usd: (total_cost * 100.0).round() / 100.0,
        sessions_processed,
        agents_count: token_data.agents.len(),
    })
}

#[derive(Serialize)]
pub struct SyncResult {
    pub total_input: u64,
    pub total_output: u64,
    #[serde(rename = "totalCostUsd")]
    pub total_cost_usd: f64,
    #[serde(rename = "sessionsProcessed")]
    pub sessions_processed: usize,
    #[serde(rename = "agentsCount")]
    pub agents_count: usize,
}

/// Aggregates for one sessions directory.
#[derive(Debug, Default)]
struct SessionDirStats {
    total_input: u64,
    total_output: u64,
    today_cost: f64,
    session_count: usize,
}

/// Scan one sessions dir in one pass.
fn scan_sessions_dir(sessions_dir: &Path) -> Result<SessionDirStats, String> {
    let mut stats = SessionDirStats::default();
    
    if let Ok(entries) = fs::read_dir(sessions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                stats.session_count += 1;
                if let Ok(file_stats) = parse_session_file(&path) {
                    stats.total_input += file_stats.total_input;
                    stats.total_output += file_stats.total_output;
                    stats.today_cost += file_stats.today_cost;
                }
            }
        }
    }
    
    Ok(stats)
}

/// Per-file stats: totals and today's cost.
#[derive(Debug, Default)]
struct SessionFileStats {
    total_input: u64,
    total_output: u64,
    today_cost: f64,
}

/// Parse one session .jsonl: totals and today's cost in one pass.
fn parse_session_file(path: &Path) -> Result<SessionFileStats, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = std::io::BufReader::new(file);
    
    let mut stats = SessionFileStats::default();
    let today = today_str();
    
    for line in reader.lines() {
        if let Ok(line_str) = line {
            if let Ok(json) = serde_json::from_str::<Value>(&line_str) {
                // Only assistant messages
                if json.get("type").and_then(|t| t.as_str()) != Some("message") {
                    continue;
                }
                if json.get("message").and_then(|m| m.get("role")).and_then(|r| r.as_str()) != Some("assistant") {
                    continue;
                }
                
                // message object
                if let Some(message) = json.get("message") {
                    // provider + model
                    let provider = message.get("provider").and_then(|p| p.as_str()).unwrap_or("");
                    let model_id = message.get("model").and_then(|m| m.as_str()).unwrap_or("");
                    
                    // usage
                    if let Some(usage) = message.get("usage") {
                        // OpenClaw v3: usage.input, usage.output, usage.cacheRead, usage.cacheWrite
                        let input = usage.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
                        let output = usage.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
                        let cache_read = usage.get("cacheRead").and_then(|v| v.as_u64()).unwrap_or(0);
                        let cache_write = usage.get("cacheWrite").and_then(|v| v.as_u64()).unwrap_or(0);
                        
                        // Sum tokens
                        stats.total_input += input;
                        stats.total_output += output;
                        
                        // Cost
                        let openclaw_cost = usage.get("cost")
                            .and_then(|c| c.get("total"))
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        
                        let cost = if openclaw_cost > 0.0 {
                            openclaw_cost
                        } else if !provider.is_empty() && !model_id.is_empty() {
                            // Fallback pricing when OpenClaw has no cost
                            get_model_pricing(provider, model_id)
                                .map(|pricing| pricing.calculate_cost(input, output, cache_read, cache_write))
                                .unwrap_or(0.0)
                        } else {
                            0.0
                        };
                        
                        // today_cost only for today's timestamps
                        if let Some(timestamp) = json.get("timestamp").and_then(|t| t.as_str()) {
                            if timestamp.starts_with(&today) {
                                stats.today_cost += cost;
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(stats)
}

/// Per-session file: tokens grouped by date (for token trend chart).
fn parse_session_file_daily(path: &Path) -> Result<HashMap<String, (u64, u64)>, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = std::io::BufReader::new(file);
    let mut by_date: HashMap<String, (u64, u64)> = HashMap::new();
    for line in reader.lines() {
        let line_str = line.map_err(|e| e.to_string())?;
        let json: Value = serde_json::from_str(&line_str).map_err(|e| e.to_string())?;
        if json.get("type").and_then(|t| t.as_str()) != Some("message") {
            continue;
        }
        if json.get("message").and_then(|m| m.get("role")).and_then(|r| r.as_str()) != Some("assistant") {
            continue;
        }
        let date = json
            .get("timestamp")
            .and_then(|t| t.as_str())
            .map(|s| s.get(..10).unwrap_or("").to_string())
            .unwrap_or_else(|| today_str());
        if date.is_empty() {
            continue;
        }
        if let Some(message) = json.get("message").and_then(|m| m.get("usage")) {
            let input = message.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
            let output = message.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
            let entry = by_date.entry(date).or_insert((0, 0));
            entry.0 += input;
            entry.1 += output;
        }
    }
    Ok(by_date)
}

/// One sessions dir: per-date token sums (with agent id in outer map).
fn scan_sessions_dir_daily(sessions_dir: &Path) -> Result<HashMap<String, AgentTokens>, String> {
    let mut by_date: HashMap<String, AgentTokens> = HashMap::new();
    if let Ok(entries) = fs::read_dir(sessions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                if let Ok(day_map) = parse_session_file_daily(&path) {
                    for (date, (input, output)) in day_map {
                        let e = by_date.entry(date).or_insert(AgentTokens::default());
                        e.input += input;
                        e.output += output;
                    }
                }
            }
        }
    }
    Ok(by_date)
}

/// Per-day per-agent token stats (multi-line chart).
#[derive(Serialize)]
pub struct TokenDailyEntry {
    pub date: String,
    pub agents: HashMap<String, AgentTokens>,
}

/// Last N days of per-agent tokens across instances (read-only).
#[tauri::command]
pub fn get_token_daily_history(days: u32) -> Result<Vec<TokenDailyEntry>, String> {
    let days = days.min(365);
    let start = (chrono::Local::now() - chrono::Duration::days(days as i64)).format("%Y-%m-%d").to_string();
    let today = today_str();

    let managed_agents = crate::commands::config::list_openclaw_instances()?;

    let mut date_agents: HashMap<String, HashMap<String, AgentTokens>> = HashMap::new();

    let mut scan_instance = |instance_root: &Path, instance_id: &str| -> Result<(), String> {
        let agents_dir = instance_root.join("agents");
        if !agents_dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&agents_dir).map_err(|e| e.to_string())?.flatten() {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let agent_name = match entry.file_name().into_string() {
                Ok(a) => a,
                Err(_) => continue,
            };
            let full_agent_id = format!("{}:{}", instance_id, agent_name);
            let sessions_dir = entry.path().join("sessions");
            if !sessions_dir.exists() {
                continue;
            }
            let by_date = scan_sessions_dir_daily(&sessions_dir)?;
            for (date, tokens) in by_date {
                if date.as_str() < start.as_str() || date.as_str() > today.as_str() {
                    continue;
                }
                date_agents
                    .entry(date)
                    .or_default()
                    .insert(full_agent_id.clone(), tokens);
            }
        }
        Ok(())
    };

    for instance_id in managed_agents {
        let root = paths::instance_home(instance_id.as_str())?;
        if root.exists() {
            scan_instance(&root, instance_id.as_str())?;
        }
    }

    let mut out: Vec<TokenDailyEntry> = date_agents
        .into_iter()
        .map(|(date, agents)| TokenDailyEntry { date, agents })
        .collect();
    out.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(out)
}

/// Clean up analytics data (tokens) for a deleted instance
pub fn cleanup_instance_analytics_data(instance_id: &str) -> Result<(), String> {
    let mut token_data = load_token_data()?;
    let prefix = format!("{}:", instance_id);
    
    token_data.agents.retain(|agent_key, _| !agent_key.starts_with(&prefix));
    
    token_data.updated_at = chrono::Utc::now().to_rfc3339();
    save_token_data(&token_data)?;
    
    eprintln!("[cleanup_instance_analytics_data] Cleaned analytics data for instance: {}", instance_id);
    Ok(())
}
