import { CHANNEL_BASE_BRANCHES, DEFAULT_BASE_BRANCH } from "./config.ts";

// Cache: channelId → { name, numMembers }
interface ChannelInfo { name: string; numMembers: number; }
const channelInfoCache = new Map<string, ChannelInfo>();

/** Resolve channel ID to channel info (name + num_members), with caching. */
async function getChannelInfo(client: any, channelId: string): Promise<ChannelInfo> {
  if (channelInfoCache.has(channelId)) return channelInfoCache.get(channelId)!;
  try {
    const info = await client.conversations.info({ channel: channelId });
    const result: ChannelInfo = {
      name: info.channel?.name ?? "",
      numMembers: info.channel?.num_members ?? 0,
    };
    channelInfoCache.set(channelId, result);
    return result;
  } catch {
    return { name: "", numMembers: 0 };
  }
}

/** Resolve channel ID to channel name, with caching. */
export async function resolveChannelName(client: any, channelId: string): Promise<string> {
  const info = await getChannelInfo(client, channelId);
  return info.name;
}

/**
 * Resolve base branch from channel context.
 * Returns short branch name (no "origin/" prefix).
 */
export async function resolveBaseBranch(client: any, channelId: string): Promise<string> {
  const channelName = await resolveChannelName(client, channelId);
  return CHANNEL_BASE_BRANCHES[channelName] ?? DEFAULT_BASE_BRANCH;
}

/**
 * Resolve quiet mode.
 * - explicitQuiet=true/false → honor user keyword
 * - explicitQuiet=null → auto-detect: channels with >10 members default to quiet
 */
export async function resolveQuietMode(
  client: any, channelId: string, explicitQuiet: boolean | null
): Promise<boolean> {
  if (explicitQuiet !== null) return explicitQuiet;
  const info = await getChannelInfo(client, channelId);
  return info.numMembers > 10;
}

/** Convert short branch name to git ref. */
export function toTargetRef(branch: string): string {
  return `origin/${branch}`;
}
