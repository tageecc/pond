import { Store } from "@tauri-apps/plugin-store"
import { invoke } from "@tauri-apps/api/core"

const APP_STORE_PATH = "app.json"

let storeInstance: Store | null = null

export interface AppConfig {
  launchAtLogin: boolean
  stopAgentsOnExit: boolean
  minimizeToTray: boolean
  instanceOrder: string[]
  currentView: "dashboard" | "analytics" | "chat" | "agents"
  selectedInstanceId: string | null
}

const defaults: AppConfig = {
  launchAtLogin: false,
  stopAgentsOnExit: false,
  minimizeToTray: true,
  instanceOrder: [],
  currentView: "dashboard",
  selectedInstanceId: null,
}

export async function getAppStore(): Promise<Store> {
  if (storeInstance) return storeInstance
  storeInstance = await Store.load(APP_STORE_PATH, {
    defaults: defaults as unknown as Record<string, unknown>,
  })
  return storeInstance
}

export async function loadAppConfig(): Promise<AppConfig> {
  const store = await getAppStore()
  const [rawView, rawSel, launchAtLogin, stopAgentsOnExit, minimizeToTray, instanceOrder] =
    await Promise.all([
      store.get("currentView"),
      store.get("selectedInstanceId"),
      store.get<boolean>("launchAtLogin"),
      store.get<boolean>("stopAgentsOnExit"),
      store.get<boolean>("minimizeToTray"),
      store.get<string[]>("instanceOrder"),
    ])
  const currentView: AppConfig["currentView"] =
    rawView === "dashboard" || rawView === "analytics" || rawView === "chat" || rawView === "agents"
      ? rawView
      : defaults.currentView
  const selectedInstanceId =
    typeof rawSel === "string" && rawSel.trim() !== "" ? rawSel.trim() : null

  return {
    launchAtLogin: launchAtLogin ?? defaults.launchAtLogin,
    stopAgentsOnExit: stopAgentsOnExit ?? defaults.stopAgentsOnExit,
    minimizeToTray: minimizeToTray ?? defaults.minimizeToTray,
    instanceOrder: instanceOrder ?? defaults.instanceOrder,
    currentView,
    selectedInstanceId,
  }
}

export async function saveAppConfig(partial: Partial<AppConfig>): Promise<void> {
  const store = await getAppStore()
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) await store.set(k, v as unknown)
  }
  await store.save()
  if ("minimizeToTray" in partial || "stopAgentsOnExit" in partial) {
    const cfg = await loadAppConfig()
    await invoke("set_exit_preferences", {
      minimizeToTray: cfg.minimizeToTray,
      stopAgentsOnExit: cfg.stopAgentsOnExit,
    })
  }
}

/** Sort instance ids by saved order from Store (unknown ids trail) */
export function sortInstanceIdsByIdOrder(ids: string[], order: string[]): string[] {
  if (!order.length) return ids
  const orderSet = new Set(order)
  const inOrder = order.filter((id) => ids.includes(id))
  const rest = ids.filter((id) => !orderSet.has(id))
  return [...inOrder, ...rest]
}
