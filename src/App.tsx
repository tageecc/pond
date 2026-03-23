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
        const buildPondSubmenu = async () => {
          const sep = await PredefinedMenuItem.new({ item: "Separator" })
          const prefItem = await MenuItem.new({
            id: "preferences",
            text: t("menu.preferences"),
            accelerator: "CmdOrControl+,",
            action: openPrefs,
          })
          const quitItem = await PredefinedMenuItem.new({ item: "Quit" })
          return Submenu.new({
            text: t("menu.pond"),
            items: [prefItem, sep, quitItem],
          })
        }
        const buildEditAndPondMenu = async () => {
          const editSub = await Submenu.new({
            text: t("menu.edit"),
            items: [
              await PredefinedMenuItem.new({ item: "Undo" }),
              await PredefinedMenuItem.new({ item: "Redo" }),
              await PredefinedMenuItem.new({ item: "Separator" }),
              await PredefinedMenuItem.new({ item: "Cut" }),
              await PredefinedMenuItem.new({ item: "Copy" }),
              await PredefinedMenuItem.new({ item: "Paste" }),
              await PredefinedMenuItem.new({ item: "SelectAll" }),
            ],
          })
          const pondSub = await buildPondSubmenu()
          return Menu.new({ items: [editSub, pondSub] })
        }
        try {
          const menu = await Menu.default()
          await menu.append(await buildPondSubmenu())
          if (!cancelled) await menu.setAsAppMenu()
        } catch {
          const menu = await buildEditAndPondMenu()
          if (!cancelled) await menu.setAsAppMenu()
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
