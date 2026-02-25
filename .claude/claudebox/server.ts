#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox Server — combined Slack listener + HTTP API.
 *
 * Slack: Socket Mode (app_mention, /claudebox slash command)
 * HTTP:  POST /run (authenticated, blocks until session exits)
 *
 * Max 10 concurrent sessions.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn, ChildProcess } from "child_process";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { App } from "@slack/bolt";

// ── Config ──────────────────────────────────────────────────────
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN!;
const API_SECRET = process.env.CLAUDEBOX_API_SECRET || "";
const HTTP_PORT = parseInt(process.env.CLAUDEBOX_PORT || "3000", 10);
const MAX_CONCURRENT = 10;
const REPO_DIR = process.env.CLAUDE_REPO_DIR ?? join(homedir(), "aztec-packages");
const SESSIONS_DIR = join(REPO_DIR, ".claude", "claudebox", "sessions");
const ENTRYPOINT = join(homedir(), "claudeentry.sh");

let activeSessions = 0;

// ── Session lookup ──────────────────────────────────────────────

interface SessionMeta {
  claude_session_id?: string;
  log_url?: string;
  worktree?: string;
  script?: string;
  slack_channel?: string;
  slack_thread_ts?: string;
  started?: string;
  _log_id?: string;
  [key: string]: any;
}

function findSessionByHash(logHash: string): SessionMeta | null {
  const path = join(SESSIONS_DIR, `${logHash}.json`);
  if (!existsSync(path)) return null;
  try {
    const s = JSON.parse(readFileSync(path, "utf-8"));
    s._log_id = logHash;
    return s;
  } catch {
    return null;
  }
}

function findLastSessionInThread(channel: string, threadTs: string): SessionMeta | null {
  if (!existsSync(SESSIONS_DIR)) return null;
  let best: SessionMeta | null = null;
  for (const f of readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const s: SessionMeta = JSON.parse(readFileSync(join(SESSIONS_DIR, f), "utf-8"));
      if (s.slack_channel === channel && s.slack_thread_ts === threadTs) {
        s._log_id = basename(f, ".json");
        if (!best || (s.started ?? "") > (best.started ?? "")) {
          best = s;
        }
      }
    } catch {
      // skip
    }
  }
  return best;
}

function extractHashFromUrl(text: string): string | null {
  const m = text.match(/^<?https?:\/\/ci\.aztec-labs\.com\/([a-f0-9]+)>?/);
  return m ? m[1] : null;
}

// ── Message parsing ─────────────────────────────────────────────

type ParseResult =
  | { type: "reply-hash"; hash: string; prompt: string }
  | { type: "prompt"; prompt: string };

function parseMessage(text: string): ParseResult {
  const parts = text.split(/\s+/);
  const first = parts[0] || "";
  const rest = text.slice(first.length).trim();

  const urlHash = extractHashFromUrl(first);
  if (urlHash) return { type: "reply-hash", hash: urlHash, prompt: rest };

  if (/^[a-f0-9]{32}$/.test(first) && findSessionByHash(first)) {
    return { type: "reply-hash", hash: first, prompt: rest };
  }

  return { type: "prompt", prompt: text };
}

// ── Entrypoint runner ───────────────────────────────────────────

function truncate(s: string, n = 80): string {
  return s.length <= n ? s : s.slice(0, n - 3) + "...";
}

function runEntrypoint(
  args: string[],
  stdinText: string,
  onOutput?: (data: string) => void,
): Promise<number> {
  return new Promise((resolve) => {
    activeSessions++;
    console.log(`[RUN] Spawning (${activeSessions}/${MAX_CONCURRENT}): ${args.join(" ")}`);

    const proc = spawn("bash", [ENTRYPOINT, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDECODE: "" },
    });

    proc.stdout?.on("data", (d: Buffer) => {
      const s = d.toString();
      process.stdout.write(s);
      onOutput?.(s);
    });
    proc.stderr?.on("data", (d: Buffer) => {
      const s = d.toString();
      process.stderr.write(s);
      onOutput?.(s);
    });

    if (stdinText) proc.stdin?.write(stdinText);
    proc.stdin?.end();

    proc.on("close", (code) => {
      activeSessions--;
      console.log(`[RUN] Exit code: ${code} (${activeSessions}/${MAX_CONCURRENT} active)`);
      resolve(code ?? 1);
    });
  });
}

// ── Slack helpers ───────────────────────────────────────────────

function resolveUserName(client: any, userId: string): Promise<string> {
  return client.users
    .info({ user: userId })
    .then((r: any) => r.user?.real_name ?? userId)
    .catch(() => userId);
}

async function getThreadContext(client: any, channel: string, threadTs: string): Promise<string> {
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

async function startNewSession(
  client: any,
  channel: string,
  threadTs: string | null,
  prompt: string,
  threadContext: string,
  userName: string,
) {
  let status = prompt ? `ClaudeBox: _${truncate(prompt)}_ ...` : "ClaudeBox starting...";
  try {
    const postArgs: any = { channel, text: status };
    if (threadTs) postArgs.thread_ts = threadTs;
    const result = await client.chat.postMessage(postArgs);
    const messageTs = result.ts;
    if (!threadTs) threadTs = messageTs;

    const args = [
      `--slack-channel=${channel}`,
      `--slack-thread-ts=${threadTs}`,
      `--slack-message-ts=${messageTs}`,
    ];
    if (userName) args.push(`--user=${userName}`);

    let stdin = "";
    if (threadContext) stdin += `Slack thread context:\n${threadContext}\n\n`;
    if (prompt) stdin += prompt;

    runEntrypoint(args, stdin);
  } catch (e) {
    console.error(`[ERROR] Failed to post status: ${e}`);
  }
}

async function startReplySession(
  client: any,
  channel: string,
  threadTs: string | null,
  message: string,
  session: SessionMeta,
  userName: string,
) {
  const claudeSessionId = session.claude_session_id;
  const prevLogUrl = session.log_url ?? "";
  const prevWorktree = session.worktree ?? "";

  let status = "ClaudeBox running, treating your message as a reply";
  if (message) status += `: _${truncate(message)}_`;
  status += " ...";

  try {
    const postArgs: any = { channel, text: status };
    if (threadTs) postArgs.thread_ts = threadTs;
    const result = await client.chat.postMessage(postArgs);
    const messageTs = result.ts;

    const args = [
      `--slack-channel=${channel}`,
      `--slack-thread-ts=${threadTs}`,
      `--slack-message-ts=${messageTs}`,
      `--resume-session-id=${claudeSessionId}`,
    ];
    if (prevLogUrl) args.push(`--prev-log-url=${prevLogUrl}`);
    if (prevWorktree) args.push(`--prev-worktree=${prevWorktree}`);
    if (userName) args.push(`--user=${userName}`);

    runEntrypoint(args, message);
  } catch (e) {
    console.error(`[ERROR] Failed to post reply status: ${e}`);
  }
}

// ── Slack app ───────────────────────────────────────────────────

const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

slackApp.event("app_mention", async ({ event, client, say }) => {
  const channel = event.channel;
  const text = event.text ?? "";
  const threadTs = (event as any).thread_ts ?? event.ts;

  console.log(`[MENTION] channel=${channel} text=${text.slice(0, 100)}`);

  const cmd = text.replace(/<@[A-Z0-9]+>\s*/g, "").trim();
  if (!cmd) {
    await say({ text: "Usage: `@ClaudeBox <prompt>`", thread_ts: threadTs });
    return;
  }

  if (activeSessions >= MAX_CONCURRENT) {
    await say({ text: `ClaudeBox is at capacity (${MAX_CONCURRENT} sessions). Try again later.`, thread_ts: threadTs });
    return;
  }

  const userName = await resolveUserName(client, event.user ?? "");
  const parsed = parseMessage(cmd);

  if (parsed.type === "reply-hash") {
    const session = findSessionByHash(parsed.hash);
    if (!session) {
      await say({ text: `Session \`${parsed.hash}\` not found.`, thread_ts: threadTs });
      return;
    }
    if (!session.claude_session_id) {
      await say({ text: `Session \`${parsed.hash}\` has no Claude session ID.`, thread_ts: threadTs });
      return;
    }
    console.log(`[REPLY-HASH] Resuming session ${parsed.hash}`);
    await startReplySession(client, channel, threadTs, parsed.prompt, session, userName);
    return;
  }

  // Freeform: check for previous session in thread
  const prevSession = findLastSessionInThread(channel, threadTs);
  if (prevSession?.claude_session_id) {
    console.log(`[REPLY] Resuming last session in thread: ${prevSession._log_id}`);
    await startReplySession(client, channel, threadTs, parsed.prompt, prevSession, userName);
  } else {
    const threadContext = await getThreadContext(client, channel, threadTs);
    await startNewSession(client, channel, threadTs, parsed.prompt, threadContext, userName);
  }
});

slackApp.command("/claudebox", async ({ ack, command, client }) => {
  const text = (command.text ?? "").trim();
  const channel = command.channel_id;
  const userId = command.user_id;

  console.log(`[CMD] /claudebox from user=${userId} channel=${channel} text=${text}`);

  if (!text) {
    await ack({ text: "Usage: `/claudebox <prompt>`" });
    return;
  }

  if (activeSessions >= MAX_CONCURRENT) {
    await ack({ text: `ClaudeBox is at capacity (${MAX_CONCURRENT} sessions). Try again later.` });
    return;
  }

  const userName = await resolveUserName(client, userId);
  const parsed = parseMessage(text);

  if (parsed.type === "reply-hash") {
    const session = findSessionByHash(parsed.hash);
    if (!session?.claude_session_id) {
      await ack({ text: `Session \`${parsed.hash}\` not found or has no Claude session ID.` });
      return;
    }
    await ack({ text: `ClaudeBox replying to session \`${parsed.hash.slice(0, 8)}...\`: _${truncate(parsed.prompt)}_` });
    await startReplySession(client, channel, null, parsed.prompt, session, userName);
  } else {
    await ack({ text: `ClaudeBox starting: _${truncate(parsed.prompt)}_` });
    await startNewSession(client, channel, null, parsed.prompt, "", userName);
  }
});

// ── HTTP API ────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, active: activeSessions, max: MAX_CONCURRENT }));
    return;
  }

  // POST /run — run a ClaudeBox session, block until done
  if (req.method === "POST" && req.url === "/run") {
    // Auth
    const auth = req.headers.authorization ?? "";
    if (!API_SECRET || auth !== `Bearer ${API_SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    // Capacity
    if (activeSessions >= MAX_CONCURRENT) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "at capacity", active: activeSessions, max: MAX_CONCURRENT }));
      return;
    }

    let body: any;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    const prompt: string = body.prompt ?? "";
    if (!prompt) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "prompt required" }));
      return;
    }

    // Build flags from body
    const args: string[] = [];
    if (body.user) args.push(`--user=${body.user}`);
    if (body.comment_id) args.push(`--comment-id=${body.comment_id}`);
    if (body.run_comment_id) args.push(`--run-comment-id=${body.run_comment_id}`);
    if (body.repo) args.push(`--repo=${body.repo}`);
    if (body.run_url) args.push(`--run-url=${body.run_url}`);
    if (body.link) args.push(`--link=${body.link}`);

    console.log(`[HTTP] POST /run user=${body.user ?? "?"} prompt=${truncate(prompt, 120)}`);

    // Stream output back as chunked text
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    });

    const exitCode = await runEntrypoint(args, prompt, (data) => {
      res.write(data);
    });

    res.end(`\n--- exit code: ${exitCode} ---\n`);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

// ── Start ───────────────────────────────────────────────────────

async function main() {
  console.log("ClaudeBox server starting...");
  console.log(`  Slack: Socket Mode`);
  console.log(`  HTTP:  port ${HTTP_PORT}`);
  console.log(`  Max concurrent: ${MAX_CONCURRENT}`);

  await slackApp.start();
  console.log("  Slack connected.");

  httpServer.listen(HTTP_PORT, () => {
    console.log(`  HTTP listening on :${HTTP_PORT}`);
  });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
