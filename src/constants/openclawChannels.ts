/** Official channel type ids for channels.<id>; matches `openclaw channels add --channel` */
export const OPENCLAW_CHANNEL_TYPES = [
  { id: "whatsapp" },
  { id: "telegram" },
  { id: "discord" },
  { id: "slack" },
  { id: "imessage" },
  { id: "signal" },
  { id: "msteams" },
  { id: "googlechat" },
  { id: "mattermost" },
  { id: "matrix" },
  { id: "irc" },
  { id: "feishu" },
  { id: "line" },
  { id: "nostr" },
  { id: "twitch" },
  { id: "bluebubbles" },
] as const

export type OpenClawChannelTypeId = (typeof OPENCLAW_CHANNEL_TYPES)[number]["id"]

export const OPENCLAW_CHANNEL_ID_SET = new Set<string>(
  OPENCLAW_CHANNEL_TYPES.map((c) => c.id),
)
