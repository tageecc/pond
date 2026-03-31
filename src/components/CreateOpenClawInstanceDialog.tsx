import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useAppStore } from "../stores/appStore"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { Label } from "./ui/label"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"
import { Input } from "./ui/input"
import { PROVIDERS, getProvider } from "../constants/providers"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { ModelIdField } from "./ModelIdField"

export function CreateOpenClawInstanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const createOpenClawInstance = useAppStore((s) => s.createOpenClawInstance)
  const openclawConfig = useAppStore((s) => s.openclawConfig)
  const [pending, setPending] = useState(false)
  
  // Config mode: 'inherit' or 'manual'
  const [configMode, setConfigMode] = useState<'inherit' | 'manual'>('inherit')
  
  // Manual config fields
  const [providerId, setProviderId] = useState('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseURL, setBaseURL] = useState('')
  
  const selectedProvider = getProvider(providerId)

  const submit = async () => {
    // Validate manual config if selected
    if (configMode === 'manual') {
      const key = apiKey.trim()
      if (!key) {
        // Show error in UI
        return
      }
    }
    
    setPending(true)
    try {
      if (configMode === 'inherit') {
        await createOpenClawInstance({ mode: 'inherit' })
      } else {
        await createOpenClawInstance({
          mode: 'manual',
          providerId,
          apiKey: apiKey.trim(),
          model: model.trim() || undefined,
          baseURL: baseURL.trim() || undefined,
        })
      }
      onOpenChange(false)
    } catch {
      // Errors surfaced via store toasts
    } finally {
      setPending(false)
    }
  }
  
  // Check if current instance has valid config to inherit
  const hasCurrentConfig = openclawConfig && 
    openclawConfig.models?.providers && 
    Object.values(openclawConfig.models.providers).some(
      (p) => p?.apiKey && p.apiKey.trim().length > 0
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-app-border bg-app-surface sm:max-w-md" style={{ cursor: pending ? 'wait' : 'auto' }}>
        <DialogHeader>
          <DialogTitle>{t("createInstance.title")}</DialogTitle>
          <DialogDescription className="text-app-muted text-xs">
            {t("createInstance.description", {
              short: t("createInstance.short"),
              default: t("createInstance.defaultPath"),
            })}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <RadioGroup value={configMode} onValueChange={(v) => setConfigMode(v as 'inherit' | 'manual')}>
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="inherit" id="inherit" disabled={!hasCurrentConfig} />
              <div className="flex-1">
                <Label htmlFor="inherit" className={`text-sm font-medium ${!hasCurrentConfig ? 'text-app-muted' : 'text-app-text cursor-pointer'}`}>
                  {t("createInstance.inheritConfig")}
                </Label>
                <p className="text-xs text-app-muted mt-1">
                  {hasCurrentConfig 
                    ? t("createInstance.inheritConfigDesc")
                    : t("createInstance.noConfigToInherit")}
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="manual" id="manual" />
              <div className="flex-1">
                <Label htmlFor="manual" className="text-sm font-medium text-app-text cursor-pointer">
                  {t("createInstance.manualConfig")}
                </Label>
                <p className="text-xs text-app-muted mt-1">
                  {t("createInstance.manualConfigDesc")}
                </p>
              </div>
            </div>
          </RadioGroup>
          
          {configMode === 'manual' && (
            <div className="space-y-3 pl-6 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-app-muted">
                  {t("createInstance.provider")}
                </Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger className="h-9 rounded-lg border-app-border bg-app-elevated text-app-text text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-app-muted">
                  API Key <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="password"
                  placeholder={t("createInstance.apiKeyPlaceholder")}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-9 rounded-lg border-app-border bg-app-elevated text-app-text text-sm"
                />
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-app-muted">
                  {t("createInstance.modelOptional")}
                </Label>
                <ModelIdField
                  provider={providerId}
                  value={model}
                  onChange={setModel}
                  size="sm"
                  triggerClassName="h-9 rounded-lg bg-app-elevated"
                />
              </div>
              
              {selectedProvider?.id === 'custom' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-app-muted">
                    Base URL
                  </Label>
                  <Input
                    type="text"
                    placeholder="https://api.example.com/v1"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    className="h-9 rounded-lg border-app-border bg-app-elevated text-app-text text-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-app-border"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-claw-500 hover:bg-claw-600 text-white"
            disabled={pending || (configMode === 'manual' && !apiKey.trim())}
            onClick={() => void submit()}
          >
            {pending ? t("createInstance.creating") : t("createInstance.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
