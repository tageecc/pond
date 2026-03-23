import { invoke } from "@tauri-apps/api/core"
import i18n from "../i18n"

/** Sync tray menu labels with current i18n strings (Tauri). */
export async function syncNativeMenus(): Promise<void> {
  try {
    await invoke("set_tray_menu_labels", {
      show: i18n.t("tray.show"),
      start: i18n.t("tray.start"),
      stop: i18n.t("tray.stop"),
      quit: i18n.t("tray.quit"),
    })
  } catch {
    // Non-Tauri or tray not ready
  }
}
