import type { SessionMeta } from "./types.ts";
import { SLACK_BOT_TOKEN } from "./config.ts";
import type { SessionStore } from "./session-store.ts";
import type { DockerService } from "./docker.ts";
import { truncate, extractHashFromUrl, sessionUrl } from "./util.ts";
import { toTargetRef } from "./base-branch.ts";

/**
 * Convert Markdown-style links and bare URLs to Slack mrkdwn format.
 * Handles: `[text](url)` → `<url|text>`, bare `https://...` → `<url>`
 */
export function markdownToSlack(text: string): string {
  // Convert Markdown links [text](url) → <url|text>
  let result = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");
  // Wrap remaining bare URLs that aren't already inside <...>
  result = result.replace(/(?<![<|])(https?:\/\/[^\s>]+)/g, "<$1>");
  return result;
}

export function resolveUserName(client: any, userId: string): Promise<string> {
  return client.users
    .info({ user: userId })
    .then((r: any) => r.user?.real_name ?? userId)
    .catch(() => userId);
}

export async function getThreadContext(client: any, channel: string, threadTs: string): Promise<string> {
  if (!threadTs) return "";
  try {
    const result = await client.conversations.replies({ channel, ts: threadTs, limit: 50 });
    const msgs = result.messages ?? [];
    const cache: Record<string, string> = {};
    const lines: string[] = [];
    for (const msg of msgs) {
      const uid = msg.user ?? "unknown";
      if (!cache[uid]) cache[uid] = await resolveUserName(client, uid);
      const text = (msg.text ?? "").replace(/<@[A-Z0-9]+>/g, "").trim();
      if (text) lines.push(`${cache[uid]}: ${text}`);
    }
    return lines.join("\n");
  } catch (e) {
    const detail = (e as any)?.data?.needed ? ` (need scope: ${(e as any).data.needed})` : "";
    console.warn(`[WARN] Could not fetch thread context for ${channel}: ${e}${detail}`);
    return "";
  }
}

/** Build final Slack message from activity log — the single source of truth. */
export function buildSlackStatusFromActivity(
  activity: { ts: string; type: string; text: string }[],
  prompt: string,
  status: string,
  logUrl: string,
  worktreeId?: string,
): string {
  const parts: string[] = [];

  // Only show the LAST response (not every intermediate respond_to_user call)
  const responses = activity.filter(a => a.type === "response");
  if (responses.length > 0) {
    const last = responses[responses.length - 1];
    let text = last.text.length > 600 ? last.text.slice(0, 600) + "\u2026" : last.text;
    parts.push(markdownToSlack(text));
  }

  // Artifacts (PRs, gists) — compact, deduplicated, short labels
  const artifacts = activity.filter(a => a.type === "artifact");
  const seenUrls = new Set<string>();
  const linkParts: string[] = [];
  for (const a of artifacts) {
    // Extract URL from the artifact text
    const urlMatch = a.text.match(/(https?:\/\/[^\s)>\]]+)/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    // PR: #NNN
    const prMatch = url.match(/\/pull\/(\d+)/);
    if (prMatch) { linkParts.push(`<${url}|#${prMatch[1]}>`); continue; }

    // Gist: short label
    if (url.includes("gist.github")) { linkParts.push(`<${url}|gist>`); continue; }

    // Issue: #NNN
    const issueMatch = url.match(/\/issues\/(\d+)/);
    if (issueMatch) { linkParts.push(`<${url}|#${issueMatch[1]}>`); continue; }

    // Other: short domain label
    linkParts.push(`<${url}|link>`);
  }

  // Footer: artifacts + status link + status
  const footer: string[] = [];
  if (linkParts.length) footer.push(linkParts.join(" \u2022 "));
  if (worktreeId) footer.push(`<${sessionUrl(worktreeId)}|status>`);
  footer.push(`_${status}_`);
  parts.push(footer.join("  \u2502  "));

  return parts.join("\n");
}

/** Add or swap a Slack reaction on a message. */
async function setReaction(channel: string, ts: string, emoji: string, removeEmoji?: string): Promise<void> {
  if (!SLACK_BOT_TOKEN) return;
  const headers = { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" };
  if (removeEmoji) {
    await fetch("https://slack.com/api/reactions.remove", {
      method: "POST", headers, body: JSON.stringify({ channel, timestamp: ts, name: removeEmoji }),
    }).catch(() => {});
  }
  await fetch("https://slack.com/api/reactions.add", {
    method: "POST", headers, body: JSON.stringify({ channel, timestamp: ts, name: emoji }),
  }).catch(() => {});
}

export async function updateSlackStatus(
  channel: string, messageTs: string, status: string, logUrl: string,
  worktreeId: string | undefined, store: SessionStore, prompt: string,
): Promise<void> {
  // Build from activity log — never read back from Slack
  const activity = worktreeId ? store.readActivity(worktreeId).reverse() : []; // oldest first

  // Auto-set workspace name from Claude's set_workspace_name tool
  if (worktreeId) {
    const nameEntry = activity.find(a => a.type === "name");
    if (nameEntry?.text) {
      const meta = store.getWorktreeMeta(worktreeId);
      if (!meta.name) store.setWorktreeName(worktreeId, nameEntry.text);
    }
  }

  const text = buildSlackStatusFromActivity(activity, prompt, status, logUrl, worktreeId);

  await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ts: messageTs, text }),
  });

  // Swap reaction: running → done
  const isSuccess = status.startsWith("completed");
  const emoji = isSuccess ? "white_check_mark" : "warning";
  await setReaction(channel, messageTs, emoji, "hourglass_flowing_sand");
}

export async function handleTerminalCommand(
  cmd: string, channel: string, threadTs: string, isReply: boolean,
  respond: (msg: any) => Promise<any>,
  store: SessionStore,
): Promise<boolean> {
  const m = cmd.match(/^terminal(?:\s+(.+))?$/i);
  if (!m) return false;

  const arg = (m[1] || "").trim();
  let hash: string | null = null;
  let session: SessionMeta | null = null;

  if (arg) {
    const urlHash = extractHashFromUrl(arg);
    if (urlHash) {
      hash = urlHash;
    } else if (/^[a-f0-9]{32}$/.test(arg)) {
      hash = arg;
    }
    if (hash) session = store.findByHash(hash);
  }

  if (!session && isReply) {
    session = store.findLastInThread(channel, threadTs);
    if (session) hash = session._log_id || null;
  }

  if (!session || !hash) {
    await respond({ text: "No session found. Usage: `terminal` (in thread) or `terminal <hash>`", thread_ts: threadTs });
    return true;
  }

  const wtId = session.worktree_id || hash;
  const url = sessionUrl(wtId);
  const statusEmoji = session.status === "completed" && session.exit_code === 0 ? ":white_check_mark:" : ":warning:";
  await respond({
    text: `${statusEmoji} <${url}|Join interactive session>\nWorkspace \`${wtId.slice(0, 8)}\` \u2014 ${session.status}${session.exit_code != null ? ` (exit ${session.exit_code})` : ""}`,
    thread_ts: threadTs,
  });
  return true;
}

/** Drain queued Slack messages for a worktree and auto-resume if any exist. */
function drainQueueAndResume(
  client: any, channel: string, threadTs: string | null,
  worktreeId: string, store: SessionStore, docker: DockerService,
  baseBranch: string, channelName: string, profile: string,
): void {
  try {
    const session = store.findByWorktreeId(worktreeId);
    if (!session?._log_id) return;
    const queued = store.drainQueue(session._log_id);
    if (!queued.length) return;

    const combined = queued.map(q => `[${q.user}]: ${q.text}`).join("\n\n");
    console.log(`[QUEUE] Draining ${queued.length} queued message(s) for worktree ${worktreeId}`);

    startReplySession(
      client, channel, threadTs, combined, session,
      queued[0].user, store, docker, baseBranch, false, channelName, false, profile,
    );
  } catch (e: any) {
    console.error(`[QUEUE] Failed to drain queue for ${worktreeId}: ${e.message}`);
  }
}

export async function startNewSession(
  client: any,
  channel: string,
  threadTs: string | null,
  prompt: string,
  threadContext: string,
  userName: string,
  store: SessionStore,
  docker: DockerService,
  baseBranch = "next",
  quiet = false,
  channelName = "",
  ciAllow = false,
  profile = "",
) {
  let status = "ClaudeBox starting\u2026";
  try {
    const postArgs: any = { channel, text: status };
    if (threadTs) postArgs.thread_ts = threadTs;
    const result = await client.chat.postMessage(postArgs);
    const messageTs = result.ts;
    if (!threadTs) threadTs = messageTs;

    // Add running reaction
    setReaction(channel, messageTs, "hourglass_flowing_sand");

    let fullPrompt = "";
    if (prompt) fullPrompt += prompt;
    if (threadContext) fullPrompt += `\n\nSlack thread context (recent):\n${threadContext}`;

    let capturedLogUrl = "";
    let capturedWorktreeId = "";

    docker.runContainerSession({
      prompt: fullPrompt,
      userName,
      slackChannel: channel,
      slackChannelName: channelName,
      slackThreadTs: threadTs!,
      slackMessageTs: messageTs,
      targetRef: toTargetRef(baseBranch),
      quiet,
      ciAllow,
      profile: profile || undefined,
    }, store, undefined, (logUrl, worktreeId) => {
      capturedLogUrl = logUrl;
      capturedWorktreeId = worktreeId;
      if (threadTs) store.bindThread(channel, threadTs, worktreeId);
      client.chat.update({ channel, ts: messageTs, text: `_working\u2026_ <${sessionUrl(worktreeId)}|status>` }).catch(() => {});
    }).then((exitCode) => {
      if (SLACK_BOT_TOKEN && messageTs && capturedLogUrl) {
        const statusSuffix = exitCode === 0 ? "completed" : `error (exit ${exitCode})`;
        updateSlackStatus(channel, messageTs, statusSuffix, capturedLogUrl, capturedWorktreeId, store, prompt)
          .catch((e) => console.warn(`[WARN] Slack status update failed: ${e}`));
      }
      if (capturedWorktreeId) {
        drainQueueAndResume(client, channel, threadTs, capturedWorktreeId, store, docker, baseBranch, channelName, profile);
      }
    });
  } catch (e) {
    console.error(`[ERROR] Failed to post status: ${e}`);
  }
}

export async function startReplySession(
  client: any,
  channel: string,
  threadTs: string | null,
  message: string,
  session: SessionMeta,
  userName: string,
  store: SessionStore,
  docker: DockerService,
  baseBranch = "next",
  quiet = false,
  channelName = "",
  ciAllow = false,
  profile = "",
) {
  const worktreeId = session.worktree_id;
  if (threadTs && worktreeId) store.bindThread(channel, threadTs, worktreeId);

  // Fetch thread context so the agent understands the conversation
  const threadContext = threadTs ? await getThreadContext(client, channel, threadTs) : "";

  try {
    const postArgs: any = { channel, text: "ClaudeBox replying\u2026" };
    if (threadTs) postArgs.thread_ts = threadTs;
    const result = await client.chat.postMessage(postArgs);
    const messageTs = result.ts;

    // Add running reaction
    setReaction(channel, messageTs, "hourglass_flowing_sand");

    let fullPrompt = "";
    if (message) fullPrompt += message;
    if (threadContext) fullPrompt += `\n\nSlack thread context (recent):\n${threadContext}`;

    let capturedLogUrl = "";
    let capturedWorktreeId = "";

    docker.runContainerSession({
      prompt: fullPrompt || message,
      userName,
      slackChannel: channel,
      slackChannelName: channelName,
      slackThreadTs: threadTs!,
      slackMessageTs: messageTs,
      worktreeId,
      targetRef: toTargetRef(baseBranch),
      quiet,
      ciAllow,
      profile: profile || undefined,
    }, store, undefined, (logUrl, wtId) => {
      capturedLogUrl = logUrl;
      capturedWorktreeId = wtId;
      client.chat.update({ channel, ts: messageTs, text: `_working\u2026_ <${sessionUrl(wtId)}|status>` }).catch(() => {});
    }).then((exitCode) => {
      if (SLACK_BOT_TOKEN && messageTs && capturedLogUrl) {
        const statusSuffix = exitCode === 0 ? "completed" : `error (exit ${exitCode})`;
        updateSlackStatus(channel, messageTs, statusSuffix, capturedLogUrl, capturedWorktreeId, store, message)
          .catch((e) => console.warn(`[WARN] Slack status update failed: ${e}`));
      }
      if (capturedWorktreeId) {
        drainQueueAndResume(client, channel, threadTs, capturedWorktreeId, store, docker, baseBranch, channelName, profile);
      }
    });
  } catch (e) {
    console.error(`[ERROR] Failed to post reply status: ${e}`);
  }
}
