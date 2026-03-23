import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { getVersion } from "@tauri-apps/api/app"
import { useAppStore } from "../stores/appStore"
import { loadAppConfig, saveAppConfig, type AppLocale } from "../lib/appStore"
import { Button } from "./ui/button"
import { Switch } from "./ui/switch"
import { ThemeToggle } from "./ThemeToggle"

export function Settings() {
  const { t } = useTranslation()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
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
        <p className="text-sm text-app-muted">{t("common.loadingConfig")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => loadConfigs()}>
          {t("common.retry")}
        </Button>
      </div>
    )
  }

  const setLanguage = (next: AppLocale) => {
    void setLocale(next)
  }

  return (
    <div className="space-y-1 px-1">
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">{t("settings.appearance")}</p>
          <p className="text-xs text-app-muted">{t("settings.appearanceHint")}</p>
        </div>
        <ThemeToggle />
      </div>
      <div className="h-px bg-app-border" />

      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">{t("settings.language")}</p>
          <p className="text-xs text-app-muted">{t("settings.languageHint")}</p>
        </div>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={locale === "zh" ? "default" : "outline"}
            className={locale === "zh" ? "bg-claw-500 hover:bg-claw-600 text-white" : ""}
            onClick={() => setLanguage("zh")}
          >
            {t("settings.langZh")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={locale === "en" ? "default" : "outline"}
            className={locale === "en" ? "bg-claw-500 hover:bg-claw-600 text-white" : ""}
            onClick={() => setLanguage("en")}
          >
            {t("settings.langEn")}
          </Button>
        </div>
      </div>
      <div className="h-px bg-app-border" />

      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">{t("settings.launchAtLogin")}</p>
          <p className="text-xs text-app-muted">{t("settings.launchAtLoginHint")}</p>
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

      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">{t("settings.minimizeToTray")}</p>
          <p className="text-xs text-app-muted">{t("settings.minimizeToTrayHint")}</p>
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

      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-app-text">{t("settings.stopAgentsOnExit")}</p>
          <p className="text-xs text-app-muted">{t("settings.stopAgentsOnExitHint")}</p>
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

      <p className="py-3 text-center text-xs tabular-nums text-app-muted">
        {appVersion ? `v${appVersion}` : "…"}
      </p>
    </div>
  )
}
