import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Droplets,
  Grid3x3,
  Hash,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Radio,
  Send,
  Shield,
  Smartphone,
  Terminal,
  Video,
  Zap,
} from "lucide-react";
import { cn } from "../lib/utils";

/** OpenClaw channel type → Lucide icon + brand tint (no emoji) */
const CHANNEL_ICON_MAP: Record<
  string,
  { Icon: LucideIcon; box: string }
> = {
  whatsapp: {
    Icon: Smartphone,
    box: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  },
  telegram: {
    Icon: Send,
    box: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  },
  discord: {
    Icon: MessagesSquare,
    box: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  },
  slack: {
    Icon: Hash,
    box: "bg-purple-500/12 text-purple-600 dark:text-purple-400",
  },
  imessage: {
    Icon: MessageSquare,
    box: "bg-green-500/12 text-green-600 dark:text-green-400",
  },
  signal: {
    Icon: Shield,
    box: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  },
  msteams: {
    Icon: Building2,
    box: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  },
  googlechat: {
    Icon: MessageCircle,
    box: "bg-emerald-600/12 text-emerald-700 dark:text-emerald-400",
  },
  mattermost: {
    Icon: Radio,
    box: "bg-red-500/12 text-red-600 dark:text-red-400",
  },
  matrix: {
    Icon: Grid3x3,
    box: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
  },
  irc: {
    Icon: Terminal,
    box: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-400",
  },
  feishu: {
    Icon: Building2,
    box: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  },
  line: {
    Icon: MessageSquare,
    box: "bg-lime-500/12 text-lime-700 dark:text-lime-400",
  },
  nostr: {
    Icon: Zap,
    box: "bg-violet-600/12 text-violet-700 dark:text-violet-400",
  },
  twitch: {
    Icon: Video,
    box: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400",
  },
  bluebubbles: {
    Icon: Droplets,
    box: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
  },
};

const FALLBACK = {
  Icon: Radio,
  box: "bg-app-elevated text-app-muted",
};

export function ChannelBrandIcon({
  typeId,
  className,
  size = "md",
}: {
  typeId: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { Icon, box } = CHANNEL_ICON_MAP[typeId] ?? FALLBACK;
  const dim =
    size === "sm"
      ? "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4"
      : size === "lg"
        ? "h-14 w-14 [&_svg]:h-7 [&_svg]:w-7"
        : "h-11 w-11 [&_svg]:h-5 [&_svg]:w-5";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        dim,
        box,
        className,
      )}
      aria-hidden
    >
      <Icon className="shrink-0" strokeWidth={1.75} />
    </span>
  );
}
