import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  useAppStore,
  getDefaultChatState,
  type ChatSessionState,
} from "../stores/appStore";
import type { GatewaySessionRow } from "../types";
import { Button } from "./ui/button";
import {
  Send,
  Loader2,
  Bot,
  User,
  AlertCircle,
  Square,
  PlusSquare,
  Wrench,
  Brain,
  Play,
  History,
  ChevronRight,
  Code2,
  Database,
  FileText,
  Globe,
  Terminal,
  Copy,
  MessageSquare,
} from "lucide-react";
import { cn, getAgentDisplayName } from "../lib/utils";
import { resolvePondInstanceId } from "../lib/pondInstanceId";
import { resolveTeamLeaderAgentId, TEAM_LEADER_AGENT_ID } from "../lib/teamLeader";

const DEFAULT_GATEWAY_PORT = 18789
import {
  chatSessionStoreKey,
  isUnifiedDmContinuity,
  normalizePondProfileId,
  sessionKeyBelongsToOpenClawRole,
} from "../lib/chatSessionKeys";
import { MarkdownContent } from "./MarkdownContent";
import { toast } from "sonner";
import { ExecutionTimeline, type ExecutionStep } from "./ExecutionTimeline";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import type {
  ChatMessage as StoreChatMessage,
  ChatToolCallPart,
  ChatReasoningPart,
} from "../types";

/** Single tool call row (display; matches store types) */
export type ToolCallPart = ChatToolCallPart;

/** Reasoning block (matches store types) */
export type ReasoningPart = ChatReasoningPart;

/** Chat message (display; matches store) */
export type ChatMessage = StoreChatMessage;

/** Strip chars that break backend ByteString (e.g. 55357): emoji surrogates and some invisible chars */
function sanitizeForBackend(s: string): string {
  if (!s || typeof s !== "string") return s;
  return (
    s
      .replace(/[\uD800-\uDFFF]/g, "") // UTF-16 surrogate pairs (emoji, etc.)
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // Zero-width, BOM
      .trim() || s
  );
}

// Tool name → icon
const TOOL_ICONS: Record<string, React.ComponentType<any>> = {
  read: FileText,
  write: FileText,
  edit: Code2,
  exec: Terminal,
  shell: Terminal,
  search: Globe,
  web_search: Globe,
  web_fetch: Globe,
  memory: Database,
  default: Wrench,
};

function getToolIcon(toolName: string) {
  const Icon = TOOL_ICONS[toolName.toLowerCase()] || TOOL_ICONS.default;
  return Icon;
}

function ToolCallBlock({ call }: { call: ToolCallPart }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const argsPreview = call.args?.trim() || "";
  let prettyArgs = argsPreview;
  let parsedArgs: any = null;
  let parseError = false;
  try {
    if (argsPreview) {
      parsedArgs = JSON.parse(argsPreview);
      prettyArgs = JSON.stringify(parsedArgs, null, 2);
    }
  } catch {
    parseError = true;
    prettyArgs = argsPreview || "";
  }

  // Arg preview: first key or first 50 chars
  const getArgsPreview = () => {
    if (!argsPreview) return "";
    if (!parsedArgs)
      return argsPreview.slice(0, 50) + (argsPreview.length > 50 ? "..." : "");
    const keys = Object.keys(parsedArgs);
    if (keys.length === 0) return "";
    const firstKey = keys[0];
    const firstValue = parsedArgs[firstKey];
    if (typeof firstValue === "string") {
      const preview = firstValue.slice(0, 40);
      return `${firstKey}: ${preview}${firstValue.length > 40 ? "..." : ""}`;
    }
    return `${firstKey}: ${JSON.stringify(firstValue).slice(0, 30)}...`;
  };

  const Icon = getToolIcon(call.name);
  const isEmpty =
    !argsPreview || (parsedArgs && Object.keys(parsedArgs).length === 0);
  const argsCount = parsedArgs ? Object.keys(parsedArgs).length : 0;

  // No args: skip Collapsible, static card only
  if (isEmpty) {
    return (
      <div className="mt-2 mb-3 rounded-lg border border-app-border bg-app-elevated/60 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-app-bg/80">
            <Icon className="h-3 w-3 text-amber-500" />
          </div>
          <span className="text-sm font-medium text-app-text">{call.name}</span>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2 mb-3">
      <div
        className={cn(
          "group rounded-lg border transition-all duration-200",
          isOpen
            ? "border-claw-500/40 bg-gradient-to-br from-claw-500/5 via-transparent to-transparent shadow-sm"
            : "border-app-border bg-app-elevated/60 hover:border-claw-500/30 hover:bg-app-elevated",
        )}
      >
        <CollapsibleTrigger className="w-full px-3 py-2.5 text-left">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                isOpen
                  ? "bg-claw-500/15"
                  : "bg-app-bg/80 group-hover:bg-claw-500/10",
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  isOpen
                    ? "text-claw-500"
                    : "text-amber-500 group-hover:text-claw-500",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-app-text">
                  {call.name}
                </span>
                {argsCount > 0 && (
                  <span className="flex h-4 items-center rounded-full bg-claw-500/10 px-1.5 text-[10px] font-medium text-claw-600 dark:text-claw-400">
                    {argsCount}
                  </span>
                )}
              </div>
              {!isOpen && (
                <div className="mt-0.5 text-xs text-app-muted/70 truncate">
                  {getArgsPreview()}
                </div>
              )}
            </div>
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-app-muted transition-transform duration-200",
                isOpen && "rotate-90",
              )}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-2.5">
          <div className="pt-1.5">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-px flex-1 bg-gradient-to-r from-app-border to-transparent" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-app-muted/50">
                {t("chat.paramDetails")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-app-border to-transparent" />
            </div>
            <div className="relative rounded-md border border-app-border/50 bg-app-bg/60 backdrop-blur-sm">
              {parseError && (
                <div className="border-b border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" />
                    {t("chat.jsonParseFailed")}
                  </p>
                </div>
              )}
              <pre className="max-h-48 overflow-auto p-2.5 font-mono text-[11px] text-app-text/90 leading-relaxed">
                {prettyArgs}
              </pre>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(prettyArgs);
                  toast.success(t("chat.copiedParams"));
                }}
                className="absolute right-1.5 top-1.5 rounded bg-app-elevated/90 px-1.5 py-0.5 text-[10px] text-app-muted opacity-0 transition-opacity hover:text-app-text group-hover:opacity-100"
              >
                {t("chat.copy")}
              </button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ReasoningBlock({
  reasoning,
  streaming,
}: {
  reasoning: ReasoningPart;
  streaming?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!!streaming);
  const text = reasoning.content || reasoning.summary;
  if (!text) return null;
  return (
    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 font-medium text-purple-400 hover:text-purple-300 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span>{streaming ? t("chat.thinkingEllipsis") : t("chat.thinking")}</span>
        <span className="ml-auto text-xs font-normal text-app-muted">
          {expanded ? t("chat.collapse") : t("chat.expand")}
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 max-h-60 overflow-y-auto text-xs text-app-muted whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

/** WebSocket RPC stream event union */
type WsStreamEvent =
  | { kind: "text"; delta: string }
  | { kind: "tool_call"; phase: "start" | "result"; item: ToolCallPart }
  | { kind: "reasoning_delta"; delta: string }
  | { kind: "error"; message: string }
  | null;

/** Hover time: prefer parsed bracket text; else format sentAt (ms or ISO) locally */
function formatMessageTime(parsedTimestamp?: string, sentAt?: string): string {
  if (parsedTimestamp) return parsedTimestamp;
  if (!sentAt) return "";
  const raw = /^\d+$/.test(sentAt) ? Number(sentAt) : sentAt;
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return sentAt;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    const now = new Date();
    const dateStr =
      y === now.getFullYear()
        ? i18n.t("chat.dateSameYear", { month: m, day })
        : i18n.t("chat.dateFull", { year: y, month: m, day });
    return `${dateStr} ${h}:${min}`;
  } catch {
    return sentAt;
  }
}

function channelLabel(row: {
  channel?: string;
  label?: string;
  sessionKey: string;
}) {
  const ch = (row.channel ?? "").toLowerCase();
  const name =
    ch === "feishu" || ch === "lark"
      ? i18n.t("chat.sourceFeishu")
      : ch === "pond"
        ? "ClawTeam"
        : ch === "telegram"
          ? "Telegram"
          : ch === "discord"
            ? "Discord"
            : ch === "webchat"
              ? "WebChat"
              : ch === "slack"
                ? "Slack"
                : ch
                  ? ch
                  : i18n.t("chat.sourceSession");
  return row.label ? `${name} · ${row.label}` : name;
}

/** Map gateway sender label/id to a short source label; null to hide */
function senderToFriendlySource(
  sender: { label?: string; id?: string } | undefined,
): string | null {
  if (!sender?.label && !sender?.id) return null;
  const v = (sender.label ?? sender.id ?? "").toLowerCase();
  const map: Record<string, string> = {
    cli: i18n.t("chat.sourceCli"),
    webchat: i18n.t("chat.sourceWebchat"),
    pond: i18n.t("chat.sourcePond"),
    feishu: i18n.t("chat.sourceFeishu"),
    lark: i18n.t("chat.sourceLark"),
    telegram: "Telegram",
    discord: "Discord",
  };
  return map[v] ?? null;
}

/** Parse user bubble: body + optional metadata from OpenClaw; bubble shows body only */
function parseUserMessageContent(raw: string): {
  displayText: string;
  timestamp?: string;
  sender?: { label?: string; id?: string };
} {
  const s = raw.trim();
  const hasMetadata =
    s.includes("Sender (untrusted metadata)") ||
    (s.includes("{") && (s.includes('"label"') || s.includes('"id"')));
  if (!hasMetadata) {
    return { displayText: raw };
  }

  let sender: { label?: string; id?: string } | undefined;
  const jsonMatch = s.match(/\{[\s\S]*?"(?:label|id)"\s*:\s*"[^"]*"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, string>;
      if (obj.label != null || obj.id != null) {
        sender = { label: obj.label, id: obj.id };
      }
    } catch {
      // ignore
    }
  }

  let displayText = raw;
  let timestamp: string | undefined;
  const idxSpace = s.lastIndexOf("] ");
  const idxNewline = s.lastIndexOf("]\n");
  const cut = Math.max(
    idxSpace >= 0 ? idxSpace + 2 : -1,
    idxNewline >= 0 ? idxNewline + 2 : -1,
  );
  if (cut >= 0) {
    displayText = s.slice(cut).trim();
    const before = s.slice(0, cut - 2);
    const lastOpen = before.lastIndexOf("[");
    if (lastOpen >= 0) {
      const after = before.slice(lastOpen + 1);
      const close = after.indexOf("]");
      if (close >= 0) timestamp = after.slice(0, close).trim();
    }
  }

  if (!displayText) displayText = raw;
  return { displayText, timestamp, sender };
}

export function ChatView() {
  const { t } = useTranslation();
  const {
    openclawConfig,
    loadConfigs,
    getEffectiveGatewayInfo,
    startAgentGateway,
    updateAgentExecutionState,
    refreshInstanceDisplayName,
    updateChatSession,
    loadSessionTranscript,
    getChatSessionState,
  } = useAppStore();

  const instanceIds = useAppStore((s) => s.instanceIds);
  const instanceDisplayNames = useAppStore((s) => s.instanceDisplayNames);
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId);
  /** Current Pond profile (gateway, tokens, workspace) */
  const pondInstanceId =
    resolvePondInstanceId(instanceIds, selectedInstanceId) ??
    "default";
  const agentsListForRoles = openclawConfig?.agents?.list ?? [];
  const roleIds = useMemo(
    () =>
      Array.isArray(agentsListForRoles) && agentsListForRoles.length > 0
        ? agentsListForRoles.map((e) => String(e.id)).filter(Boolean)
        : ["main"],
    [agentsListForRoles],
  );
  const teamLeaderRoleId = useMemo(
    () => resolveTeamLeaderAgentId(agentsListForRoles),
    [agentsListForRoles],
  );
  const multiRole = roleIds.length > 1;
  const [chatRoleId, setChatRoleId] = useState<string>("main");
  useEffect(() => {
    setChatRoleId((prev) => {
      if (roleIds.includes(prev)) return prev;
      return (
        resolveTeamLeaderAgentId(agentsListForRoles) ??
        roleIds[0] ??
        "main"
      );
    });
  }, [agentsListForRoles, roleIds]);

  const chatStoreKey = chatSessionStoreKey(pondInstanceId, chatRoleId);

  const defaultChatState = useMemo(() => getDefaultChatState(), []);
  const chatState =
    useAppStore((s) => s.chatByInstance[chatStoreKey]) ?? defaultChatState;

  const [input, setInput] = useState("");
  const [gatewayStarting, setGatewayStarting] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineFrozenSteps, setTimelineFrozenSteps] = useState<
    ExecutionStep[]
  >([]);
  const [timelineLive, setTimelineLive] = useState(false);
  const [gatewaySessions, setGatewaySessions] = useState<GatewaySessionRow[]>(
    [],
  );
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);
  const [newLocalThread, setNewLocalThread] = useState(false);

  useEffect(() => {
    setNewLocalThread(false);
    setTimelineOpen(false);
    setTimelineLive(false);
  }, [chatStoreKey]);

  const messages = chatState.messages;
  const streamingContent = chatState.streamingContent;
  const streamingToolCalls = chatState.streamingToolCalls;
  const streamingReasoning = chatState.streamingReasoning;
  const sending = chatState.sending;
  const error = chatState.error;
  const executionState = chatState.executionState;
  const executionStartTime = chatState.executionStartTime;
  const executionSteps = chatState.executionSteps;

  useEffect(() => {
    if (!timelineOpen || !timelineLive) return;
    if (!sending) {
      const asst = messages.filter((m) => m.role === "assistant");
      const last = asst.length > 0 ? asst[asst.length - 1] : undefined;
      const st = last?.executionSteps;
      if (st?.length) setTimelineFrozenSteps(st);
      setTimelineLive(false);
    }
  }, [sending, timelineOpen, timelineLive, messages]);

  const openTimelineLive = useCallback(() => {
    setTimelineLive(true);
    setTimelineOpen(true);
  }, []);

  const openTimelineFrozen = useCallback((steps: ExecutionStep[]) => {
    setTimelineLive(false);
    setTimelineFrozenSteps(steps);
    setTimelineOpen(true);
  }, []);

  const dialogTimelineSteps =
    timelineOpen && timelineLive && sending
      ? executionSteps
      : timelineFrozenSteps;
  const dialogTimelineExecuting = timelineOpen && timelineLive && sending;

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const displayNames = (instanceDisplayNames ?? {}) as Record<string, string>;
  const gatewayInfo = getEffectiveGatewayInfo(pondInstanceId);
  const effectivePort = gatewayInfo.port;
  const agentGwStatus = gatewayInfo.agentGatewayStatus;
  const canSend = agentGwStatus === "running" && effectivePort > 0;

  // When gateway is up, list sessions for all channels (Feishu, Pond, Telegram, …)
  useEffect(() => {
    if (!canSend || !effectivePort) {
      setGatewaySessions([]);
      return;
    }
    let cancelled = false;
    setSessionsLoading(true);
    invoke<GatewaySessionRow[]>("list_gateway_sessions", {
      instanceId: normalizePondProfileId(pondInstanceId),
      port: effectivePort,
    })
      .then((list) => {
        if (!cancelled) setGatewaySessions(list);
      })
      .catch(() => {
        if (!cancelled) setGatewaySessions([]);
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canSend, effectivePort, pondInstanceId]);

  const gatewaySessionsForRole = useMemo(() => {
    const filtered = gatewaySessions.filter((s) =>
      sessionKeyBelongsToOpenClawRole(s.sessionKey, chatRoleId),
    );
    return [...filtered].sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    );
  }, [gatewaySessions, chatRoleId]);

  const selectedGatewayRow = useMemo(
    () =>
      gatewaySessionsForRole.find((s) => s.sessionKey === chatState.sessionKey),
    [gatewaySessionsForRole, chatState.sessionKey],
  );

  const showSessionSwitcher =
    gatewaySessionsForRole.length > 0 &&
    !isUnifiedDmContinuity(openclawConfig?.session);

  const nextPondSessionKey = useCallback(() => {
    const r = sanitizeForBackend(chatRoleId) || chatRoleId || "main";
    return `agent:${r}:pond-${crypto.randomUUID().slice(0, 8)}`;
  }, [chatRoleId]);

  const applyGatewayRow = useCallback(
    (row: GatewaySessionRow) => {
      const snap = getChatSessionState(chatStoreKey);
      const backup: ChatSessionState = {
        ...snap,
        messages: [...snap.messages],
        streamingToolCalls: [...snap.streamingToolCalls],
      };
      updateChatSession(chatStoreKey, {
        sessionKey: row.sessionKey,
        messages: [],
      });
      setTranscriptLoading(true);
      return loadSessionTranscript(
        normalizePondProfileId(pondInstanceId),
        row.sessionKey,
        row.sessionId,
        chatStoreKey,
      )
        .catch((e) => {
          console.error(e);
          updateChatSession(chatStoreKey, backup);
          toast.error(i18n.t("chat.loadHistoryFailed"));
          throw e;
        })
        .finally(() => setTranscriptLoading(false));
    },
    [
      chatStoreKey,
      pondInstanceId,
      loadSessionTranscript,
      updateChatSession,
      getChatSessionState,
    ],
  );

  const enqueueApplyGatewayRow = useCallback(
    (row: GatewaySessionRow) => {
      void applyGatewayRow(row).catch(() => {});
    },
    [applyGatewayRow],
  );

  useEffect(() => {
    if (sessionsLoading) return;
    const sk = chatState.sessionKey;
    const inList = (key: string) =>
      gatewaySessionsForRole.some((s) => s.sessionKey === key);

    if (newLocalThread && sk && inList(sk)) {
      setNewLocalThread(false);
    }

    if (!sk) {
      if (!canSend || gatewaySessionsForRole.length === 0) {
        return;
      }
      enqueueApplyGatewayRow(gatewaySessionsForRole[0]);
      return;
    }

    // If sessionKey is not in the gateway list yet, do not auto-switch to first row (old behavior looked like lost history).
  }, [
    sessionsLoading,
    chatState.sessionKey,
    canSend,
    chatStoreKey,
    gatewaySessionsForRole,
    enqueueApplyGatewayRow,
    newLocalThread,
  ]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [
    messages,
    streamingContent,
    streamingToolCalls,
    streamingReasoning,
    scrollToBottom,
  ]);

  const startNewConversation = useCallback(() => {
    if (sending) {
      for (const unsub of unlistenersRef.current) unsub();
      unlistenersRef.current = [];
    }
    setNewLocalThread(true);
    updateChatSession(chatStoreKey, {
      ...getDefaultChatState(),
      messages: [],
      sessionKey: nextPondSessionKey(),
      sending: false,
      error: null,
    });
  }, [sending, chatStoreKey, updateChatSession, nextPondSessionKey]);

  const handleStop = useCallback(() => {
    for (const unsub of unlistenersRef.current) unsub();
    unlistenersRef.current = [];
    const cur = useAppStore.getState().getChatSessionState(chatStoreKey);
    const partial = cur.streamingContent.trim();
    const partialToolCalls = [...cur.streamingToolCalls];
    const partialReasoning = cur.streamingReasoning;
    let nextMessages = cur.messages;
    if (partial || partialToolCalls.length > 0 || partialReasoning) {
      const curSteps = cur.executionSteps;
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: partial
          ? partial + "\n\n" + i18n.t("chat.stoppedPartial")
          : i18n.t("chat.stoppedShort"),
        toolCalls: partialToolCalls.length > 0 ? partialToolCalls : undefined,
        reasoning: partialReasoning ?? undefined,
        executionSteps:
          curSteps.length > 0 ? [...curSteps] : undefined,
      };
      nextMessages = [...nextMessages, assistantMsg];
    }
    updateChatSession(chatStoreKey, {
      messages: nextMessages,
      streamingContent: "",
      streamingToolCalls: [],
      streamingReasoning: null,
      executionState: "idle",
      executionStartTime: null,
      executionSteps: [],
      sending: false,
    });
  }, [chatStoreKey, updateChatSession]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    
    // Check if gateway is running
    if (!canSend) {
      updateChatSession(chatStoreKey, {
        error: i18n.t("chat.startGatewayFirst"),
      });
      return;
    }
    
    // Check if API key is configured
    const currentConfig = useAppStore.getState().openclawConfig;
    if (!currentConfig || !currentConfig.models?.providers || Object.keys(currentConfig.models.providers).length === 0) {
      updateChatSession(chatStoreKey, {
        error: i18n.t("chat.noApiKeyConfigured"),
      });
      return;
    }
    
    // Check if any provider has valid API key
    const hasValidKey = Object.values(currentConfig.models.providers).some(
      (provider) => provider?.apiKey && provider.apiKey.trim().length > 0
    );
    if (!hasValidKey) {
      updateChatSession(chatStoreKey, {
        error: i18n.t("chat.noApiKeyConfigured"),
      });
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const curState = useAppStore.getState().getChatSessionState(chatStoreKey);
    const nextMessages = [...curState.messages, userMsg];

    updateChatSession(chatStoreKey, {
      messages: nextMessages,
      error: null,
      sending: true,
      executionState: "thinking",
      executionStartTime: Date.now(),
      executionSteps: [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          type: "message" as const,
          content: i18n.t("chat.userMessagePreview", {
            text: `${text.slice(0, 50)}${text.length > 50 ? "..." : ""}`,
          }),
          status: "completed" as const,
        },
      ],
    });
    setInput("");
    updateAgentExecutionState(pondInstanceId, "thinking");

    let sessionKey = useAppStore
      .getState()
      .getChatSessionState(chatStoreKey).sessionKey;
    if (!sessionKey) {
      sessionKey = nextPondSessionKey();
      updateChatSession(chatStoreKey, { sessionKey });
    }

    const port = Number(effectivePort) || DEFAULT_GATEWAY_PORT;
    const pondKey = sanitizeForBackend(pondInstanceId) || pondInstanceId;
    const agentKey = pondKey || "default";
    const safeMessage = sanitizeForBackend(text) || text;
    const wsProfile = agentKey === "default" ? null : agentKey;

    const applyWsEventToStore = (event: WsStreamEvent) => {
      if (!event) return;
      const get = useAppStore.getState;
      switch (event.kind) {
        case "text": {
          const s = get().getChatSessionState(chatStoreKey);
          updateChatSession(chatStoreKey, {
            streamingContent: s.streamingContent + event.delta,
          });
          break;
        }
        case "tool_call": {
          const s = get().getChatSessionState(chatStoreKey);
          const list = [...s.streamingToolCalls];
          const idx = list.findIndex((t) => t.callId === event.item.callId);
          if (idx < 0) {
            list.push(event.item);
            const step: ExecutionStep = {
              id: crypto.randomUUID(),
              timestamp: new Date(),
              type: "tool_call",
              content: i18n.t("chat.toolCall", { name: event.item.name }),
              status: "running",
              metadata: {
                toolName: event.item.name,
                toolArgs: event.item.args,
              },
            };
            updateChatSession(chatStoreKey, {
              streamingToolCalls: list,
              executionState: "executing_tool",
              executionSteps: [...s.executionSteps, step],
            });
          } else {
            list[idx] = {
              ...list[idx],
              name: event.item.name || list[idx].name,
              args: event.item.args || list[idx].args,
            };
            updateChatSession(chatStoreKey, {
              streamingToolCalls: list,
              executionState: "executing_tool",
            });
          }
          updateAgentExecutionState(pondInstanceId, "executing_tool");
          break;
        }
        case "reasoning_delta": {
          const s = get().getChatSessionState(chatStoreKey);
          const prev = s.streamingReasoning ?? {};
          const nextReasoning = {
            ...prev,
            content: (prev.content ?? "") + event.delta,
          };
          let nextSteps = s.executionSteps;
          if (s.executionState === "idle") {
            updateAgentExecutionState(pondInstanceId, "thinking");
            nextSteps = [
              ...s.executionSteps,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                type: "thinking" as const,
                content: i18n.t("chat.thinkingContent"),
                status: "running" as const,
              },
            ];
          }
          updateChatSession(chatStoreKey, {
            streamingReasoning: nextReasoning,
            executionState: "thinking",
            executionSteps: nextSteps,
          });
          break;
        }
        case "error":
          updateChatSession(chatStoreKey, {
            error: event.message,
            executionState: "error",
            executionSteps: [
              ...get().getChatSessionState(chatStoreKey).executionSteps,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                type: "completion",
                content: i18n.t("chat.executionError"),
                status: "failed",
                metadata: { error: event.message },
              },
            ],
          });
          updateAgentExecutionState(pondInstanceId, "error");
          break;
      }
    };

    const unDelta = await listen<string>("ws-chat-delta", (ev) => {
      applyWsEventToStore({ kind: "text", delta: ev.payload });
    });
    const unTool = await listen<Record<string, string>>(
      "ws-chat-tool",
      (ev) => {
        const t = ev.payload;
        applyWsEventToStore({
          kind: "tool_call",
          phase: t.phase as "start" | "result",
          item: {
            callId: t.callId || "",
            name: t.name || "",
            args: (t.phase === "result" ? t.result : t.args) || "",
          },
        });
      },
    );
    const unReasoning = await listen<string>("ws-chat-reasoning", (ev) => {
      applyWsEventToStore({ kind: "reasoning_delta", delta: ev.payload });
    });
    const unWsErr = await listen<string>("ws-chat-error", (ev) => {
      updateChatSession(chatStoreKey, {
        error: ev.payload,
        executionState: "error",
      });
      updateAgentExecutionState(pondInstanceId, "error");
    });
    const unWsDone = await listen<string>("ws-chat-done", () => {
      updateChatSession(chatStoreKey, { executionState: "done" });
      updateAgentExecutionState(pondInstanceId, "done");
      setTimeout(
        () => refreshInstanceDisplayName(pondInstanceId).catch(() => {}),
        2000,
      );
    });
    unlistenersRef.current = [unDelta, unTool, unReasoning, unWsErr, unWsDone];

    let invokeError: string | null = null;
    try {
      await invoke("ws_chat_send", {
        port,
        agentId: agentKey,
        sessionKey,
        message: safeMessage,
        profile: wsProfile,
        tokenOverride: null,
      });
    } catch (e) {
      invokeError = e instanceof Error ? e.message : String(e);
      console.error("[ws_chat_send] error:", invokeError);
    }

    for (const unsub of unlistenersRef.current) unsub();
    unlistenersRef.current = [];

    const final = useAppStore.getState().getChatSessionState(chatStoreKey);
    const accumulated = final.streamingContent.trim();
    const finalReasoning = final.streamingReasoning;
    const finalToolCalls = [...final.streamingToolCalls];
    const hasAnyContent =
      accumulated ||
      finalToolCalls.length > 0 ||
      finalReasoning?.content ||
      finalReasoning?.summary;
    const executionTime = final.executionStartTime
      ? Date.now() - final.executionStartTime
      : undefined;
    const completedAt = new Date();

    if (invokeError) {
      updateChatSession(chatStoreKey, {
        error: invokeError,
        executionState: "error",
        streamingContent: "",
        streamingToolCalls: [],
        streamingReasoning: null,
        executionStartTime: null,
        executionSteps: [],
        sending: false,
      });
      updateAgentExecutionState(pondInstanceId, "error");
    } else if (!hasAnyContent && !final.error) {
      updateChatSession(chatStoreKey, {
        error: i18n.t("chat.noReplyContent"),
        executionState: "error",
        streamingContent: "",
        streamingToolCalls: [],
        streamingReasoning: null,
        executionStartTime: null,
        executionSteps: [],
        sending: false,
      });
      updateAgentExecutionState(pondInstanceId, "error");
    } else {
      const doneState = "done";
      updateAgentExecutionState(pondInstanceId, doneState);
      setTimeout(
        () => refreshInstanceDisplayName(pondInstanceId).catch(() => {}),
        2500,
      );

      const completionStep: ExecutionStep = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        type: "completion",
        content: i18n.t("chat.executionDone", {
          seconds: executionTime ? (executionTime / 1000).toFixed(1) : "0",
        }),
        status: "completed",
        metadata: {
          toolResult: i18n.t("chat.toolResultPreview", {
            text: `${accumulated.slice(0, 100)}${accumulated.length > 100 ? "..." : ""}`,
          }),
        },
      };
      const roundSteps = [...final.executionSteps, completionStep];
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: accumulated || (hasAnyContent ? "" : i18n.t("chat.emptyReply")),
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        reasoning: finalReasoning ?? undefined,
        executionTime,
        sentAt: completedAt.toISOString(),
        executionSteps: roundSteps,
      };
      updateChatSession(chatStoreKey, {
        messages: [...final.messages, assistantMsg],
        streamingContent: "",
        streamingToolCalls: [],
        streamingReasoning: null,
        executionState: "done",
        executionStartTime: null,
        executionSteps: [],
        sending: false,
      });

      setTimeout(() => {
        updateChatSession(chatStoreKey, { executionState: "idle" });
        updateAgentExecutionState(pondInstanceId, "idle");
      }, 3000);
    }
  }, [
    input,
    sending,
    canSend,
    chatStoreKey,
    pondInstanceId,
    effectivePort,
    updateChatSession,
    updateAgentExecutionState,
    refreshInstanceDisplayName,
    nextPondSessionKey,
  ]);

  const running = canSend;

  if (openclawConfig === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-app-muted">{t("chat.loadingConfig")}</p>
      </div>
    );
  }

  const displayName = getAgentDisplayName(pondInstanceId, displayNames);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-transparent">
      {/* Banner when not ready */}
      {!running && (
        <div className="shrink-0 px-5 pt-4 md:px-7">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-app-border border-l-4 border-l-amber-500/80 bg-amber-500/5 py-3 pl-4 pr-3 text-sm text-app-text">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              {agentGwStatus === "starting"
                ? t("chat.gatewayStarting", {
                    name: displayName,
                    role: chatRoleId,
                    port: effectivePort,
                  })
                : t("chat.gatewayStopped", {
                    name: displayName,
                    role: chatRoleId,
                  })}
            </span>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                disabled={gatewayStarting || agentGwStatus === "starting"}
                onClick={async () => {
                  setGatewayStarting(true);
                  updateChatSession(chatStoreKey, { error: null });
                  try {
                    await startAgentGateway(pondInstanceId);
                  } catch (e) {
                    updateChatSession(chatStoreKey, {
                      error:
                        i18n.t("chat.startGatewayFailed") +
                        (e instanceof Error ? e.message : String(e)),
                    });
                  } finally {
                    setGatewayStarting(false);
                  }
                }}
              >
                {gatewayStarting || agentGwStatus === "starting" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("chat.startGateway")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="shrink-0 px-5 pt-4 md:px-7">
          <div className="flex items-center gap-3 rounded-xl border border-app-border border-l-4 border-l-destructive/80 bg-destructive/5 py-3 pl-4 pr-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1 break-words">{error}</span>
          </div>
        </div>
      )}

      {/* Header: single title row; multi-role uses inline segments */}
      <div className="shrink-0 border-b border-app-border/30 bg-app-surface/40 px-4 py-1.5 backdrop-blur-xl dark:bg-app-surface/20 md:px-7">
        <div className="mx-auto max-w-3xl">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p
              className="min-w-0 flex-1 truncate text-sm font-medium text-app-text"
              title={
                multiRole
                  ? t("chat.chatTitleMultiRole", { name: displayName })
                  : undefined
              }
            >
              {t("chat.chatWith", { name: displayName })}
              {!multiRole && (
                <span className="ml-2 font-mono text-xs font-normal text-app-muted">
                  {chatRoleId}
                </span>
              )}
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
              {multiRole && (
                <div
                  className="inline-flex max-w-full flex-wrap rounded-lg border border-app-border/40 bg-app-elevated/40 p-0.5 dark:bg-app-elevated/25"
                  role="tablist"
                  aria-label={t("chat.chatRolesAria", { name: displayName })}
                >
                  {(agentsListForRoles.length > 0
                    ? agentsListForRoles
                    : [{ id: "main" } as { id: string }]
                  ).map((entry) => {
                    const id = String(entry.id);
                    const name: string = ('name' in entry && entry.name) ? String(entry.name) : id;
                    const active = id === chatRoleId;
                    const isLeader =
                      teamLeaderRoleId != null && id === TEAM_LEADER_AGENT_ID;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        disabled={sending}
                        title={
                          isLeader
                            ? t("chat.teamLeader")
                            : name
                        }
                        onClick={() => {
                          if (id === chatRoleId) return;
                          setChatRoleId(id);
                          toast.message(t("chat.switchedTo", { id: name }), {
                            duration: 2200,
                          });
                        }}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "bg-app-surface text-app-text shadow-sm ring-1 ring-app-border/60 dark:bg-dark-800"
                            : "text-app-muted hover:bg-app-hover/80 hover:text-app-text",
                          sending && "pointer-events-none opacity-50",
                        )}
                      >
                        <span className="tracking-tight">{name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        className="scroll-container flex-1 overflow-y-auto px-5 py-5 md:px-7"
      >
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 && !streamingContent ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-app-border/45 bg-app-surface/60 py-16 animate-fade-in dark:border-app-border/40 dark:bg-dark-800/40">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border bg-app-elevated/80 dark:bg-app-elevated/40",
                  running
                    ? "border-emerald-500/25 text-emerald-700 dark:border-emerald-500/35 dark:text-emerald-400"
                    : "border-app-border/60 text-app-muted",
                )}
              >
                <MessageSquare
                  className="h-5 w-5"
                  strokeWidth={1.35}
                  aria-hidden
                />
              </div>
              <p className="mt-5 text-center text-lg font-medium text-app-text">
                {running
                  ? t("chat.hintStartBelow")
                  : agentGwStatus === "starting"
                    ? t("chat.hintGatewayStarting")
                    : t("chat.hintNeedGateway")}
              </p>
              {running && multiRole && (
                <p className="mt-1.5 text-center text-sm text-app-muted">
                  {t("chat.hintOtherRoles")}
                </p>
              )}
              {!running && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  {agentGwStatus !== "starting" && (
                    <p className="text-sm text-app-muted">
                      {t("chat.hintAfterStart")}
                    </p>
                  )}
                  {agentGwStatus !== "starting" && (
                    <Button
                      className="gap-2 rounded-xl bg-claw-500 px-6 hover:bg-claw-600 text-white"
                      disabled={gatewayStarting}
                      onClick={async () => {
                        setGatewayStarting(true);
                        updateChatSession(chatStoreKey, { error: null });
                        try {
                          await startAgentGateway(pondInstanceId);
                        } catch (e) {
                          updateChatSession(chatStoreKey, {
                            error:
                              i18n.t("chat.startFailedPrefix") +
                              (e instanceof Error ? e.message : String(e)),
                          });
                        } finally {
                          setGatewayStarting(false);
                        }
                      }}
                    >
                      {gatewayStarting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {t("chat.startGatewayOnPort", { port: effectivePort })}
                    </Button>
                  )}
                  {agentGwStatus === "starting" && (
                    <Loader2 className="h-6 w-6 animate-spin text-claw-500" />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {messages
                .filter((m) => {
                  if (m.role !== "assistant") return true;
                  return !!(
                    m.content?.trim() ||
                    (m.toolCalls && m.toolCalls.length > 0) ||
                    m.reasoning?.content ||
                    m.reasoning?.summary
                  );
                })
                .map((m) => {
                  const userParsed =
                    m.role === "user"
                      ? parseUserMessageContent(m.content)
                      : null;
                  const userFriendlySource = userParsed
                    ? senderToFriendlySource(userParsed.sender)
                    : null;
                  const userTimeLabel =
                    m.role === "user"
                      ? formatMessageTime(userParsed!.timestamp, m.sentAt)
                      : "";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex items-start gap-3",
                        m.role === "user" ? "flex-row-reverse" : "flex-row",
                      )}
                    >
                      {m.role === "assistant" && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Bot className="h-4 w-4" />
                        </span>
                      )}
                      {m.role === "user" && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-elevated text-app-muted">
                          <User className="h-4 w-4" />
                        </span>
                      )}
                      <div
                        className={cn(
                          "flex flex-col gap-1 max-w-[85%]",
                          (m.role === "user" || m.role === "assistant") &&
                            "relative group pb-5",
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 text-sm shadow-sm",
                            m.role === "user"
                              ? "bg-gradient-to-br from-claw-500 to-claw-600 text-white shadow-md shadow-claw-500/15"
                              : "border border-app-border/55 bg-white/65 text-app-text shadow-sm backdrop-blur-md dark:border-app-border/45 dark:bg-dark-800/55",
                          )}
                        >
                          {m.role === "user" ? (
                            <div className="whitespace-pre-wrap break-keep">
                              {userParsed!.displayText}
                            </div>
                          ) : (
                            <>
                              {m.reasoning && (
                                <ReasoningBlock reasoning={m.reasoning} />
                              )}
                              {m.toolCalls?.map((tc) => (
                                <ToolCallBlock key={tc.callId} call={tc} />
                              ))}
                              {m.content ? (
                                <MarkdownContent content={m.content} />
                              ) : null}
                            </>
                          )}
                        </div>
                        {m.role === "user" && (
                          <div className="absolute right-0 top-full -mt-3 pt-px opacity-0 transition-opacity duration-150 group-hover:opacity-100 px-2 text-[11px] text-app-muted flex flex-nowrap items-center gap-2 w-max whitespace-nowrap">
                            <span className="flex flex-nowrap items-center gap-2">
                              {userTimeLabel && (
                                <span>{userTimeLabel}</span>
                              )}
                              {userTimeLabel && userFriendlySource && (
                                <span className="text-app-border shrink-0">
                                  ·
                                </span>
                              )}
                              {userFriendlySource && (
                                <span>
                                  {t("chat.fromSource", {
                                    source: userFriendlySource,
                                  })}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-app-muted hover:bg-app-hover hover:text-app-text"
                              onClick={(e) => {
                                e.stopPropagation();
                                const text = userParsed!.displayText;
                                navigator.clipboard
                                  .writeText(text)
                                  .then(() => toast.success(t("chat.copied")))
                                  .catch(() => toast.error(t("chat.copyFailed")));
                              }}
                              title={t("chat.copy")}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {m.role === "assistant" && (
                          <div className="absolute left-0 top-full -mt-3 pt-px opacity-0 transition-opacity duration-150 group-hover:opacity-100 px-2 text-[11px] text-app-muted flex flex-nowrap items-center gap-2 w-max whitespace-nowrap">
                            <span className="flex flex-nowrap items-center gap-2">
                              {m.sentAt && (
                                <span>
                                  {formatMessageTime(undefined, m.sentAt)}
                                </span>
                              )}
                              {m.sentAt && m.executionTime !== undefined && (
                                <span className="text-app-border shrink-0">
                                  ·
                                </span>
                              )}
                              {m.executionTime !== undefined && (
                                <span>
                                  {t("chat.executedIn", {
                                    seconds: (m.executionTime / 1000).toFixed(2),
                                  })}
                                </span>
                              )}
                              {m.executionTime !== undefined &&
                                m.toolCalls &&
                                m.toolCalls.length > 0 && (
                                  <>
                                    <span className="text-app-border shrink-0">
                                      ·
                                    </span>
                                    <span>
                                      {t("chat.toolCallsCount", {
                                        count: m.toolCalls.length,
                                      })}
                                    </span>
                                  </>
                                )}
                              {m.executionSteps &&
                                m.executionSteps.length > 0 && (
                                  <>
                                    <span className="text-app-border shrink-0">
                                      ·
                                    </span>
                                    <button
                                      type="button"
                                      className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-app-muted hover:bg-app-hover hover:text-app-text"
                                      title={t("chat.executionStepsTitle", {
                                        count: m.executionSteps.length,
                                      })}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openTimelineFrozen(m.executionSteps!);
                                      }}
                                    >
                                      <History className="h-3.5 w-3.5" />
                                      <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-app-border/60 bg-app-surface px-0.5 text-[9px] font-medium tabular-nums text-app-text">
                                        {m.executionSteps.length > 99
                                          ? "99+"
                                          : m.executionSteps.length}
                                      </span>
                                    </button>
                                  </>
                                )}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-app-muted hover:bg-app-hover hover:text-app-text"
                              onClick={(e) => {
                                e.stopPropagation();
                                const text = m.content ?? "";
                                navigator.clipboard
                                  .writeText(text)
                                  .then(() => toast.success(t("chat.copied")))
                                  .catch(() => toast.error(t("chat.copyFailed")));
                              }}
                              title={t("chat.copy")}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              {sending && (
                <div className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                  <div className="flex min-w-0 max-w-[85%] flex-col gap-2">
                    {streamingReasoning ||
                    streamingToolCalls.length > 0 ||
                    streamingContent ? (
                      <div className="rounded-2xl border border-app-border/55 bg-white/65 px-4 py-3 text-sm text-app-text shadow-sm backdrop-blur-md dark:border-app-border/45 dark:bg-dark-800/55">
                        {streamingReasoning && (
                          <ReasoningBlock
                            reasoning={streamingReasoning}
                            streaming
                          />
                        )}
                        {streamingToolCalls.map((tc) => (
                          <ToolCallBlock key={tc.callId} call={tc} />
                        ))}
                        {streamingContent ? (
                          <MarkdownContent content={streamingContent} />
                        ) : null}
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-app-muted",
                        !streamingContent &&
                          streamingToolCalls.length === 0 &&
                          !streamingReasoning &&
                          "rounded-2xl border border-dashed border-app-border/50 bg-white/40 px-3 py-2.5 dark:bg-dark-800/35",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-1.5",
                          executionState === "thinking" && "text-blue-600 dark:text-blue-400",
                          executionState === "executing_tool" &&
                            "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full animate-pulse",
                            executionState === "thinking" && "bg-blue-500",
                            executionState === "executing_tool" &&
                              "bg-amber-500",
                          )}
                        />
                        <span>
                          {executionState === "thinking" && t("chat.stateThinking")}
                          {executionState === "executing_tool" &&
                            t("chat.stateExecutingTool")}
                          {executionState === "idle" && t("chat.stateIdle")}
                        </span>
                      </div>
                      {executionStartTime && (
                        <>
                          <span className="text-app-border">·</span>
                          <span className="tabular-nums">
                            {(
                              (Date.now() - executionStartTime) /
                              1000
                            ).toFixed(1)}
                            {t("chat.seconds")}
                          </span>
                        </>
                      )}
                      {streamingToolCalls.length > 0 && (
                        <>
                          <span className="text-app-border">·</span>
                          <span>
                            {t("chat.streamingToolCalls", {
                              count: streamingToolCalls.length,
                            })}
                          </span>
                        </>
                      )}
                      {executionSteps.length > 0 && (
                        <>
                          <span className="text-app-border">·</span>
                          <button
                            type="button"
                            className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-app-muted hover:bg-app-hover hover:text-app-text"
                            title={t("chat.executionStepsTitle", {
                              count: executionSteps.length,
                            })}
                            onClick={openTimelineLive}
                          >
                            <History className="h-3.5 w-3.5" />
                            <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-app-border/60 bg-app-surface px-0.5 text-[9px] font-medium tabular-nums text-app-text">
                              {executionSteps.length > 99
                                ? "99+"
                                : executionSteps.length}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer: session switcher + input grouped */}
      <div className="shrink-0 border-t border-app-border/30 bg-app-surface/40 px-5 py-2 backdrop-blur-xl dark:bg-app-surface/20 md:px-7">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col gap-0 rounded-xl border border-app-border/55 bg-white/70 shadow-md shadow-black/[0.03] backdrop-blur-md transition-shadow focus-within:border-claw-500/40 focus-within:ring-2 focus-within:ring-claw-500/15 dark:border-app-border/45 dark:bg-dark-800/55 dark:shadow-black/20">
            {showSessionSwitcher ? (
              <div className="flex items-center gap-1.5 border-b border-app-border/40 px-2 py-1.5 dark:border-app-border/35">
                <Select
                  value={chatState.sessionKey}
                  onValueChange={(v) => {
                    setNewLocalThread(false);
                    const row = gatewaySessionsForRole.find(
                      (s) => s.sessionKey === v,
                    );
                    if (!row) return;
                    void applyGatewayRow(row)
                      .then(() => {
                        const msgs =
                          useAppStore.getState().chatByInstance[chatStoreKey]
                            ?.messages ?? [];
                        if (msgs.length === 0) {
                          toast.info(t("chat.noLocalHistory"));
                        }
                      })
                      .catch(() => {});
                  }}
                  disabled={sending || sessionsLoading || !chatState.sessionKey}
                >
                  <SelectTrigger
                    className="h-8 w-fit min-w-0 max-w-[min(100%,14rem)] shrink-0 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-app-hover focus:ring-0"
                    title={t("chat.currentSession")}
                  >
                    {transcriptLoading ? (
                      <span className="flex items-center gap-1.5 text-app-muted">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t("chat.loading")}
                      </span>
                    ) : (
                      <SelectValue placeholder={t("chat.sessionPlaceholder")}>
                        {selectedGatewayRow
                          ? channelLabel(selectedGatewayRow)
                          : chatState.sessionKey
                            ? t("chat.newSession")
                            : t("chat.session")}
                      </SelectValue>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {newLocalThread &&
                      chatState.sessionKey &&
                      !selectedGatewayRow && (
                        <SelectItem
                          value={chatState.sessionKey}
                          className="hidden"
                        >
                          —
                        </SelectItem>
                      )}
                    {gatewaySessionsForRole.map((s) => (
                      <SelectItem
                        key={s.sessionKey}
                        value={s.sessionKey}
                        className="text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              (s.channel === "feishu" || s.channel === "lark") &&
                                "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                              s.channel === "pond" &&
                                "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                              s.channel === "telegram" &&
                                "bg-sky-500/20 text-sky-600 dark:text-sky-400",
                              s.channel === "discord" &&
                                "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
                              s.channel === "webchat" &&
                                "bg-amber-500/20 text-amber-600 dark:text-amber-400",
                              ![
                                "feishu",
                                "lark",
                                "pond",
                                "telegram",
                                "discord",
                                "webchat",
                              ].includes(s.channel ?? "") &&
                                "bg-app-elevated text-app-muted",
                            )}
                          >
                            {s.channel === "feishu" || s.channel === "lark"
                              ? t("chat.sourceFeishu")
                              : s.channel === "pond"
                                ? "ClawTeam"
                                : s.channel === "telegram"
                                  ? "TG"
                                  : s.channel === "discord"
                                    ? "DC"
                                    : s.channel === "webchat"
                                      ? "Web"
                                      : (s.channel ?? "?")}
                          </span>
                          <span className="truncate">
                            {s.label || t("chat.session")}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-app-muted hover:text-app-text"
                  onClick={startNewConversation}
                  disabled={sending}
                  title={t("chat.newSessionTitle")}
                >
                  <PlusSquare className="h-4 w-4" />
                </Button>
                <span className="ml-auto hidden text-[11px] text-app-muted md:inline">
                  {t("chat.sendHint")}
                </span>
              </div>
            ) : null}
            <div
              className={cn(
                "flex gap-2 p-1.5",
                showSessionSwitcher ? "pt-1" : "pt-1.5",
              )}
            >
            <textarea
              placeholder={
                running ? t("chat.placeholderRunning") : t("chat.placeholderStopped")
              }
              title={t("chat.inputTitle")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!running || sending}
              rows={2}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              className="min-h-[52px] flex-1 resize-none rounded-lg border-0 bg-transparent px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {sending ? (
              <Button
                size="icon"
                variant="outline"
                className="h-10 w-10 shrink-0 self-end rounded-lg border-app-border text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleStop}
                title={t("chat.stopGeneration")}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-10 w-10 shrink-0 self-end rounded-lg bg-claw-500 hover:bg-claw-600 text-white"
                onClick={handleSend}
                disabled={!running || !input.trim()}
                title={t("chat.send")}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={timelineOpen}
        onOpenChange={(o) => {
          setTimelineOpen(o);
          if (!o) setTimelineLive(false);
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-1.5 px-6 pt-6 pr-14 text-left">
            <DialogTitle>{t("chat.timelineTitle")}</DialogTitle>
            <DialogDescription>{t("chat.timelineDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-2">
            <ExecutionTimeline
              embedded
              steps={dialogTimelineSteps}
              isExecuting={dialogTimelineExecuting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
