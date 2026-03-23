import { useState, useEffect } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { useAppStore } from "../stores/appStore"
import { loadAppConfig, saveAppConfig } from "../lib/appStore"
import { Button } from "./ui/button"
import { Switch } from "./ui/switch"
import { ThemeToggle } from "./ThemeToggle"

export function Settings() {
  const { loadConfigs } = useAppStore()
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [stopAgentsOnExit, setStopAgentsOnExit] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [appVersion, setAppVersion] = useState("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])
  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => setAppVersion(""))
  }, [])
  useEffect(() => {
    loadAppConfig()
      .then((cfg) => {
        setLaunchAtLogin(cfg.launchAtLogin)
        setStopAgentsOnExit(cfg.stopAgentsOnExit)
        setMinimizeToTray(cfg.minimizeToTray)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])
  useEffect(() => {
    if (!ready) return
    import("@tauri-apps/plugin-autostart")
      .then(({ isEnabled }) => isEnabled())
      .then((enabled) => setLaunchAtLogin((prev) => (prev !== enabled ? enabled : prev)))
      .catch(() => {})
  }, [ready])

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-app-muted">加载配置中…</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => loadConfigs()}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1 px-1">
      {/* Appearance */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">外观</p>
          <p className="text-xs text-app-muted">浅色 / 深色 / 跟随系统</p>
        </div>
        <ThemeToggle />
      </div>
      <div className="h-px bg-app-border" />

      {/* Launch at login */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">开机自启</p>
          <p className="text-xs text-app-muted">登录时自动启动 Pond</p>
        </div>
        <Switch
          checked={launchAtLogin}
          onCheckedChange={async (next) => {
            try {
              if (next) {
                const { enable } = await import("@tauri-apps/plugin-autostart")
                await enable()
              } else {
                const { disable } = await import("@tauri-apps/plugin-autostart")
                await disable()
              }
              setLaunchAtLogin(next)
              await saveAppConfig({ launchAtLogin: next })
            } catch (e) {
              console.error(e)
            }
          }}
        />
      </div>
      <div className="h-px bg-app-border" />

      {/* Minimize to tray on close */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">最小化到托盘</p>
          <p className="text-xs text-app-muted">点击关闭按钮时最小化到托盘而非退出</p>
        </div>
        <Switch
          checked={minimizeToTray}
          onCheckedChange={async (next) => {
            try {
              setMinimizeToTray(next)
              await saveAppConfig({ minimizeToTray: next })
            } catch (e) {
              console.error(e)
            }
          }}
        />
      </div>
      <div className="h-px bg-app-border" />

      {/* Stop gateways on quit */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">退出时停止 Agent</p>
          <p className="text-xs text-app-muted">关闭应用后停止所有 Gateway</p>
        </div>
        <Switch
          checked={stopAgentsOnExit}
          onCheckedChange={async (next) => {
            try {
              setStopAgentsOnExit(next)
              await saveAppConfig({ stopAgentsOnExit: next })
            } catch (e) {
              console.error(e)
              setStopAgentsOnExit(!next)
            }
          }}
        />
      </div>
      <div className="h-px bg-app-border" />

      {/* App data dir (chat, usage, etc.) */}
      <div className="pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-app-muted hover:text-app-text"
          onClick={openConfigDir}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="truncate">{configDirPath || "打开应用数据目录"}</span>
        </Button>
      </div>
    </div>
  )
}
