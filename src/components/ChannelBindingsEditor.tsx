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
import type { BindingConfig } from "../types";
import { OPENCLAW_CHANNEL_TYPES } from "../constants/openclawChannels";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";

function emptyBinding(agentFallback: string): BindingConfig {
  return {
    agentId: agentFallback,
    match: { channel: OPENCLAW_CHANNEL_TYPES[0]?.id ?? "whatsapp" },
  };
}

export function normalizeBindingsFromConfig(raw: unknown): BindingConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: BindingConfig[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const agentId = typeof o.agentId === "string" ? o.agentId.trim() : "";
    const m = o.match;
    if (!m || typeof m !== "object") continue;
    const match = m as Record<string, unknown>;
    const channel =
      typeof match.channel === "string" ? match.channel.trim() : "";
    const accountId =
      typeof match.accountId === "string" ? match.accountId.trim() : "";
    const peer = match.peer;
    let peerKind: "direct" | "group" | "channel" | "" = "";
    let peerId = "";
    if (peer && typeof peer === "object") {
      const p = peer as Record<string, unknown>;
      const k = p.kind;
      if (k === "direct" || k === "group" || k === "channel") peerKind = k;
      peerId = typeof p.id === "string" ? p.id.trim() : "";
    }
    const guildId =
      typeof match.guildId === "string" ? match.guildId.trim() : "";
    const teamId = typeof match.teamId === "string" ? match.teamId.trim() : "";
    if (!agentId || !channel) continue;
    const b: BindingConfig = {
      agentId,
      match: { channel },
    };
    if (accountId) b.match.accountId = accountId;
    if (peerKind && peerId) b.match.peer = { kind: peerKind, id: peerId };
    if (guildId) b.match.guildId = guildId;
    if (teamId) b.match.teamId = teamId;
    out.push(b);
  }
  return out;
}

function bindingToJson(b: BindingConfig): BindingConfig {
  const m = { ...b.match };
  if (!m.peer?.id || !m.peer?.kind) delete m.peer;
  if (!m.accountId?.trim()) delete m.accountId;
  if (!m.guildId?.trim()) delete m.guildId;
  if (!m.teamId?.trim()) delete m.teamId;
  return { agentId: b.agentId.trim(), match: m };
}

export function serializeBindings(rows: BindingConfig[]): BindingConfig[] {
  return rows
    .filter((r) => r.agentId.trim() && r.match.channel?.trim())
    .map(bindingToJson);
}

type Props = {
  agentIds: string[];
  bindings: BindingConfig[];
  onChange: (next: BindingConfig[]) => void;
  disabled?: boolean;
};

export function ChannelBindingsEditor({
  agentIds,
  bindings,
  onChange,
  disabled,
}: Props) {
  const agentFallback = agentIds[0] ?? "main";

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= bindings.length) return;
    const next = bindings.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const update = (i: number, patch: Partial<BindingConfig>) => {
    const next = bindings.map((r, idx) => {
      if (idx !== i) return r;
      const merged = { ...r, ...patch };
      if (patch.match)
        merged.match = { ...r.match, ...patch.match };
      return merged;
    });
    onChange(next);
  };

  const updatePeer = (
    i: number,
    kind: "" | "direct" | "group" | "channel",
    id: string,
  ) => {
    const r = bindings[i];
    const match = { ...r.match };
    if (!kind || !id.trim()) delete match.peer;
    else match.peer = { kind, id: id.trim() };
    onChange(
      bindings.map((row, idx) => (idx === i ? { ...row, match } : row)),
    );
  };

  return (
    <div className="space-y-3 rounded-2xl border border-app-border/50 bg-app-elevated/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-medium text-app-text">路由规则</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-8 border-app-border text-app-text"
          onClick={() =>
            onChange([...bindings, emptyBinding(agentFallback)])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          添加
        </Button>
      </div>
      {bindings.length === 0 ? null : (
        <ul className="space-y-3">
          {bindings.map((row, i) => (
            <li
              key={i}
              className={cn(
                "rounded-xl border border-app-border/40 bg-app-surface/80 p-3",
                disabled && "opacity-60",
              )}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
                <div className="space-y-1.5 lg:col-span-1">
                  <Label className="text-xs text-app-muted">角色</Label>
                  {agentIds.length > 0 ? (
                    <Select
                      value={row.agentId}
                      onValueChange={(v) => update(i, { agentId: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-9 border-app-border bg-app-surface text-app-text">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-app-border bg-app-surface">
                        {agentIds.map((id) => (
                          <SelectItem key={id} value={id}>
                            {id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={row.agentId}
                      onChange={(e) => update(i, { agentId: e.target.value })}
                      disabled={disabled}
                      className="h-9 border-app-border bg-app-surface"
                      placeholder="agentId"
                    />
                  )}
                </div>
                <div className="space-y-1.5 lg:col-span-1">
                  <Label className="text-xs text-app-muted">渠道</Label>
                  <Select
                    value={row.match.channel ?? ""}
                    onValueChange={(v) =>
                      update(i, { match: { ...row.match, channel: v } })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-9 border-app-border bg-app-surface text-app-text">
                      <SelectValue placeholder="选择" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 border-app-border bg-app-surface">
                      {OPENCLAW_CHANNEL_TYPES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 lg:col-span-1">
                  <Label className="text-xs text-app-muted">账户 ID</Label>
                  <Input
                    value={row.match.accountId ?? ""}
                    onChange={(e) =>
                      update(i, {
                        match: {
                          ...row.match,
                          accountId: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    className="h-9 border-app-border bg-app-surface"
                    placeholder="可选"
                  />
                </div>
                <div className="space-y-1.5 lg:col-span-1">
                  <Label className="text-xs text-app-muted">会话类型</Label>
                  <Select
                    value={row.match.peer?.kind ?? "_any"}
                    onValueChange={(v) =>
                      updatePeer(
                        i,
                        v === "_any"
                          ? ""
                          : (v as "direct" | "group" | "channel"),
                        row.match.peer?.id ?? "",
                      )
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-9 border-app-border bg-app-surface text-app-text">
                      <SelectValue placeholder="不限" />
                    </SelectTrigger>
                    <SelectContent className="border-app-border bg-app-surface">
                      <SelectItem value="_any">不限</SelectItem>
                      <SelectItem value="direct">私聊</SelectItem>
                      <SelectItem value="group">群组</SelectItem>
                      <SelectItem value="channel">频道</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 lg:col-span-1">
                  <Label className="text-xs text-app-muted">会话 ID</Label>
                  <Input
                    value={row.match.peer?.id ?? ""}
                    onChange={(e) =>
                      updatePeer(
                        i,
                        row.match.peer?.kind ?? "",
                        e.target.value,
                      )
                    }
                    disabled={disabled}
                    className="h-9 border-app-border bg-app-surface"
                    placeholder="可选"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1 lg:col-span-1 lg:justify-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-app-muted"
                    disabled={disabled || i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="上移"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-app-muted"
                    disabled={disabled || i >= bindings.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="下移"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    disabled={disabled}
                    onClick={() =>
                      onChange(bindings.filter((_, j) => j !== i))
                    }
                    aria-label="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-app-muted">Discord guildId</Label>
                  <Input
                    value={row.match.guildId ?? ""}
                    onChange={(e) =>
                      update(i, {
                        match: { ...row.match, guildId: e.target.value },
                      })
                    }
                    disabled={disabled}
                    className="h-9 border-app-border bg-app-surface"
                    placeholder="可选"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-app-muted">Slack teamId</Label>
                  <Input
                    value={row.match.teamId ?? ""}
                    onChange={(e) =>
                      update(i, {
                        match: { ...row.match, teamId: e.target.value },
                      })
                    }
                    disabled={disabled}
                    className="h-9 border-app-border bg-app-surface"
                    placeholder="可选"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
