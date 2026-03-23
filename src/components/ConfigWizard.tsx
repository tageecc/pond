import { useState, useEffect, useMemo, useCallback } from "react";
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

const CHANNEL_INSTRUCTIONS: Record<
  ChannelTypeId,
  { steps: string[]; fields: "telegram" | "discord" | "generic" | "feishu" }
> = {
  whatsapp: {
    steps: [
      "1. 运行 openclaw channels login --channel whatsapp 扫码绑定",
      "2. 在 allowFrom 填写允许的手机号（E.164 格式，如 +86138...）",
    ],
    fields: "generic",
  },
  telegram: {
    steps: [
      "1. 搜索 @BotFather 发送 /newbot 获取 Bot Token",
      "2. 搜索 @userinfobot 获取 User ID（用于 allowFrom）",
      "3. 或终端：openclaw channels add --channel telegram --token <token>",
    ],
    fields: "telegram",
  },
  discord: {
    steps: [
      "1. 在 Discord 开发者门户创建应用，获取 Bot Token",
      "2. 启用 Message Content Intent，邀请 Bot 到服务器",
    ],
    fields: "discord",
  },
  slack: {
    steps: ["1. 在 Slack API 创建应用", "2. 配置 OAuth 与 Bot Token"],
    fields: "generic",
  },
  imessage: {
    steps: [
      "1. 需要 macOS 且安装 imsg CLI 桥接",
      "2. 填写允许的 Apple ID 或手机号",
    ],
    fields: "generic",
  },
  signal: {
    steps: ["1. 安装 signal-cli 并注册/链接号码", "2. 配置 allowFrom 列表"],
    fields: "generic",
  },
  msteams: {
    steps: ["1. 在 Azure 门户注册应用并创建 Bot", "2. 配置 Bot Framework 凭据"],
    fields: "generic",
  },
  googlechat: {
    steps: [
      "1. 在 Google Cloud Console 创建 Chat API 应用",
      "2. 配置 Service Account JSON",
    ],
    fields: "generic",
  },
  mattermost: {
    steps: ["1. 在 Mattermost 创建 Bot 账号", "2. 获取 Bot Token 和服务器 URL"],
    fields: "generic",
  },
  matrix: {
    steps: [
      "1. 创建 Matrix Bot 账号",
      "2. 获取 Access Token 和 Homeserver URL",
    ],
    fields: "generic",
  },
  irc: {
    steps: ["1. 配置 IRC 服务器地址和频道", "2. 设置 Bot 昵称和认证信息"],
    fields: "generic",
  },
  feishu: {
    steps: [],
    fields: "feishu",
  },
  line: {
    steps: [
      "1. 在 LINE Developers 创建 Messaging API Channel",
      "2. 获取 Channel Access Token",
    ],
    fields: "generic",
  },
  nostr: {
    steps: ["1. 生成 Nostr 密钥对（nsec/npub）", "2. 配置中继服务器列表"],
    fields: "generic",
  },
  twitch: {
    steps: ["1. 在 Twitch 开发者门户注册应用", "2. 获取 OAuth Token 和频道名"],
    fields: "generic",
  },
  bluebubbles: {
    steps: ["1. 在 macOS 安装 BlueBubbles Server", "2. 配置 API URL 和密码"],
    fields: "generic",
  },
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
): string {
  const name = (raw as ChannelInstanceConfig).name;
  if (name && String(name).trim()) return String(name).trim();
  const typeId = channelTypeFromTopKey(instanceId);
  const typeName =
    OPENCLAW_CHANNEL_TYPES.find((c) => c.id === typeId)?.name ?? typeId;
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
  const { openclawConfig, loadConfigs, loadInstanceConfig } = useAppStore();
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId);
  const instanceIds = useAppStore((s) => s.instanceIds);
  const pondInstanceId = resolvePondInstanceId(
    instanceIds,
    selectedInstanceId,
    openclawConfig,
  );
  const openclawInstanceId = pondInstanceId ?? "default";
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
      toast.error("请先选择渠道类型");
      return;
    }
    if (channels[addType]) {
      const label =
        OPENCLAW_CHANNEL_TYPES.find((c) => c.id === addType)?.name ?? addType;
      toast.error(`已存在「${label}」，每个平台只能添加一条。`);
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
      toast.success("已添加渠道，请填写凭据并保存");
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
      toast.success("渠道配置已保存");
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
      toast.success("已删除该渠道实例");
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
      toast.success("路由已保存");
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
            <p className="text-app-muted">加载配置中…</p>
            <Button
              variant="outline"
              className="mt-4 border-app-border text-app-muted hover:bg-app-hover"
              onClick={() => loadConfigs()}
            >
              重试
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
              ? `实例 ${openclawInstanceId}`
              : `共 ${instanceList.length} 个渠道 · ${openclawInstanceId}`}
          </p>
          <Button
            size="sm"
            className="gap-1.5 bg-claw-500 hover:bg-claw-600 text-white disabled:opacity-50"
            disabled={availableChannelTypes.length === 0}
            title={
              availableChannelTypes.length === 0
                ? "各平台均已添加，无法再选"
                : undefined
            }
            onClick={() => openAddModal()}
          >
            <Plus className="h-4 w-4" />
            添加渠道
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
            {bindingsSaving ? "保存中…" : "保存路由"}
          </Button>
        </div>

        {instanceList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-app-border/90 bg-app-elevated/25 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-app-border/60 bg-app-surface shadow-sm">
              <MessageSquare className="h-8 w-8 text-app-muted" />
            </div>
            <div className="max-w-sm px-4">
              <p className="text-base font-semibold tracking-tight text-app-text">
                尚未连接消息渠道
              </p>
            </div>
            <Button
              variant="outline"
              className="border-app-border bg-app-surface text-app-text hover:bg-app-hover"
              disabled={availableChannelTypes.length === 0}
              onClick={() => openAddModal()}
            >
              <Plus className="mr-2 h-4 w-4" />
              选择并添加渠道
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {instanceList.map(({ id, raw }) => {
              const configured = isInstanceConfigured(raw);
              const selected = selectedId === id;
              const typeId = channelTypeFromTopKey(id);
              const meta = OPENCLAW_CHANNEL_TYPES.find((c) => c.id === typeId);
              const displayName = getInstanceDisplayName(raw, id);
              const instructions = CHANNEL_INSTRUCTIONS[typeId];
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
                            已配置
                          </span>
                        ) : (
                          <span className="text-app-muted">待完善凭据</span>
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
                            实例名称
                          </Label>
                          <Input
                            placeholder={`如：客服 ${meta?.name ?? ""}`}
                            value={instanceName}
                            onChange={(e) => setInstanceName(e.target.value)}
                            className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium uppercase tracking-wider text-app-muted">
                              默认角色
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
                              默认账户 ID
                            </Label>
                            <Input
                              value={channelDefaultAccount}
                              onChange={(e) =>
                                setChannelDefaultAccount(e.target.value)
                              }
                              className="border-app-border bg-app-surface text-app-text"
                              placeholder="多账号时填写，如 default"
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
                                placeholder="cli_xxx"
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
                                  placeholder="从飞书开放平台获取"
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
                                  aria-label={showAppSecret ? "隐藏" : "显示"}
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
                                机器人名称（可选）
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
                              <Label className="text-app-muted">域名</Label>
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
                                    飞书（国内）
                                  </SelectItem>
                                  <SelectItem
                                    value="lark"
                                    className="text-app-text focus:bg-app-hover focus:text-app-text"
                                  >
                                    Lark（国际版）
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-app-muted">
                                国际版租户选 Lark
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
                            飞书配置说明
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
                                  placeholder="请输入 Bot Token"
                                  value={botToken}
                                  onChange={(e) => setBotToken(e.target.value)}
                                  className="border-app-border bg-app-surface pr-10 text-app-text placeholder:text-app-muted"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowToken(!showToken)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text"
                                  aria-label={showToken ? "隐藏" : "显示"}
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
                                  placeholder="请输入 User ID"
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
                            白名单 allowFrom（可选，多个用逗号分隔）
                          </Label>
                          <Input
                            type="text"
                            placeholder="+8613800138000, tg:123456789"
                            value={allowFrom}
                            onChange={(e) => setAllowFrom(e.target.value)}
                            className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              私聊策略 (dmPolicy)
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
                                  配对模式 (pairing)
                                </SelectItem>
                                <SelectItem
                                  value="allowlist"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  白名单 (allowlist)
                                </SelectItem>
                                <SelectItem
                                  value="open"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  开放 (open)
                                </SelectItem>
                                <SelectItem
                                  value="disabled"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  禁用 (disabled)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              群组策略 (groupPolicy)
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
                                  白名单 (allowlist)
                                </SelectItem>
                                <SelectItem
                                  value="pairing"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  配对模式 (pairing)
                                </SelectItem>
                                <SelectItem
                                  value="open"
                                  className="text-app-text focus:bg-app-hover focus:text-app-text"
                                >
                                  开放 (open)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              群组 @提及模式 (groupMention)
                            </Label>
                            <Input
                              placeholder="@BotName 或留空不限"
                              value={groupMention}
                              onChange={(e) => setGroupMention(e.target.value)}
                              className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                            />
                            <p className="text-xs text-app-muted">
                              群聊中需要 @什么名称才触发 Bot 响应
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-app-muted">
                              群组白名单 (groupAllowFrom)
                            </Label>
                            <Input
                              placeholder="群组ID1, 群组ID2"
                              value={groupAllowFrom}
                              onChange={(e) =>
                                setGroupAllowFrom(e.target.value)
                              }
                              className="border-app-border bg-app-surface text-app-text placeholder:text-app-muted"
                            />
                            <p className="text-xs text-app-muted">
                              允许响应的群组 ID 列表，留空表示所有群组
                            </p>
                          </div>
                        </div>
                        {saveError && (
                          <p className="text-sm text-red-400">
                            保存失败：{saveError}
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
                            删除此渠道
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
                                        .join(" · ") || "校验通过",
                                    );
                                  } else {
                                    const lines = bad
                                      .map((r) => `${r.channel}: ${r.message}`)
                                      .join("\n");
                                    toast.error("配置检查未通过", {
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
                              检查配置
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleSave}
                              disabled={saving}
                              className="bg-claw-500 hover:bg-claw-600 text-white"
                            >
                              <Save className="mr-1.5 h-3.5 w-3.5" />
                              {saving ? "保存中…" : "保存配置"}
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
                添加消息渠道
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-app-muted">
                实例 {openclawInstanceId} · 每平台一条
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6">
            {availableChannelTypes.length === 0 ? (
              <p className="rounded-xl border border-app-border/60 bg-app-elevated/40 px-4 py-8 text-center text-sm text-app-muted">
                列表中的平台都已添加过。
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-app-muted">平台</Label>
                  <Select
                    value={addType ?? undefined}
                    onValueChange={(v) => setAddType(v as ChannelTypeId)}
                    disabled={addingChannel}
                  >
                    <SelectTrigger className="w-full rounded-lg border-app-border bg-app-surface text-app-text focus:ring-claw-500 [&>svg]:text-app-muted">
                      <SelectValue placeholder="选择要接入的平台" />
                    </SelectTrigger>
                    <SelectContent className="border-app-border bg-app-surface">
                      {availableChannelTypes.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                          className="text-app-text focus:bg-app-hover focus:text-app-text"
                        >
                          {`${t.name} (${t.id})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-app-muted">备注名（可选）</Label>
                  <Input
                    placeholder="在列表中显示的名称，如：工作通知、客服入口"
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
              取消
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
              {addingChannel ? "正在添加…" : "添加渠道"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-app-border bg-app-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-app-text">删除渠道实例？</AlertDialogTitle>
            <AlertDialogDescription className="text-app-muted">
              将从当前工作区配置中移除此渠道，且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-app-border bg-transparent hover:bg-app-hover">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleDeleteInstance()}
            >
              删除
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
    openclawConfig,
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
      setSaveMsg(`已保存 ${hookName}`);
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
            <p className="text-app-muted">加载配置中…</p>
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
                <p className="font-medium text-app-text">Hooks</p>
                <p className="text-xs text-app-muted">启用/禁用内置 Hooks</p>
              </div>
            </div>
            <Switch
              checked={internalEnabled}
              onCheckedChange={setInternalEnabled}
              aria-label="启用内部 Hooks"
            />
          </div>
        )}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-app-muted">
              Hooks 列表
            </p>
            {hooksLoading && showList && (
              <span className="text-xs text-app-muted">刷新中…</span>
            )}
          </div>
          {showFullLoading ? (
            <div className="rounded-xl border border-app-border bg-app-surface px-5 py-8 text-center text-sm text-app-muted">
              加载中…
            </div>
          ) : hooksError && !showList ? (
            <div className="rounded-xl border border-app-border bg-app-surface px-5 py-8 text-center text-sm text-amber-500">
              {hooksError}
            </div>
          ) : !showList ? (
            <div className="rounded-xl border border-app-border bg-app-surface px-5 py-8 text-center text-sm text-app-muted">
              未发现 Hooks（工作区 / 托管 / 内置目录）
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
                          {saving ? "保存中…" : "保存"}
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
            <p className="text-sm text-red-400">保存失败：{saveError}</p>
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
