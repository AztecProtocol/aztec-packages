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
import { spawn, execSync, execFileSync, ChildProcess } from "child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, realpathSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { App } from "@slack/bolt";

// ── Config ──────────────────────────────────────────────────────
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN!;
const GH_TOKEN = process.env.GH_TOKEN || "";
const API_SECRET = process.env.CLAUDEBOX_API_SECRET || "";
const HTTP_PORT = parseInt(process.env.CLAUDEBOX_PORT || "3000", 10);
const MAX_CONCURRENT = 10;
const REPO_DIR = process.env.CLAUDE_REPO_DIR ?? join(homedir(), "aztec-packages");
const SESSIONS_DIR = join(REPO_DIR, ".claude", "claudebox", "sessions");
const DOCKER_IMAGE = process.env.CLAUDEBOX_DOCKER_IMAGE || "aztecprotocol/devbox:3.0";
const CLAUDEBOX_DIR = join(homedir(), ".claudebox");
const CLAUDEBOX_SESSIONS_DIR = join(CLAUDEBOX_DIR, "sessions");
const CLAUDEBOX_CODE_DIR = dirname(import.meta.url.replace("file://", ""));
const CONTAINER_ENTRYPOINT_PATH = join(CLAUDEBOX_CODE_DIR, "container-entrypoint.sh");
const CONTAINER_CLAUDE_MD_PATH = join(CLAUDEBOX_CODE_DIR, "container-claude.md");
const CLAUDE_BINARY = process.env.CLAUDE_BINARY ?? join(homedir(), ".local", "bin", "claude");
const BASTION_SSH_KEY = join(homedir(), ".ssh", "build_instance_key");

let activeSessions = 0;

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

/** Spill long content to cache_log; return truncated text with link, or truncated-only on failure. */
function spillOrTruncate(text: string, inlineLimit: number, fallbackLimit: number, linkFmt: (url: string) => string): string {
  if (text.length <= fallbackLimit) return text;
  try {
    const spillId = execSync("head -c 16 /dev/urandom | xxd -p", { encoding: "utf-8" }).trim();
    execSync(`"${join(REPO_DIR, "ci3", "cache_log")}" claudebox-reply "${spillId}"`, {
      input: text, encoding: "utf-8", timeout: 10_000,
    });
    return truncate(text, inlineLimit) + "\n\n" + linkFmt(`http://ci.aztec-labs.com/${spillId}`);
  } catch {
    return truncate(text, fallbackLimit);
  }
}

/** Read JSONL files in a claude-projects dir and return the last assistant text message. */
function extractLastAssistantText(projectsDir: string): string | null {
  try {
    // Find newest JSONL recursively
    let newest = { path: "", mtime: 0 };
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith(".jsonl")) {
          const mt = statSync(p).mtimeMs;
          if (mt > newest.mtime) newest = { path: p, mtime: mt };
        }
      }
    };
    walk(projectsDir);
    if (!newest.path) return null;

    const lines = readFileSync(newest.path, "utf-8").split("\n");
    let lastText = "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        if (d.type === "assistant" && Array.isArray(d.message?.content)) {
          for (const item of d.message.content) {
            if (item.type === "text" && item.text?.trim()) lastText = item.text;
          }
        }
      } catch {}
    }
    return lastText || null;
  } catch {
    return null;
  }
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
  extraPaths?: string;
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
  const mcpAuthToken = randomUUID();
  const networkName = `claudebox-net-${logId}`;
  const sidecarName = `claudebox-sidecar-${logId}`;
  const claudeName = `claudebox-${logId}`;
  const logUrl = `http://ci.aztec-labs.com/${logId}`;
  const mcpUrl = `http://${sidecarName}:9801/mcp/${mcpAuthToken}`;

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
      // Shared mounts (same as Claude container)
      "-v", `${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`,
      "-v", `${workspaceDir}:/workspace:rw`,
      // Sidecar code + node_modules (mounted from host)
      "-v", `${CLAUDEBOX_CODE_DIR}:/opt/claudebox:ro`,
      // SSH key for bastion/redis cache (mapped to build_instance_key path for ci3 compat)
      "-v", `${BASTION_SSH_KEY}:/root/.ssh/build_instance_key:ro`,
      // Environment — sidecar holds all secrets
      "-e", `MCP_PORT=9801`,
      "-e", `MCP_AUTH_TOKEN=${mcpAuthToken}`,
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
      // tmpfs gives the non-root user a writable $HOME
      "--tmpfs", "/tmp/claudehome:exec,uid=" + process.getuid!(),
      // Shared mounts
      "-v", `${join(REPO_DIR, ".git")}:/reference-repo/.git:ro`,
      "-v", `${workspaceDir}:/workspace:rw`,
      // Entrypoint + CLAUDE.md template
      "-v", `${CONTAINER_ENTRYPOINT_PATH}:/entrypoint.sh:ro`,
      "-v", `${CONTAINER_CLAUDE_MD_PATH}:/entrypoint-assets/container-claude.md:ro`,
      // Claude session persistence — mount at the exact project subdir Claude will use
      // Claude encodes /workspace/aztec-packages → -workspace-aztec-packages
      "-v", `${claudeProjectsDir}:/tmp/claudehome/.claude/projects/-workspace-aztec-packages:rw`,
      // Claude binary
      "-v", `${realpathSync(CLAUDE_BINARY)}:/usr/local/bin/claude:ro`,
      // Claude config (writable so Claude can refresh OAuth tokens)
      "-v", `${join(homedir(), ".claude")}:/tmp/claudehome/.claude:rw`,
      "-v", `${join(homedir(), ".claude.json")}:/tmp/claudehome/.claude.json:rw`,
      // SSH key for bastion/redis cache
      "-v", `${BASTION_SSH_KEY}:/tmp/staged-ssh-key:ro`,
      // Environment — NO secrets
      "-e", `CLAUDEBOX_MCP_URL=${mcpUrl}`,
      "-e", `CLAUDEBOX_TARGET_REF=${opts.targetRef || "origin/next"}`,
      "-e", `SESSION_UUID=${sessionUuid}`,
    ];

    if (opts.extraPaths) {
      claudeArgs.push("-e", `CLAUDEBOX_EXTRA_PATHS=${opts.extraPaths}`);
    }
    if (opts.resumeSessionId) {
      claudeArgs.push("-e", `CLAUDEBOX_RESUME_ID=${opts.resumeSessionId}`);
    }

    claudeArgs.push("--entrypoint", "bash", DOCKER_IMAGE, "/entrypoint.sh");

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

        // stream-session.ts self-terminates after 10s idle.
        // Give it time to finish, then close cache_log.
        const finishStreaming = () => {
          streamSessionProc?.kill();
          setTimeout(() => { cacheLogProc?.stdin?.end(); }, 500);
        };
        if (streamSessionProc) {
          streamSessionProc.on("close", finishStreaming);
          // Safety: force-close after 15s if stream-session hangs
          setTimeout(finishStreaming, 15_000);
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

        // Post completion updates (Slack + GitHub)
        const summary = extractLastAssistantText(claudeProjectsDir);

        if (SLACK_BOT_TOKEN && opts.slackChannel && opts.slackMessageTs) {
          const finalText = exitCode === 0
            ? `ClaudeBox completed <${logUrl}|log>`
            : `ClaudeBox exited with error (code ${exitCode}) <${logUrl}|log>`;
          fetch("https://slack.com/api/chat.update", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: opts.slackChannel, ts: opts.slackMessageTs, text: finalText }),
          }).catch((e) => console.warn(`[WARN] Slack status update failed: ${e}`));

          if (summary && opts.slackThreadTs) {
            const replyText = spillOrTruncate(summary, 500, 1500, (u) => `Full response: ${u}`) + `\n<${logUrl}|session log>`;
            fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ channel: opts.slackChannel, thread_ts: opts.slackThreadTs, text: replyText }),
            }).catch((e) => console.warn(`[WARN] Slack reply failed: ${e}`));
          }
        }

        if (GH_TOKEN && opts.runCommentId && summary) {
          const body = spillOrTruncate(summary, 1000, 3000, (u) => `[Full response](${u})`) + `\n\n[Session log](${logUrl})`;
          fetch(`https://api.github.com/repos/AztecProtocol/aztec-packages/issues/comments/${opts.runCommentId}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          }).catch((e) => console.warn(`[WARN] GitHub comment update failed: ${e}`));
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

/** Parse "new" keyword and return effective prompt. */
function parseNewKeyword(parsed: ParseResult): { forceNew: boolean; prompt: string } {
  const prompt = parsed.type === "prompt" ? parsed.prompt : parsed.prompt;
  const forceNew = /^new\b/i.test(prompt);
  return { forceNew, prompt: forceNew ? prompt.replace(/^new\s+/i, "") : prompt };
}

/** Validate a session for resume. Returns error message or null if OK. */
function validateResumeSession(session: SessionMeta | null, hash: string): string | null {
  if (!session) return `Session \`${hash}\` not found.`;
  if (session.status === "running") return "Replies to ongoing conversations are not supported currently.";
  if (!session.claude_session_id || session.exit_code !== 0) return `Session \`${hash}\` is not resumable.`;
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

  // Resume logic only applies to thread replies, not top-level messages
  if (!forceNew && isReply) {
    if (parsed.type === "reply-hash") {
      const session = findSessionByHash(parsed.hash);
      const err = validateResumeSession(session, parsed.hash);
      if (err) { await say({ text: err, thread_ts: threadTs }); return; }
      console.log(`[REPLY-HASH] Resuming session ${parsed.hash}`);
      await startReplySession(client, channel, threadTs, parsed.prompt, session!, userName);
      return;
    }

    const prevSession = findLastSessionInThread(channel, threadTs);
    if (prevSession?.status === "running") {
      await say({ text: "Replies to ongoing conversations are not supported currently.", thread_ts: threadTs });
      return;
    }
    if (prevSession?.claude_session_id && prevSession.exit_code === 0) {
      console.log(`[REPLY] Resuming last session in thread: ${prevSession._log_id}`);
      await startReplySession(client, channel, threadTs, effectivePrompt, prevSession, userName);
      return;
    }
  }

  // New session (top-level message, forced new, or no resumable session in thread)
  const threadContext = isReply ? await getThreadContext(client, channel, threadTs) : "";
  await startNewSession(client, channel, threadTs, effectivePrompt, threadContext, userName);
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
    const err = validateResumeSession(session, parsed.hash);
    if (err) { await ack({ text: err }); return; }
    await ack({ text: `ClaudeBox replying to session \`${parsed.hash.slice(0, 8)}...\`: _${truncate(parsed.prompt)}_` });
    await startReplySession(client, channel, null, parsed.prompt, session!, userName);
  } else {
    await ack({ text: `ClaudeBox starting: _${truncate(effectivePrompt)}_` });
    await startNewSession(client, channel, null, effectivePrompt, "", userName);
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

    // Check if this is a reply (resume) request
    const parsed = body.resume_session_id ? null : parseMessage(prompt);
    let resumeSessionId = body.resume_session_id || "";
    let prevLogId = body.prev_log_id || "";

    // Auto-detect reply from prompt (e.g. "/claudebox <log_link> follow up")
    if (!resumeSessionId && parsed?.type === "reply-hash") {
      const prevSession = findSessionByHash(parsed.hash);
      if (prevSession?.claude_session_id) {
        resumeSessionId = prevSession.claude_session_id;
        prevLogId = parsed.hash;
      }
    }

    console.log(`[HTTP] POST /run user=${body.user ?? "?"} prompt=${truncate(prompt, 120)}${resumeSessionId ? " (resume)" : ""}`);

    // Stream output back as chunked text
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    });

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

    const exitCode = await runContainerSession(sessionOpts, (data) => {
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
