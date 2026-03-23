import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Toaster } from "@/components/ui/sonner"
import { useAppStore } from "./stores/appStore"
import { useThemeStore } from "./stores/themeStore"
import { useGlobalNotifications } from "./hooks/useGlobalNotifications"
import { Onboarding } from "./components/Onboarding"
import { Dashboard } from "./components/Dashboard"
import { Analytics } from "./components/Analytics"
import { AgentView } from "./components/AgentView"
import { ChatView } from "./components/ChatView"
import { Settings } from "./components/Settings"
import { AppTitleBar } from "./components/AppTitleBar"
import { InstanceSidebar } from "./components/InstanceSidebar"
import { Dialog, DialogContent, DialogTitle } from "./components/ui/dialog"
import "./styles/globals.css"

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__
  )
}

function MainApp() {
  const { t } = useTranslation()
  const currentView = useAppStore((s) => s.currentView)
  const preferencesOpen = useAppStore((s) => s.preferencesOpen)
  const setPreferencesOpen = useAppStore((s) => s.setPreferencesOpen)

  useGlobalNotifications()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault()
        setPreferencesOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setPreferencesOpen])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app-bg">
      <Toaster
        position="top-center"
        offset={{ top: "56px" }}
        richColors={false}
        closeButton={false}
      />
      <AppTitleBar />
      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible">
        {currentView === "chat" || currentView === "agents" ? (
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch gap-2 overflow-hidden bg-app-bg px-2 pb-2 pt-1">
            <InstanceSidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {currentView === "chat" && <ChatView />}
              {currentView === "agents" && <AgentView />}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scroll-container pt-3">
            {currentView === "dashboard" && <Dashboard />}
            {currentView === "analytics" && <Analytics />}
          </div>
        )}
      </main>

      <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{t("settings.title")}</DialogTitle>
          <div className="flex-1 overflow-y-auto px-4 pt-9 pb-5">
            <Settings />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function App() {
  const { t, i18n } = useTranslation()
  const locale = useAppStore((s) => s.locale)
  const needsOnboarding = useAppStore((s) => s.needsOnboarding)
  const pendingAgentId = useAppStore((s) => s.pendingAgentId)
  const switchInstance = useAppStore((s) => s.switchInstance)

  useEffect(() => {
    useThemeStore.getState().init()
  }, [])

  useEffect(() => {
    useAppStore.getState().initialize()
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let cleanup: (() => void) | undefined
    import("@tauri-apps/plugin-window-state")
      .then(({ restoreStateCurrent, saveWindowState }) => {
        restoreStateCurrent().catch(() => {})
        const onBeforeUnload = () => {
          saveWindowState().catch(() => {})
        }
        window.addEventListener("beforeunload", onBeforeUnload)
        cleanup = () =>
          window.removeEventListener("beforeunload", onBeforeUnload)
      })
      .catch(() => {})
    return () => cleanup?.()
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    void import("@tauri-apps/api/menu").then(
      async ({ Menu, Submenu, MenuItem, PredefinedMenuItem }) => {
        const openPrefs = () => useAppStore.getState().setPreferencesOpen(true)
        const sep = () => PredefinedMenuItem.new({ item: "Separator" })

        const pondSub = await Submenu.new({
          text: t("menu.pond"),
          items: [
            await PredefinedMenuItem.new({
              item: { About: { name: "Pond" } },
              text: t("menu.about"),
            }),
            await PredefinedMenuItem.new({
              item: "Services",
              text: t("menu.services"),
            }),
            await sep(),
            await PredefinedMenuItem.new({
              item: "Hide",
              text: t("menu.hide"),
            }),
            await PredefinedMenuItem.new({
              item: "HideOthers",
              text: t("menu.hideOthers"),
            }),
            await PredefinedMenuItem.new({
              item: "ShowAll",
              text: t("menu.showAll"),
            }),
            await sep(),
            await MenuItem.new({
              id: "preferences",
              text: t("menu.preferences"),
              accelerator: "CmdOrControl+,",
              action: openPrefs,
            }),
            await sep(),
            await PredefinedMenuItem.new({
              item: "Quit",
              text: t("menu.quit"),
            }),
          ],
        })

        const fileSub = await Submenu.new({
          text: t("menu.file"),
          items: [
            await PredefinedMenuItem.new({
              item: "CloseWindow",
              text: t("menu.closeWindow"),
            }),
          ],
        })

        const editSub = await Submenu.new({
          text: t("menu.edit"),
          items: [
            await PredefinedMenuItem.new({
              item: "Undo",
              text: t("menu.undo"),
            }),
            await PredefinedMenuItem.new({
              item: "Redo",
              text: t("menu.redo"),
            }),
            await sep(),
            await PredefinedMenuItem.new({
              item: "Cut",
              text: t("menu.cut"),
            }),
            await PredefinedMenuItem.new({
              item: "Copy",
              text: t("menu.copy"),
            }),
            await PredefinedMenuItem.new({
              item: "Paste",
              text: t("menu.paste"),
            }),
            await PredefinedMenuItem.new({
              item: "SelectAll",
              text: t("menu.selectAll"),
            }),
          ],
        })

        const viewSub = await Submenu.new({
          text: t("menu.view"),
          items: [
            await PredefinedMenuItem.new({
              item: "Fullscreen",
              text: t("menu.toggleFullScreen"),
            }),
          ],
        })

        const windowSub = await Submenu.new({
          text: t("menu.window"),
          items: [
            await PredefinedMenuItem.new({
              item: "Minimize",
              text: t("menu.minimize"),
            }),
            await PredefinedMenuItem.new({
              item: "Maximize",
              text: t("menu.zoom"),
            }),
          ],
        })

        const helpSub = await Submenu.new({
          text: t("menu.help"),
          items: [],
        })

        const menu = await Menu.new({
          items: [pondSub, fileSub, editSub, viewSub, windowSub, helpSub],
        })
        if (cancelled) return
        await menu.setAsAppMenu()

        const isMac =
          typeof navigator !== "undefined" &&
          (navigator.platform?.toLowerCase().includes("mac") ?? false)
        if (isMac && !cancelled) {
          await windowSub.setAsWindowsMenuForNSApp()
          await helpSub.setAsHelpMenuForNSApp()
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [locale, t, i18n.language])

  useEffect(() => {
    if (!pendingAgentId) return
    switchInstance(pendingAgentId).catch(() => {})
    useAppStore.setState({ pendingAgentId: null })
  }, [pendingAgentId, switchInstance])

  if (needsOnboarding) {
    return <Onboarding />
  }

  return <MainApp />
}

export default App
