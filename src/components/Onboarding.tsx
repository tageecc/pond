import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { useAppStore } from "../stores/appStore"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { open } from "@tauri-apps/plugin-shell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import { ExternalLink, Loader2, Sparkles, Download, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "../lib/utils"
import { PROVIDERS, getProvider } from "../constants/providers"
import { ModelIdField } from "./ModelIdField"
import type { OpenClawConfig } from "../types"
import { hasConfiguredModel as hasConfiguredModelFromConfig } from "../lib/openclawAgentsModels"
import {
  onTauriTitleBarDragMouseDown,
  TITLE_BAR_DRAG_HEIGHT,
  TITLE_BAR_LEFT_INSET,
} from "../lib/tauriTitleBarDrag"

function hasConfiguredModel(config: OpenClawConfig | null): boolean {
  return hasConfiguredModelFromConfig(config)
}

export function Onboarding() {
  const { t } = useTranslation()
  const { completeOnboarding, importSystemOpenClaw } = useAppStore()
  const [step, setStep] = useState<"choice" | "key">("choice")
  const [providerId, setProviderId] = useState("openai")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSystemOpenClaw, setHasSystemOpenClaw] = useState<boolean | null>(null)
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)

  const selectedProvider = getProvider(providerId) ?? PROVIDERS[0]

  useEffect(() => {
    invoke<{ exists: boolean }>("detect_system_openclaw")
      .then((r) => setHasSystemOpenClaw(r?.exists ?? false))
      .catch(() => setHasSystemOpenClaw(false))
  }, [])

  const handleOneClickImport = async () => {
    setError(null)
    setImporting(true)
    try {
      // Import system ~/.openclaw into Pond
      await importSystemOpenClaw()
      
      // Close wizard; user can finish model setup in app
      useAppStore.getState().finishOnboarding()
      
      // Start gateway when models are configured
      const config = useAppStore.getState().openclawConfig
      if (hasConfiguredModel(config)) {
        useAppStore.getState().startAgentGateway('default').catch(() => {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // Re-probe filesystem on import failure
      invoke<{ exists: boolean }>("detect_system_openclaw")
        .then((r) => setHasSystemOpenClaw(r?.exists ?? false))
        .catch(() => setHasSystemOpenClaw(false))
    } finally {
      setImporting(false)
    }
  }

  const openKeyUrl = async () => {
    const url = selectedProvider?.keyUrl
    if (!url) return
    setError(null)
    try {
      await open(url)
    } catch {
      setError(t("onboarding.browserOpenFailed", { url }))
    }
  }

  const doComplete = async () => {
    const key = apiKey.trim()
    setError(null)
    setSaving(true)
    try {
      await completeOnboarding(
        providerId,
        key,
        selectedProvider?.baseURL,
        (model.trim() || selectedProvider?.modelHint) ?? undefined
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    const key = apiKey.trim()
    if (!key) {
      setError(t("onboarding.apiKeyRequired"))
      return
    }
    // Re-check on disk; avoid stale detect_system_openclaw
    try {
      const result = await invoke<{ exists: boolean }>("detect_system_openclaw")
      if (result?.exists) {
        setShowOverwriteConfirm(true)
      } else {
        await doComplete()
      }
    } catch {
      // On detect error, complete anyway
      await doComplete()
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center overflow-y-auto bg-gradient-to-b from-app-bg to-app-bg/95">
      <div
        className="titlebar-drag relative z-20 mt-4 mb-1 w-full shrink-0 cursor-default safe-area-inset-top"
        style={{
          height: TITLE_BAR_DRAG_HEIGHT,
          minHeight: TITLE_BAR_DRAG_HEIGHT,
          paddingLeft: TITLE_BAR_LEFT_INSET,
        }}
        data-tauri-drag-region
        onMouseDown={onTauriTitleBarDragMouseDown}
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-10%,rgba(120,80,200,0.08),transparent)]" />

      <div className="relative z-10 w-full max-w-md space-y-6 px-6 py-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-claw-500/15">
            <Sparkles className="h-7 w-7 text-claw-500" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-app-text">{t("onboarding.welcomeTitle")}</h1>
          <p className="mt-1.5 text-sm text-app-muted">{t("onboarding.welcomeSubtitle")}</p>
        </div>

        {hasSystemOpenClaw === true && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-claw-500/20 bg-claw-500/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Download className="h-4 w-4 shrink-0 text-claw-500" />
              <span className="text-sm text-app-text">{t("onboarding.systemOpenClaw")}</span>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5 bg-claw-500 hover:bg-claw-600 text-white rounded-lg px-3 py-1.5 text-sm"
              onClick={handleOneClickImport}
              disabled={importing}
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("onboarding.importOneClick")}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-app-border/80" />
          <span className="text-xs text-app-muted">{t("onboarding.orManual")}</span>
          <span className="h-px flex-1 bg-app-border/80" />
        </div>

        {step === "choice" && (
          <Card className="bg-app-surface">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-app-text">{t("onboarding.chooseProvider")}</CardTitle>
              <CardDescription className="text-xs text-app-muted">{t("onboarding.chooseProviderDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-app-muted">{t("onboarding.provider")}</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full justify-between rounded-lg border-app-border bg-app-elevated text-app-text text-sm hover:bg-app-hover [&>svg]:opacity-80"
                    >
                      <span>{t(`providers.names.${providerId}`)}</span>
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-[70vh] min-w-[14rem] overflow-y-auto rounded-lg border-app-border bg-app-surface">
                    <DropdownMenuLabel className="text-xs font-medium text-app-muted">{t("onboarding.selectProvider")}</DropdownMenuLabel>
                    {PROVIDERS.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onSelect={() => { setProviderId(p.id); setError(null) }}
                        className="cursor-pointer rounded-lg text-app-text focus:bg-claw-500/10 focus:text-app-text"
                      >
                        {t(`providers.names.${p.id}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="button"
                className="w-full gap-2 rounded-lg bg-claw-500 hover:bg-claw-600 text-white py-5 text-sm"
                onClick={async () => {
                  setStep("key")
                  setModel(selectedProvider?.modelHint ?? "")
                  setApiKey("")
                  setError(null)
                  // Re-check system install when entering key step
                  try {
                    const result = await invoke<{ exists: boolean }>("detect_system_openclaw")
                    setHasSystemOpenClaw(result?.exists ?? false)
                  } catch {
                    setHasSystemOpenClaw(false)
                  }
                }}
              >
                {t("onboarding.next")} <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "key" && (
          <Card className="bg-app-surface">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-app-text">{t("onboarding.enterApiKey")}</CardTitle>
              <CardDescription className="text-xs text-app-muted">{t("onboarding.enterApiKeyDesc", { name: t(`providers.names.${providerId}`) })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center gap-2 rounded-lg border-app-border text-app-muted hover:bg-app-hover hover:text-app-text h-9"
                onClick={openKeyUrl}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("onboarding.getKeyAt", { name: t(`providers.names.${providerId}`) })}
              </Button>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-app-muted">API Key</label>
                <Input
                  type="password"
                  placeholder={t("onboarding.apiKeyPlaceholder")}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-10 rounded-lg border-app-border bg-app-elevated text-app-text placeholder:text-app-muted text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-app-muted">{t("onboarding.modelIdOptional")}</label>
                <ModelIdField
                  provider={providerId}
                  value={model}
                  onChange={setModel}
                  size="sm"
                  triggerClassName="rounded-lg bg-app-elevated"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2 pt-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-app-border text-app-muted hover:bg-app-hover h-9"
                  onClick={async () => {
                    setStep("choice")
                    // Re-check when going back to provider step
                    try {
                      const result = await invoke<{ exists: boolean }>("detect_system_openclaw")
                      setHasSystemOpenClaw(result?.exists ?? false)
                    } catch {
                      setHasSystemOpenClaw(false)
                    }
                  }}
                >
                  {t("onboarding.back")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={cn("flex-1 rounded-lg h-9 bg-claw-500 hover:bg-claw-600 text-white text-sm", saving && "opacity-90")}
                  onClick={handleComplete}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.done")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("onboarding.overwriteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("onboarding.overwriteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-app-border text-app-muted hover:bg-app-hover">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-claw-500 text-white hover:bg-claw-600"
              onClick={() => {
                setShowOverwriteConfirm(false)
                doComplete()
              }}
            >
              {t("onboarding.confirmOverwrite")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
