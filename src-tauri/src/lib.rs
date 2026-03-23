mod commands;
mod utils;
mod models_pricing;

#[allow(dead_code)]
const _: &str = env!("TAURI_ICON_STAMP");

use commands::{gateway, channel_cli, config, team_meta, team_tasks, workspace, skills, diagnostics, spend, cron_jobs, tailscale, chat, ws_gateway, tray_menu};
use std::sync::Mutex;
use tauri::{Manager, menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent}};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            app.manage(gateway::GatewayState::default());
            app.manage(config::ExitPreferences::default());

            // Build system tray menu
            let show_item = MenuItem::with_id(app, "show", "显示面板", true, None::<&str>)?;
            let start_item = MenuItem::with_id(app, "start", "启动服务", true, None::<&str>)?;
            let stop_item = MenuItem::with_id(app, "stop", "停止服务", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            
            let menu = Menu::with_items(app, &[
                &show_item,
                &start_item,
                &stop_item,
                &quit_item,
            ])?;
            
            // Tray icon (requires bundle.icon in tauri.conf or this may panic)
            let icon = app.default_window_icon()
                .cloned()
                .expect("Tray 需要窗口图标，请在 tauri.conf.json bundle.icon 中配置");
            let tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "start" => {
                            let app_handle = app.app_handle().clone();
                            tauri::async_runtime::spawn(async move {
                                let state = app_handle.state::<gateway::GatewayState>();
                                let _ = gateway::start_gateway(
                                    state,
                                    app_handle.clone(),
                                    None,
                                    None
                                ).await;
                            });
                        }
                        "stop" => {
                            let app_handle = app.app_handle().clone();
                            tauri::async_runtime::spawn(async move {
                                let state = app_handle.state::<gateway::GatewayState>();
                                let _ = gateway::stop_gateway(
                                    state,
                                    app_handle.clone(),
                                    None
                                ).await;
                            });
                        }
                        "quit" => {
                            let prefs = app.try_state::<config::ExitPreferences>();
                            if let Some(p) = prefs {
                                if let Ok(guard) = p.0.lock() {
                                    if guard.1 {
                                        gateway::stop_all_gateways_on_exit(app);
                                    }
                                }
                            }
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            app.manage(tray_menu::TrayIconHandle(Mutex::new(Some(tray))));

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                api.prevent_close();
                let minimize = app.try_state::<config::ExitPreferences>()
                    .and_then(|p| p.0.lock().ok().map(|g| g.0))
                    .unwrap_or(true);
                if minimize {
                    let _ = window.hide();
                } else {
                    if let Some(p) = app.try_state::<config::ExitPreferences>() {
                        if let Ok(guard) = p.0.lock() {
                            if guard.1 {
                                gateway::stop_all_gateways_on_exit(&app);
                            }
                        }
                    }
                    std::process::exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Gateway commands
            gateway::start_gateway,
            gateway::stop_gateway,
            gateway::restart_gateway,
            gateway::get_gateway_status,
            gateway::get_gateway_port,
            gateway::get_gateway_pid,
            gateway::get_gateway_uptime_seconds,
            gateway::get_gateway_memory_mb,
            gateway::get_all_gateway_statuses,
            gateway::probe_running_gateways,
            gateway::discover_system_agents,
            gateway::count_openclaw_instances,
            gateway::delete_system_agent_dir,
            gateway::get_agent_port,
            gateway::set_agent_port,
            gateway::delete_agent_cleanup,
            gateway::run_browser_command,
            gateway::list_hooks_for_instance,
            gateway::get_gateway_log_path,
            gateway::start_tail_gateway_log,
            gateway::stop_tail_gateway_log,
            // WebSocket RPC
            ws_gateway::ws_chat_send,
            ws_gateway::ws_probe_gateway,
            ws_gateway::list_gateway_sessions,
            ws_gateway::list_multi_agent_activity,
            team_meta::read_team_meta,
            team_meta::save_team_meta,
            team_meta::sync_team_meta_members_from_agents,
            team_meta::is_team_space_initialized,
            team_tasks::list_team_tasks,
            team_tasks::add_team_task,
            team_tasks::update_team_task,
            // Config commands
            config::list_openclaw_instances,
            config::get_instance_display_name,
            config::load_openclaw_config_for_instance,
            channel_cli::openclaw_add_channel_stub,
            channel_cli::openclaw_apply_channel,
            channel_cli::openclaw_remove_channel,
            config::save_openclaw_config_for_instance,
            config::save_openclaw_bindings_for_instance,
            config::save_skill_enabled_for_instance,
            config::set_exit_preferences,
            config::export_config,
            config::import_config,
            config::detect_system_openclaw,
            config::import_system_openclaw_config,
            config::import_discovered_instance,
            config::openclaw_config_diagnostic,
            config::test_ai_connection,
            config::load_agent_raw_config,
            config::save_agent_raw_config,
            config::get_agent_config_path,
            config::ensure_gateway_remote_token,
            config::ensure_gateway_tokens_for_instance,
            config::get_home_dir,
            config::get_agent_directory,
            config::get_browser_default_user_data_dir,
            config::get_browser_executable_placeholder,
            config::open_path,
            // API key pool
            config::load_api_key_pool,
            config::save_api_key_pool,
            config::scan_openclaw_configs,
            config::import_api_keys,
            // Agent workspace bootstrap files
            workspace::list_agent_workspace_files,
            workspace::read_agent_workspace_file,
            workspace::write_agent_workspace_file,
            workspace::run_openclaw_agents_add,
            workspace::run_openclaw_onboard_non_interactive,
            // Skills commands
            skills::list_available_skills,
            skills::list_installed_skill_ids,
            skills::list_skills_for_instance,
            skills::install_skill,
            skills::install_skill_via_agent,
            skills::uninstall_skill,
            skills::fetch_skills_catalog,
            skills::open_skill_directory_for_instance,
            // Diagnostics
            diagnostics::run_doctor,
            diagnostics::test_channel_connection,
            diagnostics::get_system_info,
            // Spend & tokens
            spend::get_today_spend,
            spend::get_spend_daily_history,
            spend::record_spend,
            spend::get_token_stats,
            spend::get_token_daily_history,
            spend::record_token_usage,
            spend::sync_usage_from_sessions,
            spend::get_exchange_rate,
            // Cron jobs (read-only; data from OpenClaw Gateway)
            cron_jobs::list_cron_jobs_for_instance,
            // Tailscale
            tailscale::get_tailscale_status,
            tailscale::restart_tailscale,
            // Chat sessions (OpenClaw transcript as source)
            chat::load_session_transcript,
            tray_menu::set_tray_menu_labels,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
