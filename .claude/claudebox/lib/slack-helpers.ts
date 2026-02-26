import type { SessionMeta } from "./types.ts";
import { SLACK_BOT_TOKEN } from "./config.ts";
import type { SessionStore } from "./session-store.ts";
import type { DockerService } from "./docker.ts";
import { truncate, cancelUrl, hashFromLogUrl, extractHashFromUrl, sessionUrl } from "./util.ts";
import { toTargetRef } from "./base-branch.ts";

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
    console.warn(`[WARN] Could not fetch thread context: ${e}`);
    return "";
  }
}

export async function updateSlackStatus(channel: string, messageTs: string, status: string, logUrl: string, hash?: string): Promise<void> {
  let currentText = "";
  try {
    const r = await fetch(`https://slack.com/api/conversations.history?channel=${channel}&oldest=${messageTs}&latest=${messageTs}&inclusive=true&limit=1`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json() as any;
    if (d.ok && d.messages?.[0]?.text) currentText = d.messages[0].text;
  } catch (e) {
    console.warn(`[WARN] Failed to read current Slack message for status update: ${e}`);
  }

  let finalText: string;
  if (currentText) {
    let lines = currentText.split("\n");
    // Strip cancel link (session is done) and trailing ellipsis
    lines[0] = lines[0].replace(/<[^>]*\|cancel>/g, "").trim();
    lines[0] = lines[0].replace(/\.\.\.\s*$/, "").trim();
    lines[0] += ` \u2014 *${status}*`;
    if (!currentText.includes(logUrl)) lines[0] += ` <${logUrl}|log>`;
    // Preserve or add terminal link (session is now joinable)
    if (hash && !currentText.includes("|terminal>")) {
      lines[0] += ` <${sessionUrl(hash)}|terminal>`;
    }
    finalText = lines.join("\n");
  } else {
    finalText = `ClaudeBox ${status} <${logUrl}|log>`;
    if (hash) finalText += ` <${sessionUrl(hash)}|terminal>`;
  }

  await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ts: messageTs, text: finalText }),
  });
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

  const url = sessionUrl(hash);
  const statusEmoji = session.status === "completed" && session.exit_code === 0 ? ":white_check_mark:" : ":warning:";
  await respond({
    text: `${statusEmoji} <${url}|Join interactive session>\nSession \`${hash.slice(0, 8)}...\` \u2014 ${session.status}${session.exit_code != null ? ` (exit ${session.exit_code})` : ""}`,
    thread_ts: threadTs,
  });
  return true;
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
) {
  let status = prompt ? `ClaudeBox: _${truncate(prompt)}_ ...` : "ClaudeBox starting...";
  try {
    const postArgs: any = { channel, text: status };
    if (threadTs) postArgs.thread_ts = threadTs;
    const result = await client.chat.postMessage(postArgs);
    const messageTs = result.ts;
    if (!threadTs) threadTs = messageTs;

    let fullPrompt = "";
    if (threadContext) fullPrompt += `Slack thread context:\n${threadContext}\n\n`;
    if (prompt) fullPrompt += prompt;

    let capturedLogUrl = "";
    let capturedHash = "";

    docker.runContainerSession({
      prompt: fullPrompt,
      userName,
      slackChannel: channel,
      slackThreadTs: threadTs!,
      slackMessageTs: messageTs,
      targetRef: toTargetRef(baseBranch),
      quiet,
    }, store, undefined, (logUrl) => {
      capturedLogUrl = logUrl;
      capturedHash = hashFromLogUrl(logUrl);
      const text = prompt
        ? `ClaudeBox: _${truncate(prompt)}_ <${logUrl}|log> <${sessionUrl(capturedHash)}|terminal> <${cancelUrl(capturedHash)}|cancel>`
        : `ClaudeBox starting... <${logUrl}|log> <${sessionUrl(capturedHash)}|terminal> <${cancelUrl(capturedHash)}|cancel>`;
      client.chat.update({ channel, ts: messageTs, text }).catch(() => {});
    }).then((exitCode) => {
      if (SLACK_BOT_TOKEN && messageTs && capturedLogUrl) {
        const statusSuffix = exitCode === 0 ? "completed" : `error (exit ${exitCode})`;
        updateSlackStatus(channel, messageTs, statusSuffix, capturedLogUrl, capturedHash)
          .catch((e) => console.warn(`[WARN] Slack status update failed: ${e}`));
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
) {
  const worktreeId = session.worktree_id;

  let status = "ClaudeBox running, treating your message as a reply";
  if (message) status += `: _${truncate(message)}_`;
  status += " ...";

  try {
    const postArgs: any = { channel, text: status };
    if (threadTs) postArgs.thread_ts = threadTs;
    const result = await client.chat.postMessage(postArgs);
    const messageTs = result.ts;

    let capturedLogUrl = "";
    let capturedHash = "";

    docker.runContainerSession({
      prompt: message,
      userName,
      slackChannel: channel,
      slackThreadTs: threadTs!,
      slackMessageTs: messageTs,
      worktreeId,
      targetRef: toTargetRef(baseBranch),
      quiet,
    }, store, undefined, (logUrl) => {
      capturedLogUrl = logUrl;
      capturedHash = hashFromLogUrl(logUrl);
      let text = "ClaudeBox replying";
      if (message) text += `: _${truncate(message)}_`;
      text += ` <${logUrl}|log> <${sessionUrl(capturedHash)}|terminal> <${cancelUrl(capturedHash)}|cancel>`;
      client.chat.update({ channel, ts: messageTs, text }).catch(() => {});
    }).then((exitCode) => {
      if (SLACK_BOT_TOKEN && messageTs && capturedLogUrl) {
        const statusSuffix = exitCode === 0 ? "completed" : `error (exit ${exitCode})`;
        updateSlackStatus(channel, messageTs, statusSuffix, capturedLogUrl, capturedHash)
          .catch((e) => console.warn(`[WARN] Slack status update failed: ${e}`));
      }
    });
  } catch (e) {
    console.error(`[ERROR] Failed to post reply status: ${e}`);
  }
}
