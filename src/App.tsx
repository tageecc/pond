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
import { installTauriAppMenu } from "@/lib/tauriAppMenu"
import { Loader2 } from "lucide-react"
import "./styles/globals.css"

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__
  )
}

function AppBootstrapShell() {
  const { t } = useTranslation()
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-app-bg text-app-muted">
      <Loader2 className="h-8 w-8 animate-spin text-claw-500" aria-hidden />
      <p className="text-sm">{t("common.loadingConfig")}</p>
    </div>
  )
}

function MainApp() {
  const currentView = useAppStore((s) => s.currentView)

  useGlobalNotifications()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app-bg">
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
    </div>
  )
}

function App() {
  const { t } = useTranslation()
  const locale = useAppStore((s) => s.locale)
  const needsOnboarding = useAppStore((s) => s.needsOnboarding)
  const onboardingChecked = useAppStore((s) => s.onboardingChecked)
  const pendingAgentId = useAppStore((s) => s.pendingAgentId)
  const switchInstance = useAppStore((s) => s.switchInstance)
  const preferencesOpen = useAppStore((s) => s.preferencesOpen)
  const setPreferencesOpen = useAppStore((s) => s.setPreferencesOpen)

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
    void installTauriAppMenu(t, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [locale, t])

  useEffect(() => {
    if (!pendingAgentId) return
    switchInstance(pendingAgentId).catch(() => {})
    useAppStore.setState({ pendingAgentId: null })
  }, [pendingAgentId, switchInstance])

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
    <>
      <Toaster
        position="top-center"
        offset={{ top: "56px" }}
        richColors={false}
        closeButton={false}
      />
      {!onboardingChecked ? (
        <AppBootstrapShell />
      ) : needsOnboarding ? (
        <Onboarding />
      ) : (
        <MainApp />
      )}
      <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{t("settings.title")}</DialogTitle>
          <div className="flex-1 overflow-y-auto px-4 pt-9 pb-5">
            <Settings />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default App
