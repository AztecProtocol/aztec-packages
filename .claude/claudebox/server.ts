#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox Server — combined Slack listener + HTTP API.
 *
 * Slack: Socket Mode (app_mention, /claudebox slash command)
 * HTTP:  POST /run (authenticated, blocks until session exits)
 *
 * Max 10 concurrent sessions.
 */

import { createServer, IncomingMessage, ServerResponse, request as httpRequest } from "http";
import { spawn, execSync, execFileSync, ChildProcess } from "child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, realpathSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { App } from "@slack/bolt";
import { WebSocketServer, WebSocket } from "ws";

// ── Config ──────────────────────────────────────────────────────
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN!;
const GH_TOKEN = process.env.GH_TOKEN || "";
const API_SECRET = process.env.CLAUDEBOX_API_SECRET || "";
const HTTP_PORT = parseInt(process.env.CLAUDEBOX_PORT || "3000", 10);
const MAX_CONCURRENT = 10;
const REPO_DIR = process.env.CLAUDE_REPO_DIR ?? join(homedir(), "aztec-packages");
const SESSIONS_DIR = join(REPO_DIR, ".claude", "claudebox", "sessions");
const DOCKER_IMAGE = process.env.CLAUDEBOX_DOCKER_IMAGE || "claudebox:latest";
const CLAUDEBOX_DIR = join(homedir(), ".claudebox");
const CLAUDEBOX_SESSIONS_DIR = join(CLAUDEBOX_DIR, "sessions");
const CLAUDEBOX_CODE_DIR = dirname(import.meta.url.replace("file://", ""));
const CLAUDE_BINARY = process.env.CLAUDE_BINARY ?? join(homedir(), ".local", "bin", "claude");
const BASTION_SSH_KEY = join(homedir(), ".ssh", "build_instance_key");

const CLAUDEBOX_HOST = process.env.CLAUDEBOX_HOST || "claudebox.work";

let activeSessions = 0;

// ── Interactive session state ───────────────────────────────────

interface InteractiveSession {
  timer: ReturnType<typeof setTimeout>;
  container: string;
  sidecar: string;
  network: string;
  ws: WebSocket | null;
  hash: string;
  deadline: number; // epoch ms
}

const interactiveSessions = new Map<string, InteractiveSession>();

function cleanupInteractive(hash: string): void {
  const s = interactiveSessions.get(hash);
  if (!s) return;
  interactiveSessions.delete(hash);
  clearTimeout(s.timer);
  // Tear down containers + network
  try { dockerExec("stop", "-t", "3", s.container); } catch {}
  try { dockerExec("rm", "-f", s.container); } catch {}
  try { dockerExec("stop", "-t", "3", s.sidecar); } catch {}
  try { dockerExec("rm", "-f", s.sidecar); } catch {}
  try { dockerExec("network", "rm", s.network); } catch {}
  // Update session metadata
  const metaPath = join(SESSIONS_DIR, `${hash}.json`);
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    if (meta.status === "interactive") {
      meta.status = "completed";
      meta.finished = new Date().toISOString();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
  } catch {}
  console.log(`[INTERACTIVE] Cleaned up session ${hash}`);
}

function resetKeepalive(hash: string, minutes: number): void {
  const s = interactiveSessions.get(hash);
  if (!s) return;
  clearTimeout(s.timer);
  s.deadline = Date.now() + minutes * 60_000;
  s.timer = setTimeout(() => {
    console.log(`[INTERACTIVE] Session ${hash} expired`);
    // Notify via WebSocket before cleanup
    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
      s.ws.send("\r\n\x1b[1;33m⏰ Session expired. Cleaning up...\x1b[0m\r\n");
      setTimeout(() => cleanupInteractive(hash), 3_000);
    } else {
      cleanupInteractive(hash);
    }
  }, minutes * 60_000);
}

// ── Session lookup ──────────────────────────────────────────────

interface SessionMeta {
  claude_session_id?: string;
  log_url?: string;
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
  // Sort by file mtime (newest first) so we can short-circuit on first match
  const files = readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, mtime: statSync(join(SESSIONS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { name } of files) {
    try {
      const s: SessionMeta = JSON.parse(readFileSync(join(SESSIONS_DIR, name), "utf-8"));
      if (s.slack_channel === channel && s.slack_thread_ts === threadTs) {
        s._log_id = basename(name, ".json");
        return s;
      }
    } catch {
      // skip
    }
  }
  return null;
}

/**
 * Reconcile "running" sessions against Docker container state.
 * If a session says "running" but its container is stopped/gone, mark it cancelled.
 */
function reconcileSessions(): void {
  if (!existsSync(SESSIONS_DIR)) return;
  for (const name of readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const path = join(SESSIONS_DIR, name);
      const meta = JSON.parse(readFileSync(path, "utf-8"));
      if (meta.status !== "running") continue;
      const containerName = meta.container;
      if (!containerName) {
        // Legacy worktree session or missing container — mark as cancelled
        meta.status = "cancelled";
        meta.finished = new Date().toISOString();
        writeFileSync(path, JSON.stringify(meta, null, 2));
        console.log(`[RECONCILE] ${basename(name, ".json")}: running → cancelled (no container)`);
        continue;
      }
      // Single docker inspect for both running state and exit code
      let running = false, exitCode = 1;
      try {
        const out = execFileSync("docker", ["inspect", "-f", "{{.State.Running}} {{.State.ExitCode}}", containerName], {
          encoding: "utf-8", timeout: 5_000,
        }).trim().split(" ");
        running = out[0] === "true";
        exitCode = parseInt(out[1], 10) || 1;
      } catch {} // container doesn't exist → not running
      if (!running) {
        meta.status = "cancelled";
        meta.exit_code = exitCode;
        meta.finished = new Date().toISOString();
        writeFileSync(path, JSON.stringify(meta, null, 2));
        console.log(`[RECONCILE] ${basename(name, ".json")}: running → cancelled (exit=${exitCode})`);
      }
    } catch {}
  }
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

// ── Helpers ──────────────────────────────────────────────────────

function truncate(s: string, n = 80): string {
  return s.length <= n ? s : s.slice(0, n - 3) + "...";
}

// ── Docker container session runner ─────────────────────────────

interface ContainerSessionOpts {
  prompt: string;
  userName?: string;
  commentId?: string;
  runCommentId?: string;
  runUrl?: string;
  link?: string;
  slackChannel?: string;
  slackThreadTs?: string;
  slackMessageTs?: string;
  // Reply fields
  resumeSessionId?: string;
  prevLogId?: string;
  targetRef?: string;
}

/** Quietly run a docker command, returning stdout. Throws on failure. */
function dockerExec(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf-8", timeout: 30_000 }).trim();
}

/** Wait for a container's HTTP health endpoint, with timeout. */
async function waitForHealth(containerName: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const out = execFileSync("docker", [
        "exec", containerName, "curl", "-sf", "http://127.0.0.1:9801/health",
      ], { encoding: "utf-8", timeout: 3000 });
      if (out.includes("ok")) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Sidecar health check timed out after ${timeoutMs}ms`);
}

async function runContainerSession(
  opts: ContainerSessionOpts,
  onOutput?: (data: string) => void,
  onStart?: (logUrl: string) => void,
): Promise<number> {
  activeSessions++;
  const logId = execSync("head -c 16 /dev/urandom | xxd -p", { encoding: "utf-8" }).trim();
  const sessionUuid = randomUUID();
  const networkName = `claudebox-net-${logId}`;
  const sidecarName = `claudebox-sidecar-${logId}`;
  const claudeName = `claudebox-${logId}`;
  const logUrl = `http://ci.aztec-labs.com/${logId}`;
  const mcpUrl = `http://${sidecarName}:9801/mcp`;

  onStart?.(logUrl);

  // Create workspace directory (or reuse from previous session)
  let workspaceDir: string;
  if (opts.prevLogId) {
    workspaceDir = join(CLAUDEBOX_SESSIONS_DIR, opts.prevLogId, "workspace");
    if (!existsSync(workspaceDir)) {
      console.warn(`[DOCKER] Previous workspace not found: ${workspaceDir}, creating new`);
      workspaceDir = join(CLAUDEBOX_SESSIONS_DIR, logId, "workspace");
    }
  } else {
    workspaceDir = join(CLAUDEBOX_SESSIONS_DIR, logId, "workspace");
  }
  mkdirSync(workspaceDir, { recursive: true });
  // Fix ownership: previous containers may have run as root, creating root-owned files.
  // Now we run as the current user, so ensure everything is writable.
  try { execSync(`chown -R ${process.getuid!()}:${process.getgid!()} "${workspaceDir}"`, { timeout: 10_000 }); } catch {}

  const sessionDir = join(CLAUDEBOX_SESSIONS_DIR, logId);
  mkdirSync(sessionDir, { recursive: true });

  // Claude projects dir — persists session JSONL across containers.
  // Derive from workspace parent so resume reuses the same JSONL files.
  const claudeProjectsDir = join(dirname(workspaceDir), "claude-projects");
  mkdirSync(claudeProjectsDir, { recursive: true });

  console.log(`[DOCKER] Starting session ${logId}`);
  console.log(`[DOCKER]   Sidecar:   ${sidecarName}`);
  console.log(`[DOCKER]   Claude:    ${claudeName}`);
  console.log(`[DOCKER]   Network:   ${networkName}`);
  console.log(`[DOCKER]   Workspace: ${workspaceDir}`);
  console.log(`[DOCKER]   Log URL:   ${logUrl}`);

  // Write prompt to file (avoids env var size limits and escaping issues)
  let fullPrompt = opts.prompt;
  fullPrompt += `\n\nLog URL: ${logUrl}`;
  if (opts.runUrl) fullPrompt += `\nRun URL: ${opts.runUrl}`;
  if (opts.link) fullPrompt += `\nLink: ${opts.link}`;
  const promptFile = join(workspaceDir, "prompt.txt");
  writeFileSync(promptFile, fullPrompt);

  // Write session metadata
  const metadataFile = join(SESSIONS_DIR, `${logId}.json`);
  mkdirSync(dirname(metadataFile), { recursive: true });
  const metadata: any = {
    prompt: opts.prompt.slice(0, 500),
    user: opts.userName || "unknown",
    container: claudeName,
    sidecar: sidecarName,
    log_url: logUrl,
    link: opts.link || opts.runUrl || "",
    slack_channel: opts.slackChannel || "",
    slack_thread_ts: opts.slackThreadTs || "",
    claude_session_id: sessionUuid,
    resume_of: opts.resumeSessionId || "",
    started: new Date().toISOString(),
    status: "running",
  };
  writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

  // ── 1. Create Docker network ──────────────────────────────────
  try {
    dockerExec("network", "create", networkName);
    console.log(`[DOCKER] Network created: ${networkName}`);
  } catch (e: any) {
    activeSessions--;
    throw new Error(`Failed to create Docker network: ${e.message}`);
  }

  // Cleanup helper — tears down containers + network on exit
  // Both containers must be removed before the network can be deleted.
  // Workspace data persists on the host bind mount, not in the container.
  const cleanup = () => {
    try { dockerExec("stop", "-t", "5", sidecarName); } catch {}
    try { dockerExec("rm", "-f", sidecarName); } catch {}
    try { dockerExec("rm", "-f", claudeName); } catch {}
    try { dockerExec("network", "rm", networkName); } catch {}
  };

  try {
    // ── 2. Start sidecar container (daemon) ───────────────────────
    const sidecarArgs: string[] = [
      "run", "-d",
      "--name", sidecarName,
      "--network", networkName,
      "--user", `${process.getuid!()}:${process.getgid!()}`,
      "-e", `HOME=/tmp/claudehome`,
      // Shared mounts
      "-v", `${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`,
      "-v", `${workspaceDir}:/workspace:rw`,
      // Sidecar code + node_modules (mounted from host)
      "-v", `${CLAUDEBOX_CODE_DIR}:/opt/claudebox:ro`,
      // Docker socket for docker-proxy (sidecar proxies filtered Docker API to Claude)
      "-v", "/var/run/docker.sock:/var/run/docker.sock",
      // SSH key for bastion/redis cache
      "-v", `${BASTION_SSH_KEY}:/tmp/claudehome/.ssh/build_instance_key:ro`,
      // Environment — sidecar holds all secrets
      "-e", `MCP_PORT=9801`,
      "-e", `GH_TOKEN=${GH_TOKEN}`,
      "-e", `SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}`,
      "-e", `LINEAR_API_KEY=${process.env.LINEAR_API_KEY || ""}`,
      "-e", `CLAUDEBOX_LOG_ID=${logId}`,
      "-e", `CLAUDEBOX_LOG_URL=${logUrl}`,
      "-e", `CLAUDEBOX_USER=${opts.userName || ""}`,
      "-e", `CLAUDEBOX_COMMENT_ID=${opts.commentId || ""}`,
      "-e", `CLAUDEBOX_RUN_COMMENT_ID=${opts.runCommentId || ""}`,
      "-e", `CLAUDEBOX_RUN_URL=${opts.runUrl || ""}`,
      "-e", `CLAUDEBOX_LINK=${opts.link || ""}`,
      "-e", `CLAUDEBOX_SLACK_CHANNEL=${opts.slackChannel || ""}`,
      "-e", `CLAUDEBOX_SLACK_THREAD_TS=${opts.slackThreadTs || ""}`,
      "-e", `CLAUDEBOX_SLACK_MESSAGE_TS=${opts.slackMessageTs || ""}`,
      "--entrypoint", "/opt/claudebox/mcp-sidecar.ts",
      DOCKER_IMAGE,
    ];

    dockerExec(...sidecarArgs);
    console.log(`[DOCKER] Sidecar started: ${sidecarName}`);

    // ── 3. Wait for sidecar health ────────────────────────────────
    await waitForHealth(sidecarName);
    console.log(`[DOCKER] Sidecar healthy`);

    // ── 4. Start Claude container ─────────────────────────────────
    // Run as current user so --dangerously-skip-permissions works (blocked as root).
    // ~/.claude is mounted writable so Claude can refresh OAuth tokens.
    const claudeArgs: string[] = [
      "run",
      "--name", claudeName,
      "--network", networkName,
      "--user", `${process.getuid!()}:${process.getgid!()}`,
      "-e", `HOME=/tmp/claudehome`,
      // Shared mounts
      "-v", `${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`,
      "-v", `${workspaceDir}:/workspace:rw`,
      // Claude session persistence — mount at the exact project subdir Claude will use
      // Claude encodes /workspace/aztec-packages → -workspace-aztec-packages
      "-v", `${claudeProjectsDir}:/tmp/claudehome/.claude/projects/-workspace-aztec-packages:rw`,
      // Claude binary + config (writable so Claude can refresh OAuth tokens)
      "-v", `${realpathSync(CLAUDE_BINARY)}:/usr/local/bin/claude:ro`,
      "-v", `${join(homedir(), ".claude")}:/tmp/claudehome/.claude:rw`,
      "-v", `${join(homedir(), ".claude.json")}:/tmp/claudehome/.claude.json:rw`,
      // SSH key for bastion/redis cache
      "-v", `${BASTION_SSH_KEY}:/tmp/claudehome/.ssh/build_instance_key:ro`,
      // Environment
      "-e", `CLAUDEBOX_MCP_URL=${mcpUrl}`,
      "-e", `CLAUDEBOX_TARGET_REF=${opts.targetRef || "origin/next"}`,
      "-e", `SESSION_UUID=${sessionUuid}`,
      // CI_PASSWORD for ci.sh dlog HTTP fallback
      "-e", `CI_PASSWORD=${process.env.CI_PASSWORD || ""}`,
      // Docker-in-Docker via proxy socket on shared /workspace volume
      "-e", `DOCKER_HOST=unix:///workspace/docker.sock`,
    ];

    if (opts.resumeSessionId) {
      claudeArgs.push("-e", `CLAUDEBOX_RESUME_ID=${opts.resumeSessionId}`);
    }

    claudeArgs.push("--entrypoint", "bash", DOCKER_IMAGE, "/opt/claudebox/entrypoint.sh");

    console.log(`[DOCKER] Starting Claude container: ${claudeName}`);

    // ── 5. Run Claude container (blocking, stream output) ─────────
    return await new Promise<number>((resolve) => {
      const container = spawn("docker", claudeArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Set up cache_log streaming via stream-session.ts (pretty-prints JSONL)
      let cacheLogProc: ChildProcess | null = null;
      let streamSessionProc: ChildProcess | null = null;
      try {
        const cacheLogBin = join(REPO_DIR, "ci3", "cache_log");
        const streamSessionBin = join(CLAUDEBOX_CODE_DIR, "stream-session.ts");
        if (existsSync(cacheLogBin) && existsSync(streamSessionBin)) {
          const slackLink = opts.slackChannel && opts.slackThreadTs
            ? `https://aztecprotocol.slack.com/archives/${opts.slackChannel}/p${(opts.slackMessageTs || opts.slackThreadTs).replace(".", "")}?thread_ts=${opts.slackThreadTs}&cid=${opts.slackChannel}`
            : "";
          const headerLines: string[] = [];
          if (slackLink) headerLines.push(`Slack: ${slackLink}`);
          if (opts.runUrl) headerLines.push(`GitHub: ${opts.runUrl}`);
          if (opts.link && opts.link !== opts.runUrl && opts.link !== slackLink) headerLines.push(`Link: ${opts.link}`);
          headerLines.push(`User: ${opts.userName || "unknown"}`);
          headerLines.push(`Container: ${claudeName}`);
          headerLines.push("");

          const parentLogId = opts.prevLogId || "";
          cacheLogProc = spawn("bash", ["-c", `DUP=1 PARENT_LOG_ID="${parentLogId}" "${cacheLogBin}" claudebox "${logId}"`], {
            stdio: ["pipe", "inherit", "inherit"],
            env: { ...process.env },
          });
          cacheLogProc.stdin?.write(headerLines.join("\n"));

          // stream-session.ts watches the JSONL in claudeProjectsDir and pretty-prints
          streamSessionProc = spawn(streamSessionBin, ["--dir", claudeProjectsDir], {
            stdio: ["ignore", "pipe", "inherit"],
          });
          streamSessionProc.stdout?.on("data", (d: Buffer) => {
            cacheLogProc?.stdin?.write(d);
          });
        }
      } catch (e) {
        console.warn(`[DOCKER] cache_log setup failed: ${e}`);
      }

      container.stdout?.on("data", (d: Buffer) => {
        const s = d.toString();
        process.stdout.write(s);
        onOutput?.(s);
        cacheLogProc?.stdin?.write(s);
      });
      container.stderr?.on("data", (d: Buffer) => {
        const s = d.toString();
        process.stderr.write(s);
        onOutput?.(s);
        cacheLogProc?.stdin?.write(s);
      });

      container.on("close", (code) => {
        activeSessions--;
        const exitCode = code ?? 1;
        console.log(`[DOCKER] Claude container ${claudeName} exited: ${exitCode} (${activeSessions}/${MAX_CONCURRENT} active)`);

        // Signal stream-session to drain remaining JSONL and exit
        if (streamSessionProc) {
          streamSessionProc.kill("SIGTERM");
          streamSessionProc.on("close", () => {
            setTimeout(() => { cacheLogProc?.stdin?.end(); }, 500);
          });
          // Safety: force-close after 15s if stream-session hangs
          setTimeout(() => {
            streamSessionProc?.kill("SIGKILL");
            setTimeout(() => { cacheLogProc?.stdin?.end(); }, 500);
          }, 15_000);
        } else {
          setTimeout(() => { cacheLogProc?.stdin?.end(); }, 500);
        }

        // Tear down sidecar + network
        cleanup();

        // Update session metadata
        try {
          const meta = JSON.parse(readFileSync(metadataFile, "utf-8"));
          meta.status = "completed";
          meta.finished = new Date().toISOString();
          meta.exit_code = exitCode;
          writeFileSync(metadataFile, JSON.stringify(meta, null, 2));
        } catch {}

        // Update Slack status message (completed/error). Response is handled by respond_to_user MCP tool.
        if (SLACK_BOT_TOKEN && opts.slackChannel && opts.slackMessageTs) {
          const finalText = exitCode === 0
            ? `ClaudeBox completed <${logUrl}|log>`
            : `ClaudeBox exited with error (code ${exitCode}) <${logUrl}|log>`;
          fetch("https://slack.com/api/chat.update", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: opts.slackChannel, ts: opts.slackMessageTs, text: finalText }),
          }).catch((e) => console.warn(`[WARN] Slack status update failed: ${e}`));
        }

        resolve(exitCode);
      });
    });
  } catch (e: any) {
    activeSessions--;
    console.error(`[DOCKER] Session ${logId} failed: ${e.message}`);
    cleanup();

    // Update metadata on failure
    try {
      const meta = JSON.parse(readFileSync(metadataFile, "utf-8"));
      meta.status = "error";
      meta.error = e.message;
      meta.finished = new Date().toISOString();
      writeFileSync(metadataFile, JSON.stringify(meta, null, 2));
    } catch {}

    return 1;
  }
}


// ── Slack helpers ───────────────────────────────────────────────

/** Parse "new-session" keyword and return effective prompt. */
function parseNewKeyword(parsed: ParseResult): { forceNew: boolean; prompt: string } {
  const prompt = parsed.type === "prompt" ? parsed.prompt : parsed.prompt;
  const forceNew = /^new-session\b/i.test(prompt);
  return { forceNew, prompt: forceNew ? prompt.replace(/^new-session\s*/i, "") : prompt };
}

/** Validate a session for resume. Returns error message or null if OK. */
function validateResumeSession(session: SessionMeta | null, hash: string): string | null {
  if (!session) return `Session \`${hash}\` not found.`;
  if (session.status === "running") return "Replies to ongoing conversations are not supported currently.";
  // Resume regardless of exit code — sessions killed by SIGTERM (143), OOM (137),
  // or server restarts should still be resumable since workspace + JSONL persist.
  if (!session.claude_session_id) return `Session \`${hash}\` is not resumable (no session ID).`;
  return null;
}

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

    let fullPrompt = "";
    if (threadContext) fullPrompt += `Slack thread context:\n${threadContext}\n\n`;
    if (prompt) fullPrompt += prompt;

    runContainerSession({
      prompt: fullPrompt,
      userName,
      slackChannel: channel,
      slackThreadTs: threadTs!,
      slackMessageTs: messageTs,
    }, undefined, (logUrl) => {
      const text = prompt
        ? `ClaudeBox: _${truncate(prompt)}_ <${logUrl}|log>`
        : `ClaudeBox starting... <${logUrl}|log>`;
      client.chat.update({ channel, ts: messageTs, text }).catch(() => {});
    });
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
  const prevLogId = session._log_id ?? "";

  let status = "ClaudeBox running, treating your message as a reply";
  if (message) status += `: _${truncate(message)}_`;
  status += " ...";

  try {
    const postArgs: any = { channel, text: status };
    if (threadTs) postArgs.thread_ts = threadTs;
    const result = await client.chat.postMessage(postArgs);
    const messageTs = result.ts;

    runContainerSession({
      prompt: message,
      userName,
      slackChannel: channel,
      slackThreadTs: threadTs!,
      slackMessageTs: messageTs,
      resumeSessionId: claudeSessionId,
      prevLogId,
    }, undefined, (logUrl) => {
      let text = "ClaudeBox replying";
      if (message) text += `: _${truncate(message)}_`;
      text += ` <${logUrl}|log>`;
      client.chat.update({ channel, ts: messageTs, text }).catch(() => {});
    });
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
  const isReply = !!(event as any).thread_ts; // true only when message is IN a thread
  const threadTs = (event as any).thread_ts ?? event.ts;

  console.log(`[MENTION] channel=${channel} isReply=${isReply} text=${text.slice(0, 100)}`);

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
  const { forceNew, prompt: effectivePrompt } = parseNewKeyword(parsed);

  // Explicit hash-based resume — only if hash matches a known session
  if (!forceNew && parsed.type === "reply-hash") {
    const session = findSessionByHash(parsed.hash);
    if (session) {
      const err = validateResumeSession(session, parsed.hash);
      if (err) { await say({ text: err, thread_ts: threadTs }); return; }
      console.log(`[REPLY-HASH] Resuming session ${parsed.hash}`);
      await startReplySession(client, channel, threadTs, parsed.prompt, session, userName);
      return;
    }
    // Hash not a session (e.g. CI log URL) — fall through, use full text as prompt
    console.log(`[MENTION] Hash ${parsed.hash} is not a session, treating as prompt`);
  }

  // Use full original text when the URL wasn't a session reference
  const prompt = (parsed.type === "reply-hash" && !findSessionByHash(parsed.hash)) ? cmd : effectivePrompt;

  // Implicit resume: thread reply with a previous session (unless "new-session")
  if (!forceNew && isReply) {
    const prevSession = findLastSessionInThread(channel, threadTs);
    if (prevSession?.status === "running") {
      await say({ text: "Replies to ongoing conversations are not supported currently.", thread_ts: threadTs });
      return;
    }
    if (prevSession?.claude_session_id) {
      console.log(`[REPLY] Resuming last session in thread: ${prevSession._log_id}`);
      await startReplySession(client, channel, threadTs, prompt, prevSession, userName);
      return;
    }
  }

  // Fresh session: top-level, "new-session", or no previous session in thread
  const threadContext = isReply ? await getThreadContext(client, channel, threadTs) : "";
  await startNewSession(client, channel, threadTs, prompt, threadContext, userName);
});

// Direct messages — no @mention needed
slackApp.event("message", async ({ event, client, say }) => {
  // Only handle DMs (im), ignore channels/groups and bot messages
  if ((event as any).channel_type !== "im") return;
  if ((event as any).bot_id || (event as any).subtype) return;

  const channel = event.channel;
  const text = (event as any).text ?? "";
  const isReply = !!(event as any).thread_ts;
  const threadTs = (event as any).thread_ts ?? (event as any).ts;

  console.log(`[DM] channel=${channel} isReply=${isReply} text=${text.slice(0, 100)}`);

  const cmd = text.trim();
  if (!cmd) return;

  if (activeSessions >= MAX_CONCURRENT) {
    await say({ text: `ClaudeBox is at capacity (${MAX_CONCURRENT} sessions). Try again later.`, thread_ts: threadTs });
    return;
  }

  const userName = await resolveUserName(client, (event as any).user ?? "");
  const parsed = parseMessage(cmd);
  const { forceNew, prompt: effectivePrompt } = parseNewKeyword(parsed);

  // Explicit hash-based resume — only if hash matches a known session
  if (!forceNew && parsed.type === "reply-hash") {
    const session = findSessionByHash(parsed.hash);
    if (session) {
      const err = validateResumeSession(session, parsed.hash);
      if (err) { await say({ text: err, thread_ts: threadTs }); return; }
      console.log(`[DM-REPLY] Resuming session ${parsed.hash}`);
      await startReplySession(client, channel, threadTs, parsed.prompt, session, userName);
      return;
    }
    console.log(`[DM] Hash ${parsed.hash} is not a session, treating as prompt`);
  }

  // Use full original text when the URL wasn't a session reference
  const prompt = (parsed.type === "reply-hash" && !findSessionByHash(parsed.hash)) ? cmd : effectivePrompt;

  // Implicit resume in DM thread
  if (!forceNew && isReply) {
    const prevSession = findLastSessionInThread(channel, threadTs);
    if (prevSession?.status === "running") {
      await say({ text: "Replies to ongoing conversations are not supported currently.", thread_ts: threadTs });
      return;
    }
    if (prevSession?.claude_session_id) {
      console.log(`[DM-REPLY] Resuming last session in thread: ${prevSession._log_id}`);
      await startReplySession(client, channel, threadTs, prompt, prevSession, userName);
      return;
    }
  }

  const threadContext = isReply ? await getThreadContext(client, channel, threadTs) : "";
  await startNewSession(client, channel, threadTs, prompt, threadContext, userName);
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
  const { forceNew, prompt: effectivePrompt } = parseNewKeyword(parsed);

  if (!forceNew && parsed.type === "reply-hash") {
    const session = findSessionByHash(parsed.hash);
    if (session) {
      const err = validateResumeSession(session, parsed.hash);
      if (err) { await ack({ text: err }); return; }
      await ack({ text: `ClaudeBox replying to session \`${parsed.hash.slice(0, 8)}...\`: _${truncate(parsed.prompt)}_` });
      await startReplySession(client, channel, null, parsed.prompt, session, userName);
      return;
    }
    console.log(`[CMD] Hash ${parsed.hash} is not a session, treating as prompt`);
  }

  // Use full original text when the URL wasn't a session reference
  const prompt = (parsed.type === "reply-hash" && !findSessionByHash(parsed.hash)) ? text : effectivePrompt;

  await ack({ text: `ClaudeBox starting: _${truncate(prompt)}_` });
  await startNewSession(client, channel, null, prompt, "", userName);
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
  // Auth — all endpoints require bearer token, EXCEPT /s/<hash> routes (hash is auth)
  const isSessionRoute = req.url?.startsWith("/s/");
  if (API_SECRET && !isSessionRoute) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${API_SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }

  // POST /run — start a ClaudeBox session, return log URL immediately
  if (req.method === "POST" && req.url === "/run") {

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

    // Check if this is a reply (resume) request
    const parsed = body.resume_session_id ? null : parseMessage(prompt);
    let resumeSessionId = body.resume_session_id || "";
    let prevLogId = body.prev_log_id || "";

    // Auto-detect reply from prompt (e.g. "/claudebox <log_link> follow up")
    if (!resumeSessionId && parsed?.type === "reply-hash") {
      const prevSession = findSessionByHash(parsed.hash);
      const err = validateResumeSession(prevSession, parsed.hash);
      if (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err }));
        return;
      }
      resumeSessionId = prevSession!.claude_session_id!;
      prevLogId = parsed.hash;
    }

    console.log(`[HTTP] POST /run user=${body.user ?? "?"} prompt=${truncate(prompt, 120)}${resumeSessionId ? " (resume)" : ""}`);

    const sessionOpts: ContainerSessionOpts = {
      prompt: parsed?.type === "reply-hash" ? parsed.prompt : prompt,
      userName: body.user,
      commentId: body.comment_id,
      runCommentId: body.run_comment_id,
      runUrl: body.run_url,
      link: body.link,
      resumeSessionId: resumeSessionId || undefined,
      prevLogId: prevLogId || undefined,
    };

    // Fire-and-forget: start session, return log URL immediately
    // The session runs in the background; caller polls GET /session/:id for status
    let responded = false;
    runContainerSession(sessionOpts, undefined, (logUrl) => {
      if (!responded) {
        responded = true;
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ log_url: logUrl, status: "started" }));
      }
    }).catch((e) => {
      console.error(`[HTTP] Session error: ${e}`);
      if (!responded) {
        responded = true;
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /session/:id — session status (for polling)
  const sessionMatch = req.method === "GET" && req.url?.match(/^\/session\/([a-f0-9]+)$/);
  if (sessionMatch) {
    const session = findSessionByHash(sessionMatch[1]);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: session.status,
      log_url: session.log_url,
      user: session.user,
      started: session.started,
      finished: session.finished,
      exit_code: session.exit_code,
    }));
    return;
  }

  // ── Interactive session routes (hash-is-auth, no API_SECRET) ──

  // GET /s/<hash> — HTML page with session info + Join button
  const pageMatch = req.method === "GET" && req.url?.match(/^\/s\/([a-f0-9]{32})$/);
  if (pageMatch) {
    const hash = pageMatch[1];
    const session = findSessionByHash(hash);
    if (!session) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(interactiveSessionHTML(hash, session));
    return;
  }

  // POST /s/<hash>/keepalive — extend session timeout
  const keepaliveMatch = req.method === "POST" && req.url?.match(/^\/s\/([a-f0-9]{32})\/keepalive$/);
  if (keepaliveMatch) {
    const hash = keepaliveMatch[1];
    const s = interactiveSessions.get(hash);
    if (!s) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no active interactive session" }));
      return;
    }
    let minutes = 5;
    try {
      const body = JSON.parse(await readBody(req));
      minutes = Math.max(1, Math.min(60, body.minutes || 5));
    } catch {}
    resetKeepalive(hash, minutes);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, minutes, deadline: s.deadline }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

// ── Start ───────────────────────────────────────────────────────

async function main() {
  console.log("ClaudeBox server starting...");
  console.log(`  Image: ${DOCKER_IMAGE}`);
  console.log(`  Slack: Socket Mode`);
  console.log(`  HTTP:  port ${HTTP_PORT}`);
  console.log(`  Max concurrent: ${MAX_CONCURRENT}`);

  // Reconcile stale "running" sessions from before this process started
  reconcileSessions();

  // Periodically reconcile (catches missed container exits)
  setInterval(reconcileSessions, 60_000);

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
