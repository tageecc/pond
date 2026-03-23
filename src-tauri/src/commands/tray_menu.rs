use std::sync::Mutex;

use tauri::{menu::{Menu, MenuItem}, tray::TrayIcon, AppHandle, Manager};

/// Held in app state so tray menu labels can follow UI locale.
pub struct TrayIconHandle(pub Mutex<Option<TrayIcon>>);

#[tauri::command]
pub fn set_tray_menu_labels(
    app: AppHandle,
    show: String,
    start: String,
    stop: String,
    quit: String,
) -> Result<(), String> {
    let state = app.state::<TrayIconHandle>();
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let tray = guard.as_ref().ok_or_else(|| "tray not initialized".to_string())?;

    let show_item =
        MenuItem::with_id(&app, "show", &show, true, None::<&str>).map_err(|e| e.to_string())?;
    let start_item =
        MenuItem::with_id(&app, "start", &start, true, None::<&str>).map_err(|e| e.to_string())?;
    let stop_item =
        MenuItem::with_id(&app, "stop", &stop, true, None::<&str>).map_err(|e| e.to_string())?;
    let quit_item =
        MenuItem::with_id(&app, "quit", &quit, true, None::<&str>).map_err(|e| e.to_string())?;

    let menu = Menu::with_items(&app, &[&show_item, &start_item, &stop_item, &quit_item])
        .map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}
