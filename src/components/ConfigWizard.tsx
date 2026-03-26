import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useAppStore } from "../stores/appStore";
import { ChannelBrandIcon } from "./ChannelBrandIcon";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card, CardContent } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  MessageSquare,
  ChevronDown,
  Eye,
  EyeOff,
  Save,
  Play,
  Plus,
  Trash2,
  ExternalLink,
  GitMerge,
  Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Switch } from "./ui/switch";
import type {
  BindingConfig,
  OpenClawConfig,
  ChannelInstanceConfig,
  ConfigFieldSchema,
  HooksInternalConfig,
  HooksInternalEntry,
  HooksListResult,
} from "../types";
import { resolvePondInstanceId } from "../lib/pondInstanceId";
import { getAgentIds } from "../lib/openclawAgentsModels";
import {
  ChannelBindingsEditor,
  normalizeBindingsFromConfig,
  serializeBindings,
} from "./ChannelBindingsEditor";
import {
  OPENCLAW_CHANNEL_TYPES,
  OPENCLAW_CHANNEL_ID_SET,
  type OpenClawChannelTypeId,
} from "../constants/openclawChannels";

/** Stable empty object: `?? {}` creates a new ref each render and breaks useMemo */
const EMPTY_CHANNELS: Record<string, never> = Object.freeze({});

type ChannelTypeId = OpenClawChannelTypeId;

const CHANNEL_FORM_FIELDS: Record<
  ChannelTypeId,
  "telegram" | "discord" | "generic" | "feishu"
> = {
  whatsapp: "generic",
  telegram: "telegram",
  discord: "discord",
  slack: "generic",
  imessage: "generic",
  signal: "generic",
  msteams: "generic",
  googlechat: "generic",
  mattermost: "generic",
  matrix: "generic",
  irc: "generic",
  feishu: "feishu",
  line: "generic",
  nostr: "generic",
  twitch: "generic",
  bluebubbles: "generic",
};

function channelTypeFromTopKey(instanceId: string): ChannelTypeId {
  if (!OPENCLAW_CHANNEL_ID_SET.has(instanceId)) {
    throw new Error(`unknown channel id: ${instanceId}`);
  }
  return instanceId as ChannelTypeId;
}

function isInstanceConfigured(
  raw: ChannelInstanceConfig | Record<string, any>,
): boolean {
  if (!raw || typeof raw !== "object") return false;
  const allowFrom = raw.allowFrom;
  if (Array.isArray(allowFrom) && allowFrom.length > 0) return true;
  if (raw.botToken || raw.token || raw.appId) return true;
  return false;
}

function getInstanceDisplayName(
  raw: ChannelInstanceConfig | Record<string, any>,
  instanceId: string,
  channelTypeLabel: (typeId: ChannelTypeId) => string,
): string {
  const name = (raw as ChannelInstanceConfig).name;
  if (name && String(name).trim()) return String(name).trim();
  const typeId = channelTypeFromTopKey(instanceId);
  const typeName = channelTypeLabel(typeId);
  const agentId = (raw as ChannelInstanceConfig).agentId;
  if (agentId) return `${typeName} · ${agentId}`;
  return typeName;
}

function getChannelIds(
  channelsRoot: Record<string, unknown> | undefined | null,
): string[] {
  const ch = channelsRoot ?? EMPTY_CHANNELS;
  return Object.keys(ch).filter(
    (k) =>
      OPENCLAW_CHANNEL_ID_SET.has(k) &&
      ch[k] != null &&
      typeof ch[k] === "object",
  );
}

export function ChannelManager({ embedded }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { openclawConfig, loadConfigs, loadInstanceConfig } = useAppStore();
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId);
  const instanceIds = useAppStore((s) => s.instanceIds);
  const pondInstanceId = resolvePondInstanceId(
    instanceIds,
    selectedInstanceId,
    
  );
  const openclawInstanceId = pondInstanceId ?? "default";
  const channelTypeLabel = (id: ChannelTypeId) => t(`channelTypes.${id}`);
  const roleIds = useMemo(
    () => getAgentIds(openclawConfig ?? undefined),
    [openclawConfig],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addType, setAddType] = useState<ChannelTypeId | null>(null);
  const [addName, setAddName] = useState("");

  const [instanceName, setInstanceName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [userId, setUserId] = useState("");
  const [allowFrom, setAllowFrom] = useState("");
  const [dmPolicy, setDmPolicy] = useState("pairing");
  const [groupPolicy, setGroupPolicy] = useState("allowlist");
  const [groupMention, setGroupMention] = useState("");
  const [groupAllowFrom, setGroupAllowFrom] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Feishu / Lark
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [botName, setBotName] = useState("");
  const [feishuDomain, setFeishuDomain] = useState<"feishu" | "lark">("feishu");
  const [bindingsDraft, setBindingsDraft] = useState<BindingConfig[]>([]);
  const [bindingsSaving, setBindingsSaving] = useState(false);
  const [bindingsError, setBindingsError] = useState<string | null>(null);
  const [channelDefaultAgentId, setChannelDefaultAgentId] = useState("");
  const [channelDefaultAccount, setChannelDefaultAccount] = useState("");

  const channels = useMemo(
    () => openclawConfig?.channels ?? EMPTY_CHANNELS,
    [openclawConfig],
  );
  const channelIds = useMemo(
    () =>
      getChannelIds(
        openclawConfig?.channels as Record<string, unknown> | undefined,
      ),
    [openclawConfig],
  );
  const instanceList = channelIds
    .map((id) => ({ id, raw: channels[id] }))
    .filter(({ raw }) => raw != null && typeof raw === "object");

  const availableChannelTypes = useMemo(
    () => OPENCLAW_CHANNEL_TYPES.filter((t) => !channels[t.id]),
    [channels],
  );

  const openAddModal = () => {
    setAddType(availableChannelTypes[0]?.id ?? null);
    setAddName("");
    setSaveError(null);
    setShowAddModal(true);
  };

  const selectedType = selectedId ? channelTypeFromTopKey(selectedId) : null;

  const loadForm = useCallback(
    (id: string) => {
      const c = channels[id] as ChannelInstanceConfig | Record<string, any>;
      if (!c) return;
      setInstanceName((c as ChannelInstanceConfig).name ?? "");
      setBotToken((c.botToken ?? c.token ?? "") as string);
      setUserId(String((c as ChannelInstanceConfig).userId ?? ""));
      setAllowFrom(
        Array.isArray(c.allowFrom)
          ? c.allowFrom.join(", ")
          : String(c.allowFrom ?? ""),
      );
      setDmPolicy(
        String((c as Record<string, unknown>).dmPolicy ?? "pairing"),
      );
      setGroupPolicy((c.groupPolicy ?? "allowlist") as string);
      setGroupMention((c.groupMention ?? "") as string);
      setGroupAllowFrom(
        Array.isArray(c.groupAllowFrom)
          ? c.groupAllowFrom.join(", ")
          : String(c.groupAllowFrom ?? ""),
      );
      setAppId(String(c.appId ?? ""));
      setAppSecret(String(c.appSecret ?? ""));
      setBotName(String(c.botName ?? ""));
      setFeishuDomain(
        (c.domain === "lark" ? "lark" : "feishu") as "feishu" | "lark",
      );
      const rawAid = (c as ChannelInstanceConfig).agentId;
      const aid =
        typeof rawAid === "string" && rawAid.trim()
          ? rawAid.trim()
          : roleIds[0] ?? openclawInstanceId;
      setChannelDefaultAgentId(aid);
      const da = (c as Record<string, unknown>).defaultAccount;
      setChannelDefaultAccount(typeof da === "string" ? da : "");
    },
    [channels, roleIds, openclawInstanceId],
  );

  useEffect(() => {
    setSelectedId(null);
  }, [pondInstanceId]);

  useEffect(() => {
    if (selectedId && channels[selectedId]) loadForm(selectedId);
  }, [selectedId, channels, loadForm]);

  useEffect(() => {
    if (!openclawConfig) return;
    setBindingsDraft(normalizeBindingsFromConfig(openclawConfig.bindings));
    setBindingsError(null);
  }, [openclawConfig, pondInstanceId]);

  const handleAddChannel = async () => {
    if (!addType) {
      toast.error(t("configWizard.pickChannelFirst"));
      return;
    }
    if (channels[addType]) {
      const label = channelTypeLabel(addType);
      toast.error(t("configWizard.channelExists", { name: label }));
      return;
    }
    setAddingChannel(true);
    try {
      await invoke("openclaw_add_channel_stub", {
        instanceId: openclawInstanceId,
        channelId: addType,
        agentId: roleIds[0] ?? openclawInstanceId,
        displayName: addName.trim() ? addName.trim() : null,
      });
      await loadInstanceConfig(openclawInstanceId);
      setShowAddModal(false);
      setAddName("");
      setAddType(null);
      setSelectedId(addType);
      loadForm(addType);
      toast.success(t("configWizard.channelAdded"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setAddingChannel(false);
    }
  };

  const handleSave = async () => {
    if (!openclawConfig || !selectedId) return;
    setSaving(true);
    setSaveError(null);
    const allowList = allowFrom
      ? allowFrom
          .split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const groupAllowList = groupAllowFrom
      ? groupAllowFrom
          .split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const prev = { ...(channels[selectedId] as Record<string, any>) };
    delete prev.token;
    const resolvedAgent =
      channelDefaultAgentId.trim() || roleIds[0] || openclawInstanceId;
    const basePayload: Record<string, any> = {
      ...prev,
      name: instanceName.trim() || undefined,
      agentId: resolvedAgent,
      defaultAccount: channelDefaultAccount.trim()
        ? channelDefaultAccount.trim()
        : null,
      botToken: botToken || undefined,
      userId: userId || undefined,
      allowFrom: allowList,
      dmPolicy,
      groupPolicy,
      groupMention: groupMention.trim() || undefined,
      groupAllowFrom: groupAllowList.length > 0 ? groupAllowList : undefined,
    };
    if (selectedType === "feishu") {
      basePayload.appId = appId.trim() || undefined;
      basePayload.appSecret = appSecret.trim() || undefined;
      basePayload.botName = botName.trim() || undefined;
      basePayload.domain = feishuDomain === "lark" ? "lark" : undefined;
    }
    try {
      await invoke("openclaw_apply_channel", {
        instanceId: openclawInstanceId,
        channelId: selectedId,
        payload: basePayload,
      });
      await loadInstanceConfig(openclawInstanceId);
      toast.success(t("configWizard.channelConfigSaved"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInstance = async () => {
    if (!selectedId || !openclawConfig) return;
    try {
      await invoke("openclaw_remove_channel", {
        instanceId: openclawInstanceId,
        channelId: selectedId,
      });
      await loadInstanceConfig(openclawInstanceId);
      setSelectedId(null);
      setDeleteDialogOpen(false);
      toast.success(t("configWizard.channelDeleted"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(msg);
      toast.error(msg);
    }
  };

  const saveBindings = async () => {
    setBindingsSaving(true);
    setBindingsError(null);
    try {
      const payload = serializeBindings(bindingsDraft);
      await invoke("save_openclaw_bindings_for_instance", {
        instanceId: openclawInstanceId,
        bindings: payload,
      });
      await loadInstanceConfig(openclawInstanceId);
      toast.success(t("configWizard.bindingsSaved"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBindingsError(msg);
      toast.error(msg);
    } finally {
      setBindingsSaving(false);
    }
  };

  if (openclawConfig === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="w-full max-w-md bg-app-surface">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-app-muted">{t("configWizard.loadConfig")}</p>
            <Button
              variant="outline"
              className="mt-4 border-app-border text-app-muted hover:bg-app-hover"
              onClick={() => loadConfigs()}
            >
              {t("configWizard.retry")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <div
        className={cn(
          "w-full space-y-5",
          embedded ? "px-6 pb-6 pt-0" : "p-8",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-app-muted">
            {instanceList.length === 0
              ? t("configWizard.instanceLabelSingle", { id: openclawInstanceId })
              : t("configWizard.instanceLabel", {
                  count: instanceList.length,
                  current: openclawInstanceId,
                })}
          </p>
          <Button
            size="sm"
            className="gap-1.5 bg-claw-500 hover:bg-claw-600 text-white disabled:opacity-50"
            disabled={availableChannelTypes.length === 0}
            title={
              availableChannelTypes.length === 0
                ? t("configWizard.addChannelDisabled")
                : undefined
            }
            onClick={() => openAddModal()}
          >
            <Plus className="h-4 w-4" />
            {t("configWizard.addChannel")}
          </Button>
        </div>

        <ChannelBindingsEditor
          agentIds={roleIds}
          bindings={bindingsDraft}
          onChange={setBindingsDraft}
          disabled={bindingsSaving}
        />
        {bindingsError && (
          <p className="text-sm text-red-400">{bindingsError}</p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-app-border text-app-text"
            disabled={bindingsSaving}
            onClick={() => void saveBindings()}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {bindingsSaving ? t("configWizard.savingBindings") : t("configWizard.saveRoute")}
          </Button>
        </div>

        {instanceList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-app-border/90 bg-app-elevated/25 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-app-border/60 bg-app-surface shadow-sm">
              <MessageSquare className="h-8 w-8 text-app-muted" />
            </div>
            <div className="max-w-sm px-4">
              <p className="text-base font-semibold tracking-tight text-app-text">
                {t("configWizard.noChannelsTitle")}
              </p>
            </div>
            <Button
              variant="outline"
              className="border-app-border bg-app-surface text-app-text hover:bg-app-hover"
              disabled={availableChannelTypes.length === 0}
              onClick={() => openAddModal()}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("configWizard.pickAndAdd")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {instanceList.map(({ id, raw }) => {
              const configured = isInstanceConfigured(raw);
              const selected = selectedId === id;
              const typeId = channelTypeFromTopKey(id);
              const displayName = getInstanceDisplayName(raw, id, channelTypeLabel);
              const stepRows = t(`configWizard.channelSteps.${typeId}`, {
                returnObjects: true,
              });
              const instructions = {
                steps: Array.isArray(stepRows) ? (stepRows as string[]) : [],
                fields: CHANNEL_FORM_FIELDS[typeId],
              };
              return (
                <div
                  key={id}
                  className={cn(
                    "overflow-hidden rounded-2xl border transition-all duration-200",
                    selected
                      ? "border-claw-500/50 bg-app-surface shadow-[0_2px_14px_-8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_16px_-8px_rgba(0,0,0,0.45)]"
                      : "border-white/55 bg-app-surface hover:border-app-hover dark:border-white/[0.06]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(selected ? null : id);
                      setSaveError(null);
                      if (!selected) loadForm(id);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-app-hover/40"
                  >
                    <ChannelBrandIcon typeId={typeId} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-app-text">
                        {displayName}
                      </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                        {configured ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            {t("configWizard.configured")}
                          </span>
                        ) : (
                          <span className="text-app-muted">{t("configWizard.needsCredentials")}</span>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-app-muted transition-transform duration-200",
                        selected ? "rotate-180 text-claw-400" : "",
                      )}
                    />
                  </button>
                  {selected && instructions && (
                    <div className="animate-fade-in border-t border-app-border/30 bg-app-elevated/20">
                      <div className="flex flex-col gap-5 p-4 pt-5">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium uppercase tracking-wider text-app-muted">
                            {t("configWizard.instanceName")}
                          </Label>
                          <Input
                            placeholder={t("configWizard.instanceNamePlaceholder", {
                              channel: channelTypeLabel(typeId),
                            })}
                            value={instanceName}
                            onChange={(e) => setInstanceName(e.target.value)}
                            className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium uppercase tracking-wider text-app-muted">
                              {t("configWizard.defaultRole")}
                            </Label>
                            {roleIds.length > 0 ? (
                              <Select
                                value={
                                  channelDefaultAgentId.trim()
                                    ? channelDefaultAgentId
                                    : (roleIds[0] ?? "")
                                }
                                onValueChange={setChannelDefaultAgentId}
                              >
                                <SelectTrigger className="border-app-border bg-app-surface text-app-text">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-app-border bg-app-surface">
                                  {[
                                    ...roleIds,
                                    ...(channelDefaultAgentId &&
                                    !roleIds.includes(channelDefaultAgentId)
                                      ? [channelDefaultAgentId]
                                      : []),
                                  ].map((id) => (
                                    <SelectItem key={id} value={id}>
                                      {id}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={channelDefaultAgentId}
                                onChange={(e) =>
                                  setChannelDefaultAgentId(e.target.value)
                                }
                                className="border-app-border bg-app-surface text-app-text"
                                placeholder="agentId"
                              />
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium uppercase tracking-wider text-app-muted">
                              {t("configWizard.defaultAccountId")}
                            </Label>
                            <Input
                              value={channelDefaultAccount}
                              onChange={(e) =>
                                setChannelDefaultAccount(e.target.value)
                              }
                              className="border-app-border bg-app-surface text-app-text"
                              placeholder={t("configWizard.accountIdPlaceholder")}
                            />
                          </div>
                        </div>
                        {instructions.steps.length > 0 && (
                          <div className="space-y-1.5 rounded-xl border border-app-border/45 bg-app-surface/60 px-3 py-2.5 text-xs leading-relaxed text-app-muted">
                            {instructions.steps.map((step, i) => (
                              <p key={i}>{step}</p>
                            ))}
                          </div>
                        )}
                        {instructions.fields === "feishu" && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label className="text-app-muted">App ID</Label>
                              <Input
                                type="text"
                                placeholder={t("configWizard.feishu.appIdPlaceholder")}
                                value={appId}
                                onChange={(e) => setAppId(e.target.value)}
                                className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-app-muted">
                                App Secret
                              </Label>
                              <div className="relative">
                                <Input
                                  type={showAppSecret ? "text" : "password"}
                                  placeholder={t("configWizard.feishu.appSecretPlaceholder")}
                                  value={appSecret}
                                  onChange={(e) => setAppSecret(e.target.value)}
                                  className="border-app-border bg-app-surface pr-10 text-app-text placeholder:text-app-muted"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowAppSecret(!showAppSecret)
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text"
                                  aria-label={showAppSecret ? t("configWizard.hide") : t("configWizard.show")}
                                >
                                  {showAppSecret ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-app-muted">
                                {t("configWizard.feishu.botNameOptional")}
                              </Label>
                              <Input
                                type="text"
                                placeholder="My AI assistant"
                                value={botName}
                                onChange={(e) => setBotName(e.target.value)}
                                className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-app-muted">{t("configWizard.feishu.domain")}</Label>
                              <Select
                                value={feishuDomain}
                                onValueChange={(v: "feishu" | "lark") =>
                                  setFeishuDomain(v)
                                }
                              >
                                <SelectTrigger className="w-full rounded-lg border-app-border bg-app-surface text-app-text focus:ring-claw-500 [&>svg]:text-app-muted">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-app-border bg-app-surface">
                                  <SelectItem
                                    value="feishu"
                                    className="text-app-text focus:bg-app-hover focus:text-app-text"
                                  >
                                    {t("configWizard.feishu.feishuCn")}
                                  </SelectItem>
                                  <SelectItem
                                    value="lark"
                                    className="text-app-text focus:bg-app-hover focus:text-app-text"
                                  >
                                    {t("configWizard.feishu.larkIntl")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-app-muted">
                                {t("configWizard.feishu.larkHint")}
                              </p>
                            </div>
                          </div>
                        )}
                        {instructions.fields === "feishu" && (
                          <a
                            href="https://docs.openclaw.ai/zh-CN/channels/feishu"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-claw-400 hover:text-claw-300 hover:underline"
                          >
                            {t("configWizard.feishu.docsLink")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {(instructions.fields === "telegram" ||
                          instructions.fields === "discord") && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label className="text-app-muted">
                                Bot Token
                              </Label>
                              <div className="relative">
                                <Input
                                  type={showToken ? "text" : "password"}
                                  placeholder={t("configWizard.feishu.botTokenPlaceholder")}
                                  value={botToken}
                                  onChange={(e) => setBotToken(e.target.value)}
                                  className="border-app-border bg-app-surface pr-10 text-app-text placeholder:text-app-muted"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowToken(!showToken)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text"
                                  aria-label={showToken ? t("configWizard.hide") : t("configWizard.show")}
                                >
                                  {showToken ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                            {instructions.fields === "telegram" && (
                              <div className="space-y-2">
                                <Label className="text-app-muted">
                                  User ID
                                </Label>
                                <Input
                                  type="text"
                                  placeholder={t("configWizard.feishu.userIdPlaceholder")}
                                  value={userId}
                                  onChange={(e) => setUserId(e.target.value)}
                                  className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                                />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label className="text-app-muted">
                            {t("configWizard.feishu.allowFromLabel")}
                          </Label>
                          <Input
                            type="text"
                            placeholder={t("configWizard.allowFromPlaceholder")}
                            value={allowFrom}
                            onChange={(e) => setAllowFrom(e.target.value)}
                            className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              {t("configWizard.feishu.dmPolicy")}
                            </Label>
                            <Select
                              value={dmPolicy}
                              onValueChange={setDmPolicy}
                            >
                              <SelectTrigger className="w-full rounded-lg border-app-border bg-app-surface text-app-text focus:ring-claw-500 [&>svg]:text-app-muted">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-app-border bg-app-surface">
                                <SelectItem
                                  value="pairing"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  {t("configWizard.feishu.pairing")}
                                </SelectItem>
                                <SelectItem
                                  value="allowlist"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  {t("configWizard.feishu.allowlist")}
                                </SelectItem>
                                <SelectItem
                                  value="open"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  {t("configWizard.feishu.open")}
                                </SelectItem>
                                <SelectItem
                                  value="disabled"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  {t("configWizard.feishu.disabled")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              {t("configWizard.feishu.groupPolicy")}
                            </Label>
                            <Select
                              value={groupPolicy}
                              onValueChange={setGroupPolicy}
                            >
                              <SelectTrigger className="w-full rounded-lg border-app-border bg-app-surface text-app-text focus:ring-claw-500 [&>svg]:text-app-muted">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-app-border bg-app-surface">
                                <SelectItem
                                  value="allowlist"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  {t("configWizard.feishu.allowlist")}
                                </SelectItem>
                                <SelectItem
                                  value="pairing"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  {t("configWizard.feishu.pairing")}
                                </SelectItem>
                                <SelectItem
                                  value="open"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  {t("configWizard.feishu.open")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              {t("configWizard.feishu.groupMention")}
                            </Label>
                            <Input
                              placeholder={t("configWizard.feishu.groupMentionPlaceholder")}
                              value={groupMention}
                              onChange={(e) => setGroupMention(e.target.value)}
                              className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                            />
                            <p className="text-xs text-app-muted">
                              {t("configWizard.feishu.groupMentionHint")}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              {t("configWizard.feishu.groupAllowFrom")}
                            </Label>
                            <Input
                              placeholder={t("configWizard.feishu.groupIdsPlaceholder")}
                              value={groupAllowFrom}
                              onChange={(e) =>
                                setGroupAllowFrom(e.target.value)
                              }
                              className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                            />
                            <p className="text-xs text-app-muted">
                              {t("configWizard.feishu.groupAllowFromHint")}
                            </p>
                          </div>
                        </div>
                        {saveError && (
                          <p className="text-sm text-red-400">
                            {t("configWizard.saveFailed", { msg: saveError })}
                          </p>
                        )}
                        <div className="flex flex-col gap-4 border-t border-app-border/30 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 sm:w-auto"
                            onClick={() => setDeleteDialogOpen(true)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            {t("configWizard.feishu.deleteChannel")}
                          </Button>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-app-border text-app-muted hover:bg-app-hover hover:text-app-text"
                              onClick={async () => {
                                try {
                                  const rows = await invoke<
                                    {
                                      success: boolean;
                                      channel: string;
                                      message: string;
                                    }[]
                                  >("test_channel_connection", {
                                    instanceId: pondInstanceId ?? "default",
                                  });
                                  const bad = rows.filter((r) => !r.success);
                                  if (bad.length === 0) {
                                    toast.success(
                                      rows
                                        .map((r) => `${r.channel}: ${r.message}`)
                                        .join(" · ") || t("configWizard.verifyOk"),
                                    );
                                  } else {
                                    const lines = bad
                                      .map((r) => `${r.channel}: ${r.message}`)
                                      .join("\n");
                                    toast.error(t("configWizard.checkFailed"), {
                                      description: lines,
                                    });
                                  }
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error ? e.message : String(e),
                                  );
                                }
                              }}
                            >
                              <Play className="mr-1.5 h-3.5 w-3.5" />
                              {t("configWizard.checkConfig")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleSave}
                              disabled={saving}
                              className="bg-claw-500 hover:bg-claw-600 text-white"
                            >
                              <Save className="mr-1.5 h-3.5 w-3.5" />
                              {saving ? t("configWizard.saving") : t("configWizard.saveConfig")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={showAddModal}
        onOpenChange={(open) => {
          setShowAddModal(open);
          if (!open) {
            setAddName("");
            setAddType(null);
            setAddingChannel(false);
          }
        }}
      >
        <DialogContent className="gap-0 overflow-hidden border-app-border bg-app-surface p-0 shadow-xl sm:max-w-md">
          <div className="border-b border-app-border/50 bg-app-surface px-6 pb-5 pt-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-xl font-semibold tracking-tight text-app-text">
                {t("configWizard.addChannelTitle")}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-app-muted">
                {t("configWizard.addChannelSubtitle", { id: openclawInstanceId })}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6">
            {availableChannelTypes.length === 0 ? (
              <p className="rounded-xl border border-app-border/60 bg-app-elevated/40 px-4 py-8 text-center text-sm text-app-muted">
                {t("configWizard.allAdded")}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-app-muted">{t("configWizard.platform")}</Label>
                  <Select
                    value={addType ?? undefined}
                    onValueChange={(v) => setAddType(v as ChannelTypeId)}
                    disabled={addingChannel}
                  >
                    <SelectTrigger className="w-full rounded-lg border-app-border bg-app-surface text-app-text focus:ring-claw-500 [&>svg]:text-app-muted">
                      <SelectValue placeholder={t("configWizard.platformPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent className="border-app-border bg-app-surface">
                      {availableChannelTypes.map((ch) => (
                        <SelectItem
                          key={ch.id}
                          value={ch.id}
                          className="text-app-text focus:bg-app-hover focus:text-app-text"
                        >
                          {`${channelTypeLabel(ch.id)} (${ch.id})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-app-muted">{t("configWizard.noteOptional")}</Label>
                  <Input
                    placeholder={t("configWizard.notePlaceholder")}
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    disabled={addingChannel}
                    className="h-11 rounded-xl border-app-border/80 bg-app-elevated text-app-text placeholder:text-app-muted/80"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-app-border/50 bg-app-surface px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-app-border"
              disabled={addingChannel}
              onClick={() => setShowAddModal(false)}
            >
              {t("configWizard.cancel")}
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-claw-500 hover:bg-claw-600 text-white disabled:opacity-50"
              disabled={
                addingChannel ||
                availableChannelTypes.length === 0 ||
                addType == null ||
                Boolean(addType && channels[addType])
              }
              onClick={() => void handleAddChannel()}
            >
              {addingChannel ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              {addingChannel ? t("configWizard.adding") : t("configWizard.addChannel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-app-border bg-app-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-app-text">{t("configWizard.deleteChannelTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-app-muted">
              {t("configWizard.deleteChannelDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-app-border bg-transparent hover:bg-app-hover">
              {t("configWizard.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleDeleteInstance()}
            >
              {t("configWizard.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function getInternalHooksFromConfig(
  config: OpenClawConfig | null,
): HooksInternalConfig | undefined {
  const h = config?.hooks;
  if (!h || typeof h !== "object") return undefined;
  const internal = (h as { internal?: HooksInternalConfig }).internal;
  return internal;
}

function isHookEnabled(config: OpenClawConfig | null, hookId: string): boolean {
  const internal = getInternalHooksFromConfig(config);
  if (!internal?.entries || !(hookId in internal.entries)) return true;
  const entry = internal.entries[hookId];
  return entry?.enabled !== false;
}

export function HooksManager({ embedded }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const {
    openclawConfig,
    saveOpenClawConfig,
    selectedInstanceId,
    hooksListCache,
    setHooksListCache,
  } = useAppStore();
  const instanceIds = useAppStore((s) => s.instanceIds);
  const pondInstanceId = resolvePondInstanceId(
    instanceIds,
    selectedInstanceId,
    
  );
  const currentInstanceId = pondInstanceId ?? "default";
  const list = hooksListCache[currentInstanceId] ?? null;
  const showList = (list?.hooks?.length ?? 0) > 0;

  const [hooksLoading, setHooksLoading] = useState(true);
  const [hooksError, setHooksError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<Record<string, Record<string, string>>>({});
  const internalEnabled =
    getInternalHooksFromConfig(openclawConfig)?.enabled !== false;

  useEffect(() => {
    const instanceId = currentInstanceId;
    setHooksLoading(true);
    setHooksError(null);
    invoke<HooksListResult>("list_hooks_for_instance", { instanceId })
      .then((res) => setHooksListCache(instanceId, res))
      .catch((e) => setHooksError(e instanceof Error ? e.message : String(e)))
      .finally(() => setHooksLoading(false));
  }, [currentInstanceId, setHooksListCache]);

  const setInternalEnabled = (v: boolean) => {
    if (!openclawConfig) return;
    const prev = (openclawConfig.hooks as Record<string, unknown>) ?? {};
    const prevInternal = (prev.internal as HooksInternalConfig) ?? {};
    saveOpenClawConfig(
      {
        ...openclawConfig,
        hooks: {
          ...prev,
          internal: { ...prevInternal, enabled: v },
        } as OpenClawConfig["hooks"],
      },
      pondInstanceId,
    ).catch((e) => setSaveError(e instanceof Error ? e.message : String(e)));
  };

  const setHookEnabled = (hookId: string, enabled: boolean) => {
    if (!openclawConfig) return;
    const prev = (openclawConfig.hooks as Record<string, unknown>) ?? {};
    const prevInternal = (prev.internal as HooksInternalConfig) ?? {};
    const entries = { ...(prevInternal.entries ?? {}) };
    entries[hookId] = { ...(entries[hookId] ?? {}), enabled };
    saveOpenClawConfig(
      {
        ...openclawConfig,
        hooks: {
          ...prev,
          internal: { ...prevInternal, entries },
        } as OpenClawConfig["hooks"],
      },
      pondInstanceId,
    ).catch((e) => setSaveError(e instanceof Error ? e.message : String(e)));
  };

  const getEntryDisplayValue = (hookName: string, field: ConfigFieldSchema): string => {
    const entry = getInternalHooksFromConfig(openclawConfig)?.entries?.[hookName];
    const raw = entry?.[field.key];
    if (field.valueType === "stringArray" && Array.isArray(raw)) return raw.join(", ");
    if (typeof raw === "string") return raw;
    return "";
  };

  const saveConfigForHook = async (hookName: string, schema: ConfigFieldSchema[]) => {
    if (!openclawConfig || !schema.length) return;
    setSaving(true);
    setSaveError(null);
    setSaveMsg(null);
    const prev = (openclawConfig.hooks as Record<string, unknown>) ?? {};
    const prevInternal = (prev.internal as HooksInternalConfig) ?? {};
    const entries = { ...(prevInternal.entries ?? {}) };
    const current = entries[hookName] ?? {};
    const nextEntry: Record<string, unknown> = { ...current };
    for (const field of schema) {
      const raw =
        editingConfig[hookName]?.[field.key] ??
        (field.valueType === "stringArray" && Array.isArray(current[field.key])
          ? (current[field.key] as string[]).join(", ")
          : typeof current[field.key] === "string"
            ? (current[field.key] as string)
            : "");
      if (field.valueType === "stringArray") {
        const arr = raw
          .split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        nextEntry[field.key] = arr.length ? arr : undefined;
      } else {
        nextEntry[field.key] = raw || undefined;
      }
    }
    entries[hookName] = nextEntry as HooksInternalEntry;
    try {
      await saveOpenClawConfig(
        {
          ...openclawConfig,
          hooks: { ...prev, internal: { ...prevInternal, entries } } as OpenClawConfig["hooks"],
        },
        pondInstanceId,
      );
      setEditingConfig((c) => {
        const next = { ...c };
        if (next[hookName]) {
          const rest = { ...next[hookName] };
          schema.forEach((f) => delete rest[f.key]);
          if (Object.keys(rest).length) next[hookName] = rest;
          else delete next[hookName];
        }
        return next;
      });
      setSaveMsg(t("configWizard.hookSaved", { name: hookName }));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (openclawConfig === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="w-full max-w-md bg-app-surface">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-app-muted">{t("configWizard.loadConfig")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showFullLoading = hooksLoading && !showList;

  return (
    <div
      className={cn(
        "flex flex-col overflow-y-auto",
        embedded ? "px-6 pb-6 pt-0" : "p-6",
      )}
    >
      <div className="space-y-6">
        {!embedded && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <GitMerge className="h-4 w-4 text-claw-500 shrink-0" />
              <div>
                <p className="font-medium text-app-text">{t("configWizard.hooksTitle")}</p>
                <p className="text-xs text-app-muted">{t("configWizard.hooksHint")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {hooksLoading && showList && (
                <span className="text-xs text-app-muted">{t("configWizard.refreshing")}</span>
              )}
            <Switch
              checked={internalEnabled}
              onCheckedChange={setInternalEnabled}
              aria-label={t("configWizard.internalHooks")}
            />
            </div>
          </div>
        )}
        <div className="space-y-3">
          {embedded && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-app-muted">
                {t("configWizard.hooksList")}
              </p>
              {hooksLoading && showList && (
                <span className="text-xs text-app-muted">{t("configWizard.refreshing")}</span>
              )}
            </div>
          )}
          {showFullLoading ? (
            <div className="rounded-xl border border-app-border bg-app-surface px-5 py-8 text-center text-sm text-app-muted">
              {t("configWizard.loading")}
            </div>
          ) : hooksError && !showList ? (
            <div className="rounded-xl border border-app-border bg-app-surface px-5 py-8 text-center text-sm text-amber-500">
              {hooksError}
            </div>
          ) : !showList ? (
            <div className="rounded-xl border border-app-border bg-app-surface px-5 py-8 text-center text-sm text-app-muted">
              {t("configWizard.hooksEmpty")}
            </div>
          ) : (
            <ul className="rounded-xl border border-app-border bg-app-surface divide-y divide-app-border overflow-hidden">
              {list!.hooks.map((hook) => (
                <li key={hook.name}>
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0" aria-hidden>
                        {hook.emoji ?? "🔗"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-app-text truncate text-sm">
                          {hook.name}
                        </p>
                        {hook.description ? (
                          <p className="text-xs text-app-muted truncate mt-1">
                            {hook.description}
                          </p>
                        ) : hook.source ? (
                          <p className="text-xs text-app-muted mt-1">
                            {hook.source}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Switch
                      checked={
                        internalEnabled &&
                        isHookEnabled(openclawConfig, hook.name)
                      }
                      disabled={!internalEnabled || hook.managedByPlugin}
                      onCheckedChange={(v) => setHookEnabled(hook.name, v)}
                    />
                  </div>
                  {internalEnabled && (hook.configSchema?.length ?? 0) > 0 && (
                    <div className="border-t border-app-border bg-app-elevated/30 px-5 py-4 space-y-4">
                      {hook.configSchema!.map((field) => (
                        <div key={field.key} className="space-y-2">
                          <Label className="text-app-muted text-sm">
                            {field.label}
                          </Label>
                          {field.description && (
                            <p className="text-xs text-app-muted">
                              {field.description}
                            </p>
                          )}
                          <div className="flex gap-3">
                            <Input
                              placeholder={field.placeholder}
                              value={
                                editingConfig[hook.name]?.[field.key] ??
                                getEntryDisplayValue(hook.name, field)
                              }
                              onChange={(e) =>
                                setEditingConfig((c) => ({
                                  ...c,
                                  [hook.name]: {
                                    ...c[hook.name],
                                    [field.key]: e.target.value,
                                  },
                                }))
                              }
                              className="flex-1 border-app-border bg-app-surface text-app-text placeholder:text-app-muted text-sm"
                            />
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          className="bg-claw-500 hover:bg-claw-600 text-white"
                          disabled={saving}
                          onClick={() => saveConfigForHook(hook.name, hook.configSchema!)}
                        >
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                          {saving ? t("configWizard.saving") : t("configWizard.save")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          {saveError && (
            <p className="text-sm text-red-400">{t("configWizard.saveFailed", { msg: saveError })}</p>
          )}
          {saveMsg && (
            <p className="text-sm text-green-600 dark:text-green-400">
              {saveMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
