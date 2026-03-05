import type { App } from "@slack/bolt";
import type { SessionStore } from "./session-store.ts";
import type { DockerService } from "./docker.ts";
import { MAX_CONCURRENT, getActiveSessions } from "./config.ts";
import { parseMessage, parseKeywords, validateResumeSession, truncate, extractHashFromUrl, sessionUrl } from "./util.ts";
import {
  resolveUserName, getThreadContext, handleTerminalCommand,
  startNewSession, startReplySession,
} from "./slack-helpers.ts";
import { resolveBaseBranch, resolveQuietMode, resolveChannelName } from "./base-branch.ts";

/** Normalized incoming Slack message — unifies app_mention, DM, and slash command. */
interface IncomingMessage {
  channel: string;
  text: string;
  isReply: boolean;
  threadTs: string;
  userId: string;
  respond: (msg: any) => Promise<any>;
  client: any;
}

/** Core handler shared by all 3 Slack entry points. */
async function handleIncomingMessage(msg: IncomingMessage, store: SessionStore, docker: DockerService): Promise<void> {
  const cmd = msg.text.trim();
  if (!cmd) {
    await msg.respond({ text: "Usage: `@ClaudeBox <prompt>`", thread_ts: msg.threadTs });
    return;
  }

  // Terminal command
  if (await handleTerminalCommand(cmd, msg.channel, msg.threadTs, msg.isReply, msg.respond, store)) return;

  // Capacity check
  if (getActiveSessions() >= MAX_CONCURRENT) {
    await msg.respond({ text: `ClaudeBox is at capacity (${MAX_CONCURRENT} sessions). Try again later.`, thread_ts: msg.threadTs });
    return;
  }

  const userName = await resolveUserName(msg.client, msg.userId);
  const baseBranch = await resolveBaseBranch(msg.client, msg.channel);
  const channelName = await resolveChannelName(msg.client, msg.channel);
  const parsed = parseMessage(cmd, (h) => store.findByHash(h));

  // Explicit hash-based resume — only if hash matches a known session
  if (parsed.type === "reply-hash") {
    const session = store.findByHash(parsed.hash);
    if (session) {
      const err = validateResumeSession(session, parsed.hash);
      if (err) { await msg.respond({ text: err, thread_ts: msg.threadTs }); return; }
      console.log(`[HANDLER] Resuming session ${parsed.hash}`);
      const quiet = await resolveQuietMode(msg.client, msg.channel, null);
      await startReplySession(msg.client, msg.channel, msg.threadTs, parsed.prompt, session, userName, store, docker, baseBranch, quiet, channelName, false, session.profile || "");
      return;
    }
    // Hash not a session (e.g. CI log URL) — fall through, use full text as prompt
    console.log(`[HANDLER] Hash ${parsed.hash} is not a session, treating as prompt`);
  }

  // Implicit resume: thread reply with a previous session
  if (msg.isReply) {
    const prevSession = store.findLastInThread(msg.channel, msg.threadTs);
    if (prevSession?.status === "running" && prevSession._log_id) {
      store.queueMessage(prevSession._log_id, { text: cmd, user: userName, ts: new Date().toISOString() });
      await msg.respond({ text: `:hourglass: Queued \u2014 your message will be sent when the current session finishes.`, thread_ts: msg.threadTs });
      return;
    }
    if (prevSession?.worktree_id) {
      console.log(`[HANDLER] Resuming worktree ${prevSession.worktree_id} from thread`);
      const quiet = await resolveQuietMode(msg.client, msg.channel, null);
      await startReplySession(msg.client, msg.channel, msg.threadTs, cmd, prevSession, userName, store, docker, baseBranch, quiet, channelName, false, prevSession.profile || "");
      return;
    }
  }

  // New session — parse keywords (new-session, quiet, ci-allow, profile) only here
  const { forceNew, quiet: explicitQuiet, ciAllow, profile, prompt: effectivePrompt } = parseKeywords(parsed);
  const quiet = await resolveQuietMode(msg.client, msg.channel, explicitQuiet);
  const prompt = (parsed.type === "reply-hash" && !store.findByHash(parsed.hash)) ? cmd : effectivePrompt;

  // new-session in a thread: break the thread → worktree binding
  if (forceNew && msg.isReply) {
    store.clearThreadBinding(msg.channel, msg.threadTs);
  }

  const threadContext = msg.isReply ? await getThreadContext(msg.client, msg.channel, msg.threadTs) : "";
  await startNewSession(msg.client, msg.channel, msg.threadTs, prompt, threadContext, userName, store, docker, baseBranch, quiet, channelName, ciAllow, profile);
}

/** Register all Slack event handlers on the Bolt app. */
export function registerSlackHandlers(app: App, store: SessionStore, docker: DockerService): void {

  // ── @mention in channels ──────────────────────────────────────
  app.event("app_mention", async ({ event, client, say }) => {
    const channel = event.channel;
    const text = event.text ?? "";
    const isReply = !!(event as any).thread_ts;
    const threadTs = (event as any).thread_ts ?? event.ts;

    console.log(`[MENTION] channel=${channel} isReply=${isReply} text=${text.slice(0, 100)}`);

    const cmd = text.replace(/<@[A-Z0-9]+>\s*/g, "").trim();
    await handleIncomingMessage({
      channel, text: cmd, isReply, threadTs,
      userId: event.user ?? "",
      respond: (msg) => say({ ...msg, thread_ts: msg.thread_ts || threadTs }) as any,
      client,
    }, store, docker);
  });

  // ── Direct messages ───────────────────────────────────────────
  app.event("message", async ({ event, client, say }) => {
    const channelType = (event as any).channel_type;
    if (channelType !== "im" && channelType !== "mpim") return;
    if ((event as any).bot_id || (event as any).subtype) return;

    const channel = event.channel;
    const text = (event as any).text ?? "";
    const isReply = !!(event as any).thread_ts;
    const threadTs = (event as any).thread_ts ?? (event as any).ts;

    console.log(`[DM] channel=${channel} isReply=${isReply} text=${text.slice(0, 100)}`);

    await handleIncomingMessage({
      channel, text: text.trim(), isReply, threadTs,
      userId: (event as any).user ?? "",
      respond: (msg) => say({ ...msg, thread_ts: msg.thread_ts || threadTs }) as any,
      client,
    }, store, docker);
  });

  // ── /claudebox slash command ──────────────────────────────────
  app.command("/claudebox", async ({ ack, command, client }) => {
    const text = (command.text ?? "").trim();
    const channel = command.channel_id;
    const userId = command.user_id;

    console.log(`[CMD] /claudebox from user=${userId} channel=${channel} text=${text}`);

    if (!text) {
      await ack({ text: "Usage: `/claudebox <prompt>`" });
      return;
    }

    // Terminal command shortcut for slash commands (no thread context)
    const termMatch = text.match(/^terminal(?:\s+(.+))?$/i);
    if (termMatch) {
      const arg = (termMatch[1] || "").trim();
      let hash: string | null = null;
      let session = null;
      if (arg) {
        const urlHash = extractHashFromUrl(arg);
        hash = urlHash || (/^[a-f0-9]{16}(-\d+)?$/.test(arg) ? arg : null) || (/^[a-f0-9]{32}$/.test(arg) ? arg : null);
        if (hash) session = store.findByHash(hash);
      }
      if (!session || !hash) {
        await ack({ text: "Usage: `/claudebox terminal <hash>` or `/claudebox terminal <ci-log-url>`" });
        return;
      }
      const wtId = session.worktree_id || hash;
      const url = sessionUrl(wtId);
      await ack({ text: `<${url}|Join interactive session> \u2014 ${session.status}${session.exit_code != null ? ` (exit ${session.exit_code})` : ""}` });
      return;
    }

    // For slash commands, ack early with a status message, then handle async
    // We use a flag to distinguish whether we've already acked
    let acked = false;
    const userName = await resolveUserName(client, userId);
    const baseBranch = await resolveBaseBranch(client, channel);
    const channelName = await resolveChannelName(client, channel);
    const parsed = parseMessage(text, (h) => store.findByHash(h));

    // Hash-based resume — inherit session profile, don't parse keywords
    if (parsed.type === "reply-hash") {
      const session = store.findByHash(parsed.hash);
      if (session) {
        const err = validateResumeSession(session, parsed.hash);
        if (err) { await ack({ text: err }); return; }
        const quiet = await resolveQuietMode(client, channel, null);
        await ack({ text: `ClaudeBox replying to session \`${parsed.hash.slice(0, 8)}...\`: _${truncate(parsed.prompt)}_` });
        await startReplySession(client, channel, null, parsed.prompt, session, userName, store, docker, baseBranch, quiet, channelName, false, session.profile || "");
        return;
      }
      console.log(`[CMD] Hash ${parsed.hash} is not a session, treating as prompt`);
    }

    // New session — parse keywords only here
    const { forceNew, quiet: explicitQuiet, ciAllow: cmdCiAllow, profile: cmdProfile, prompt: effectivePrompt } = parseKeywords(parsed);
    const quiet = await resolveQuietMode(client, channel, explicitQuiet);
    const prompt = (parsed.type === "reply-hash" && !store.findByHash(parsed.hash)) ? text : effectivePrompt;
    await ack({ text: `ClaudeBox starting: _${truncate(prompt)}_` });
    await startNewSession(client, channel, null, prompt, "", userName, store, docker, baseBranch, quiet, channelName, cmdCiAllow, cmdProfile);
  });

  // ── :x: reaction → delete our message ─────────────────────────
  app.event("reaction_added", async ({ event, client }) => {
    if (event.reaction !== "x") return;
    const item = event.item as any;
    if (item.type !== "message") return;
    try {
      // Only delete messages posted by our bot
      const info = await client.conversations.history({
        channel: item.channel,
        latest: item.ts,
        inclusive: true,
        limit: 1,
      });
      const msg = info.messages?.[0];
      if (!msg || !msg.bot_id) return; // not our message
      await client.chat.delete({ channel: item.channel, ts: item.ts });
      console.log(`[REACTION] Deleted message ${item.ts} in ${item.channel} (reacted by ${event.user})`);
    } catch (e: any) {
      console.warn(`[REACTION] Failed to delete ${item.ts}: ${e.message}`);
    }
  });
}
