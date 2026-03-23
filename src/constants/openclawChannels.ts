/** Official channel type ids for channels.<id>; matches `openclaw channels add --channel` */
export const OPENCLAW_CHANNEL_TYPES = [
  { id: "whatsapp", name: "WhatsApp" },
  { id: "telegram", name: "Telegram" },
  { id: "discord", name: "Discord" },
  { id: "slack", name: "Slack" },
  { id: "imessage", name: "iMessage" },
  { id: "signal", name: "Signal" },
  { id: "msteams", name: "MS Teams" },
  { id: "googlechat", name: "Google Chat" },
  { id: "mattermost", name: "Mattermost" },
  { id: "matrix", name: "Matrix" },
  { id: "irc", name: "IRC" },
  { id: "feishu", name: "飞书" },
  { id: "line", name: "LINE" },
  { id: "nostr", name: "Nostr" },
  { id: "twitch", name: "Twitch" },
  { id: "bluebubbles", name: "BlueBubbles" },
] as const;

export type OpenClawChannelTypeId = (typeof OPENCLAW_CHANNEL_TYPES)[number]["id"];

export const OPENCLAW_CHANNEL_ID_SET = new Set<string>(
  OPENCLAW_CHANNEL_TYPES.map((c) => c.id),
);
