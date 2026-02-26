import { CHANNEL_BASE_BRANCHES, DEFAULT_BASE_BRANCH } from "./config.ts";

// Cache: channelId → channelName (resolved via Slack API)
const channelNameCache = new Map<string, string>();

/** Resolve channel ID to channel name, with caching. */
export async function resolveChannelName(client: any, channelId: string): Promise<string> {
  if (channelNameCache.has(channelId)) return channelNameCache.get(channelId)!;
  try {
    const info = await client.conversations.info({ channel: channelId });
    const name = info.channel?.name ?? "";
    channelNameCache.set(channelId, name);
    return name;
  } catch {
    return "";
  }
}

/**
 * Resolve base branch from channel context.
 * Returns short branch name (no "origin/" prefix).
 */
export async function resolveBaseBranch(client: any, channelId: string): Promise<string> {
  const channelName = await resolveChannelName(client, channelId);
  return CHANNEL_BASE_BRANCHES[channelName] ?? DEFAULT_BASE_BRANCH;
}

/** Convert short branch name to git ref. */
export function toTargetRef(branch: string): string {
  return `origin/${branch}`;
}
