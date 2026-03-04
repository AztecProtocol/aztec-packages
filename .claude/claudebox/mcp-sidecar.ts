#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox MCP Sidecar — runs in its OWN container, shares workspace with Claude.
 *
 * Holds GH_TOKEN + SLACK_BOT_TOKEN. Claude's container never sees them.
 * Both containers mount the same /workspace and /reference-repo/.git.
 *
 * Tools: github_api (whitelisted), slack_api (whitelisted), create_pr,
 *        create_gist, linear_get_issue, linear_create_issue, session_status,
 *        get_context, ci_failures.
 *
 * Auth: token embedded in URL path (/mcp/<token>).
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { execFileSync, execFile, spawn, ChildProcess } from "child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { createHash } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ── Config ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.MCP_PORT || "9801", 10);
const GH_TOKEN = process.env.GH_TOKEN || "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
const WORKSPACE = process.env.WORKSPACE || "/workspace/aztec-packages";
const REPO = "AztecProtocol/aztec-packages";

const QUIET_MODE = process.env.CLAUDEBOX_QUIET === "1";
const CI_ALLOW = process.env.CLAUDEBOX_CI_ALLOW === "1";
const STATS_DIR = process.env.CLAUDEBOX_STATS_DIR || "/stats";

import { getSchema, allSchemas, schemasPrompt } from "./lib/stat-schemas.ts";

const SESSION_META = {
  log_id: process.env.CLAUDEBOX_LOG_ID || "",
  log_url: process.env.CLAUDEBOX_LOG_URL || "",
  user: process.env.CLAUDEBOX_USER || "",
  repo: REPO,
  comment_id: process.env.CLAUDEBOX_COMMENT_ID || "",
  run_comment_id: process.env.CLAUDEBOX_RUN_COMMENT_ID || "",
  run_url: process.env.CLAUDEBOX_RUN_URL || "",
  link: process.env.CLAUDEBOX_LINK || "",
  slack_channel: process.env.CLAUDEBOX_SLACK_CHANNEL || "",
  slack_thread_ts: process.env.CLAUDEBOX_SLACK_THREAD_TS || "",
  slack_message_ts: process.env.CLAUDEBOX_SLACK_MESSAGE_TS || "",
  base_branch: process.env.CLAUDEBOX_BASE_BRANCH || "next",
};

// ── Parse Slack permalink from link if no Slack coords provided ──
// Format: https://aztecprotocol.slack.com/archives/CHANNEL_ID/pTIMESTAMP
function parseSlackPermalink(link: string): { channel: string; thread_ts: string } | null {
  const m = link.match(/slack\.com\/archives\/([A-Z0-9]+)\/p(\d+)/);
  if (!m) return null;
  // Slack timestamps have a dot: first 10 digits are seconds, rest are microseconds
  const raw = m[2];
  const ts = raw.length > 10 ? raw.slice(0, 10) + "." + raw.slice(10) : raw;
  return { channel: m[1], thread_ts: ts };
}

// If we have a Slack link but no channel/message coords, extract them from the permalink
// and post a thread reply to claim a message we own for status updates
if (SLACK_BOT_TOKEN && SESSION_META.link && !SESSION_META.slack_channel) {
  const parsed = parseSlackPermalink(SESSION_META.link);
  if (parsed) {
    SESSION_META.slack_channel = parsed.channel;
    SESSION_META.slack_thread_ts = parsed.thread_ts;
    // We'll post our own reply in initSlackThreadReply() after the server starts
  }
}

// ── Session URLs (for Slack links) ──────────────────────────────
const CLAUDEBOX_HOST = process.env.CLAUDEBOX_HOST || "claudebox.work";
const WORKTREE_ID = process.env.CLAUDEBOX_WORKTREE_ID || "";
const statusPageUrl = WORKTREE_ID ? `https://${CLAUDEBOX_HOST}/s/${WORKTREE_ID}` : "";

// ── GitHub API whitelist ────────────────────────────────────────
// All repo paths are locked to AztecProtocol/aztec-packages.

const R = "repos/AztecProtocol/aztec-packages";
const GH_WHITELIST: Array<{ method: string; pattern: RegExp }> = [
  // PRs
  { method: "GET",   pattern: new RegExp(`^${R}/pulls(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/pulls/\\d+(/files|/reviews|/comments|/requested_reviewers)?$`) },
  { method: "POST",  pattern: new RegExp(`^${R}/pulls$`) },
  { method: "PATCH", pattern: new RegExp(`^${R}/pulls/\\d+$`) },
  // Labels
  { method: "POST",  pattern: new RegExp(`^${R}/issues/\\d+/labels$`) },
  // Issues & comments
  { method: "GET",   pattern: new RegExp(`^${R}/issues(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/\\d+(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/\\d+/timeline(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/\\d+/events(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/\\d+/comments(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/comments/\\d+$`) },
  { method: "PATCH", pattern: new RegExp(`^${R}/issues/comments/\\d+$`) },
  { method: "POST",  pattern: new RegExp(`^${R}/issues/\\d+/comments$`) },
  // Reactions
  { method: "POST",  pattern: new RegExp(`^${R}/issues/comments/\\d+/reactions$`) },
  // PRs — commits list
  { method: "GET",   pattern: new RegExp(`^${R}/pulls/\\d+/commits(\\?.*)?$`) },
  // Actions / CI
  { method: "GET",   pattern: new RegExp(`^${R}/actions/workflows(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/actions/runs(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/actions/runs/\\d+(/jobs|/logs)?(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/actions/workflows/[\\w.-]+/runs(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/actions/jobs/\\d+/logs$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/check-runs/\\d+(/annotations)?(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/check-suites/\\d+/check-runs(\\?.*)?$`) },
  // Commit statuses and check-runs
  { method: "GET",   pattern: new RegExp(`^${R}/commits/[a-f0-9]+/status(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/commits/[a-f0-9]+/check-runs(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/commits/[a-f0-9]+/check-suites(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/statuses/[a-f0-9]+(\\?.*)?$`) },
  // Contents, commits, compare, branches
  { method: "GET",   pattern: new RegExp(`^${R}/contents/.*$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/commits(/[^/]+)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/compare/.*$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/branches(/[^/]+)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/git/ref/.*$`) },
  // Contributors, assignees, collaborators
  { method: "GET",   pattern: new RegExp(`^${R}/contributors(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/assignees(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/collaborators(\\?.*)?$`) },
  // Users (global)
  { method: "GET",   pattern: /^users\/[^/]+(\/.*)?$/ },
  // Search
  { method: "GET",   pattern: /^search\/(issues|users|code|repositories)(\?.*)?$/ },
  // Gists
  { method: "POST",  pattern: /^gists$/ },
  { method: "PATCH", pattern: /^gists\/[a-f0-9]+$/ },
  { method: "GET",   pattern: /^gists(\/[a-f0-9]+)?(\?.*)?$/ },
];

function isGhAllowed(method: string, path: string): boolean {
  const clean = path.replace(/^\//, "");
  return GH_WHITELIST.some(r => r.method === method.toUpperCase() && r.pattern.test(clean));
}

// ── Slack API whitelist ─────────────────────────────────────────

// Only allow thread-scoped Slack operations — no channel history, no arbitrary reads
const SLACK_WHITELIST = new Set(["chat.postMessage", "chat.update", "reactions.add", "conversations.replies", "users.list"]);

// ── Git helper (runs locally in sidecar container) ──────────────

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: WORKSPACE, encoding: "utf-8", timeout: 60000 });
}

// ── Helpers ──────────────────────────────────────────────────────

/** Truncate text for Slack messages. */
function truncateForSlack(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

// ── Activity log (persisted to workspace for status page) ───────
const ACTIVITY_LOG = "/workspace/activity.jsonl";

function logActivity(type: string, text: string): void {
  try {
    appendFileSync(ACTIVITY_LOG, JSON.stringify({ ts: new Date().toISOString(), type, text }) + "\n");
  } catch {}
}

// ── Root comment state (sectioned by MCP tool) ─────────────────
let lastStatus = "";
let respondToUserCalled = false;

// Each section is updated independently by its MCP tool
const commentSections = {
  // session_status: latest status line (replaced each call, not appended)
  status: "" as string,
  // session_status: history of status updates
  statusLog: [] as Array<{ ts: string; text: string }>,
  // respond_to_user: final response
  response: "" as string,
  // create_pr / update_pr: tracked PRs
  // (uses trackedPRs map below)
  // linear_create_issue: tracked issues
  // (uses otherArtifacts below)
};

function addProgress(type: "status" | "response", text: string): void {
  if (type === "status") {
    commentSections.status = text;
    commentSections.statusLog.push({ ts: new Date().toISOString(), text });
  } else if (type === "response") {
    commentSections.response = text;
  }
}

// ── Claude transcript poller ────────────────────────────────────
// Polls the Claude JSONL transcript and surfaces assistant text messages
// to the activity log as "context" entries (shown differently from direct replies).
let transcriptPollTimer: ReturnType<typeof setInterval> | null = null;
let transcriptLinesRead = 0;
let transcriptInitialized = false;

function startTranscriptPoller(): void {
  const projDir = join(process.env.HOME || "/home/aztec-dev", ".claude", "projects", "-workspace");

  transcriptPollTimer = setInterval(() => {
    try {
      if (!existsSync(projDir)) return;
      // Find newest JSONL
      const files = readdirSync(projDir)
        .filter(f => f.endsWith(".jsonl"))
        .map(f => ({ name: f, mtime: statSync(join(projDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length === 0) return;

      const lines = readFileSync(join(projDir, files[0].name), "utf-8").split("\n").filter(l => l.trim());

      // On first poll, skip existing lines (avoids re-emitting on --fork-session resume)
      if (!transcriptInitialized) {
        transcriptLinesRead = lines.length;
        transcriptInitialized = true;
        return;
      }

      // Process only new lines since last poll
      for (let i = transcriptLinesRead; i < lines.length; i++) {
        try {
          const d = JSON.parse(lines[i]);
          if (d.type === "assistant" && Array.isArray(d.message?.content)) {
            for (const item of d.message.content) {
              if (item.type === "text" && item.text?.trim()) {
                logActivity("context", item.text.trim());
              }
            }
          }
        } catch {}
      }
      transcriptLinesRead = lines.length;
    } catch {}
  }, 5000); // Poll every 5 seconds
}

function stopTranscriptPoller(): void {
  if (transcriptPollTimer) { clearInterval(transcriptPollTimer); transcriptPollTimer = null; }
}

// Track PRs by number for deduplication; value = { title, url, action }
const trackedPRs = new Map<number, { title: string; url: string; action: string }>();
// Other artifacts (Linear issues, etc.)
const otherArtifacts: string[] = [];

function addTrackedPR(num: number, title: string, url: string, action: "created" | "updated") {
  const existing = trackedPRs.get(num);
  // "created" wins over "updated" (if we created it, keep that label)
  const finalAction = existing?.action === "created" ? "created" : action;
  trackedPRs.set(num, { title, url, action: finalAction });
}

function buildArtifactsGh(): string {
  const lines: string[] = [];
  if (trackedPRs.size > 0) {
    lines.push("**Pull Requests**");
    for (const [num, pr] of trackedPRs) {
      const label = pr.action === "created" ? "Created" : "Updated";
      lines.push(`- **${label}** [#${num}: ${pr.title}](${pr.url})`);
    }
  }
  if (otherArtifacts.length > 0) lines.push(...otherArtifacts);
  return lines.join("\n");
}

function buildArtifactsSlack(): string {
  const lines: string[] = [];
  for (const [num, pr] of trackedPRs) {
    const label = pr.action === "created" ? "Created" : "Updated";
    lines.push(`*${label}* <${pr.url}|#${num}: ${pr.title}>`);
  }
  if (otherArtifacts.length > 0) lines.push(...otherArtifacts);
  return lines.join("\n");
}

function buildGhBody(_latestStatus: string): string {
  const lines: string[] = [];

  // ── Header: links ──
  const links: string[] = [];
  if (statusPageUrl) links.push(`[Live status](${statusPageUrl})`);
  if (SESSION_META.log_url) links.push(`[Log](${SESSION_META.log_url})`);
  if (links.length) lines.push(links.join(" · "));

  // ── Section: Status (session_status) ──
  if (commentSections.status) {
    lines.push("");
    lines.push(`**Status:** ${commentSections.status}`);
  }

  // ── Section: Progress log (session_status history) ──
  if (commentSections.statusLog.length > 1) {
    lines.push("");
    lines.push("<details><summary>Progress</summary>");
    lines.push("");
    for (const entry of commentSections.statusLog) {
      const time = new Date(entry.ts).toISOString().slice(11, 16);
      let text = entry.text;
      if (text.length > 200) text = text.slice(0, 200) + "…";
      lines.push(`- \`${time}\` ${text}`);
    }
    lines.push("");
    lines.push("</details>");
  }

  // ── Section: Response (respond_to_user) ──
  if (commentSections.response) {
    lines.push("");
    lines.push(`**Response:** ${commentSections.response}`);
  }

  // ── Section: Artifacts (create_pr, update_pr, linear_create_issue) ──
  const artifacts = buildArtifactsGh();
  if (artifacts) {
    lines.push("");
    lines.push(artifacts);
  }

  return lines.join("\n");
}

function buildSlackText(status: string): string {
  const parts: string[] = [];

  // Status
  parts.push(truncateForSlack(status));

  // Response (from respond_to_user)
  if (commentSections.response) {
    const text = commentSections.response.length > 200
      ? commentSections.response.slice(0, 200) + "…"
      : commentSections.response;
    parts.push(`> ${text}`);
  }

  // Artifacts (PRs, issues)
  const artifacts = buildArtifactsSlack();
  if (artifacts) parts.push(artifacts);

  // Links
  const links: string[] = [];
  if (SESSION_META.log_url) links.push(`<${SESSION_META.log_url}|log>`);
  if (statusPageUrl) links.push(`<${statusPageUrl}|status>`);
  if (links.length) parts.push(links.join(" "));

  return parts.join("\n");
}

async function updateRootComment(status?: string): Promise<string[]> {
  const s = status ?? lastStatus;
  if (status) lastStatus = status;
  const results: string[] = [];

  if (SLACK_BOT_TOKEN && SESSION_META.slack_channel && SESSION_META.slack_message_ts) {
    try {
      const r = await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: SESSION_META.slack_channel, ts: SESSION_META.slack_message_ts,
          text: buildSlackText(s),
        }),
      });
      const d = await r.json() as any;
      results.push(d.ok ? "Slack updated" : `Slack: ${d.error}`);
    } catch (e: any) { results.push(`Slack: ${e.message}`); }
  }

  if (GH_TOKEN && SESSION_META.run_comment_id) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${SESSION_META.repo}/issues/comments/${SESSION_META.run_comment_id}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
          body: JSON.stringify({ body: buildGhBody(s) }),
        });
      results.push(r.ok ? "GitHub updated" : `GitHub: ${r.status}`);
    } catch (e: any) { results.push(`GitHub: ${e.message}`); }
  }

  return results;
}

// ── Create MCP Server ───────────────────────────────────────────

function createMcpServerWithTools(): McpServer {
  const server = new McpServer({ name: "claudebox-sidecar", version: "1.0.0" });

  // ── get_context ────────────────────────────────────────────────
  server.tool("get_context", "Session metadata: user, repo, log_url, trigger source, git ref, available tools.", {},
    async () => {
      // Strip empty values — only show what's relevant
      const ctx: Record<string, string> = {};
      for (const [k, v] of Object.entries(SESSION_META)) {
        if (v) ctx[k] = v;
      }
      ctx.tools = "clone_repo, respond_to_user, get_context, session_status, github_api, slack_api, create_pr, update_pr, create_gist, create_skill, ci_failures, linear_get_issue, linear_create_issue, record_stat";
      ctx.ci_allow = CI_ALLOW ? "true — you CAN modify .github/ workflow files" : "false — .github/ workflow files are blocked. If you need to propose CI changes, write them to .github-new/ instead.";
      return { content: [{ type: "text", text: JSON.stringify(ctx, null, 2) }] };
    });

  // ── clone_repo ───────────────────────────────────────────────

  /** Shared helper: checkout ref, init submodules, return status message. */
  function cloneRepoCheckoutAndInit(targetDir: string, ref: string): { text: string; isError?: boolean } {
    // Checkout the requested ref
    let checkedOutRef = ref;
    try {
      execFileSync("git", ["-C", targetDir, "checkout", "--detach", ref], {
        timeout: 30_000, stdio: "pipe",
      });
    } catch {
      // Ref not found locally — try fetching it
      try {
        execFileSync("git", ["-C", targetDir, "fetch", "origin", ref], {
          timeout: 120_000, stdio: "pipe",
        });
        execFileSync("git", ["-C", targetDir, "checkout", "--detach", "FETCH_HEAD"], {
          timeout: 30_000, stdio: "pipe",
        });
      } catch {
        // Last resort: fall back to origin/next but tell the user
        try {
          execFileSync("git", ["-C", targetDir, "checkout", "--detach", "origin/next"], {
            timeout: 30_000, stdio: "pipe",
          });
          checkedOutRef = "origin/next";
        } catch (e: any) {
          return { text: `Checkout failed for both ${ref} and origin/next: ${e.message}`, isError: true };
        }
      }
    }
    const head = execFileSync("git", ["-C", targetDir, "rev-parse", "--short", "HEAD"], {
      encoding: "utf-8", timeout: 5_000,
    }).trim();

    const refNote = checkedOutRef !== ref ? ` (WARNING: ${ref} not found, fell back to ${checkedOutRef})` : "";

    // Initialize/update submodules
    let submoduleMsg = "";
    try {
      execFileSync("git", ["-C", targetDir, "submodule", "update", "--init", "--recursive"], {
        timeout: 300_000, stdio: "pipe",
      });
      submoduleMsg = " Submodules initialized.";
    } catch (e: any) {
      submoduleMsg = ` ERROR: submodule init failed: ${e.message}. yarn-project builds will fail — try running: git submodule update --init --recursive`;
    }

    return { text: `${head}${refNote}.${submoduleMsg}` };
  }

  server.tool("clone_repo",
    "Clone the aztec-packages repo into /workspace/aztec-packages from the local reference repo. " +
    "Safe to call on resume — fetches new refs, updates submodules. Call FIRST before doing any work.",
    { ref: z.string().describe("Branch, tag, or commit hash to check out (e.g. 'origin/next', 'abc123')") },
    async ({ ref }) => {
      const targetDir = "/workspace/aztec-packages";
      const refGit = "/reference-repo/.git";

      if (existsSync(join(targetDir, ".git"))) {
        // Already cloned (resume session) — fetch, checkout, update submodules
        try {
          // Fetch latest refs so new commits/branches are available
          try {
            execFileSync("git", ["-C", targetDir, "fetch", "origin"], {
              timeout: 120_000, stdio: "pipe",
            });
          } catch { /* fetch failure is non-fatal — ref might already be local */ }

          const result = cloneRepoCheckoutAndInit(targetDir, ref);
          if (result.isError) {
            return { content: [{ type: "text", text: result.text }], isError: true };
          }
          return { content: [{ type: "text", text: `Repo already cloned. Checked out ${ref} (${result.text}) You can now work in /workspace/aztec-packages.` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Repo exists but operation failed: ${e.message}` }], isError: true };
        }
      }

      // Fresh clone
      try {
        execFileSync("git", ["config", "--global", "--add", "safe.directory", refGit], { timeout: 5_000 });
        execFileSync("git", ["config", "--global", "--add", "safe.directory", targetDir], { timeout: 5_000 });
        execFileSync("git", ["clone", "--shared", refGit, targetDir], {
          timeout: 120_000, stdio: "pipe",
        });
        execFileSync("git", ["-C", targetDir, "remote", "set-url", "origin",
          "https://github.com/AztecProtocol/aztec-packages.git"], { timeout: 5_000 });

        const result = cloneRepoCheckoutAndInit(targetDir, ref);
        if (result.isError) {
          return { content: [{ type: "text", text: `Clone succeeded but: ${result.text}` }], isError: true };
        }
        logActivity("clone", `Cloned repo at ${ref} (${result.text})`);
        return { content: [{ type: "text", text: `Cloned repo to ${targetDir} at ${ref} (${result.text}) You can now work in /workspace/aztec-packages.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Clone failed: ${e.message}` }], isError: true };
      }
    });

  // ── session_status ─────────────────────────────────────────────
  server.tool("session_status",
    "Update status in both Slack and GitHub. Log link + accumulated PR/issue links auto-appended.",
    { status: z.string().describe("Status text") },
    async ({ status }) => {
      logActivity("status", status);
      addProgress("status", status);
      const results = await updateRootComment(status);
      return { content: [{ type: "text", text: results.length ? results.join("\n") : "No channels configured" }] };
    });

  // ── respond_to_user ───────────────────────────────────────────
  server.tool("respond_to_user",
    `Send your final response to the user. Updates the Slack status message and GitHub comment in-place. You MUST call this before ending.

CRITICAL — Keep your message to 1-2 SHORT sentences. For anything complex, print details to stdout (they appear in the log) and include a log link in your message.

ALWAYS reference PRs and issues as full GitHub links (https://github.com/${REPO}/pull/123), never just "#123". This makes messages clickable in Slack.

PRs you create/update are automatically surfaced in the Slack status message, GitHub comment, and status page — you do NOT need to mention them again in your response unless adding context.

The log URL is in your context (get_context → log_url). Use it inline:
- GOOD: "Fixed flaky test — race condition in p2p layer."
- GOOD: "Found 3 PRs needing manual backport — <LOG_URL|see full analysis>"
- GOOD: "Build failed in yarn-project/pxe. <LOG_URL|error details>"
- BAD: "Created PR #5678" (not clickable, and PR is already shown in artifacts)

NEVER post tables, bullet lists, reports, code blocks, or multi-paragraph text here. Print verbose output to stdout and link to it.`,
    { message: z.string().describe("1-2 sentences MAX. Use full GitHub URLs for PRs/issues (https://github.com/AztecProtocol/aztec-packages/pull/123), not #123.") },
    async ({ message }) => {
      respondToUserCalled = true;
      logActivity("response", message);
      addProgress("response", message);

      // Always update root comment in-place (Slack + GitHub)
      const results = await updateRootComment(message);
      if (!results.length) results.push("No channels configured — message printed to log only");
      return { content: [{ type: "text", text: results.join("\n") }] };
    });

  // ── github_api ─────────────────────────────────────────────────
  server.tool("github_api",
    `GitHub REST API proxy (whitelisted paths). Auth attached automatically.
Use accept='application/vnd.github.v3.diff' for PR diffs.`,
    {
      method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
      path: z.string().describe("API path, e.g. repos/AztecProtocol/aztec-packages/pulls/123"),
      body: z.any().optional().describe("Request body for POST/PATCH/PUT"),
      accept: z.string().optional().describe("Accept header override"),
    },
    async ({ method, path, body, accept }) => {
      if (!isGhAllowed(method, path))
        return { content: [{ type: "text", text: `Blocked: ${method} ${path} not whitelisted` }], isError: true };
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      try {
        const url = `https://api.github.com/${path.replace(/^\//, "")}`;
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: accept || "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        if (!res.ok)
          return { content: [{ type: "text", text: `${res.status}: ${text.slice(0, 2000)}` }], isError: true };
        const maxLen = 100_000;
        return { content: [{ type: "text", text: text.length > maxLen ? text.slice(0, maxLen) + "\n...(truncated)" : text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: e.message }], isError: true };
      }
    });

  // ── slack_api ──────────────────────────────────────────────────
  server.tool("slack_api",
    `Slack Web API proxy. Whitelisted: ${[...SLACK_WHITELIST].join(", ")}.
channel and thread_ts auto-injected from session if not provided.`,
    {
      method: z.string().describe("e.g. chat.postMessage"),
      args: z.record(z.any()).describe("Method arguments"),
    },
    async ({ method, args }) => {
      if (!SLACK_BOT_TOKEN) return { content: [{ type: "text", text: "No SLACK_BOT_TOKEN" }], isError: true };
      if (!SLACK_WHITELIST.has(method))
        return { content: [{ type: "text", text: `Blocked: ${method}. Allowed: ${[...SLACK_WHITELIST].join(", ")}` }], isError: true };
      if (QUIET_MODE && method === "chat.postMessage")
        return { content: [{ type: "text", text: "Quiet mode active — use respond_to_user to send your response" }], isError: true };

      const payload = { ...args };

      // Enforce thread scoping — only allow access to the session's own thread
      // Force channel to session's channel (no cross-channel access)
      if (method !== "users.list") {
        if (!SESSION_META.slack_channel)
          return { content: [{ type: "text", text: "No Slack channel configured for this session" }], isError: true };
        payload.channel = SESSION_META.slack_channel;
      }
      // Force thread_ts / ts to session's thread (no cross-thread access)
      if (method === "chat.postMessage") {
        if (!SESSION_META.slack_thread_ts)
          return { content: [{ type: "text", text: "No Slack thread configured — use respond_to_user instead" }], isError: true };
        payload.thread_ts = SESSION_META.slack_thread_ts;
      }
      if (method === "chat.update") {
        if (!SESSION_META.slack_message_ts)
          return { content: [{ type: "text", text: "No Slack message to update" }], isError: true };
        payload.ts = SESSION_META.slack_message_ts;
      }
      if (method === "conversations.replies") {
        if (!SESSION_META.slack_thread_ts)
          return { content: [{ type: "text", text: "No Slack thread configured for this session" }], isError: true };
        payload.ts = SESSION_META.slack_thread_ts;
      }

      try {
        // Read methods need GET with query params (Slack rejects JSON body for these)
        const READ_METHODS = new Set(["conversations.replies"]);
        const isRead = READ_METHODS.has(method);
        const url = isRead
          ? `https://slack.com/api/${method}?${new URLSearchParams(Object.entries(payload).map(([k, v]) => [k, String(v)])).toString()}`
          : `https://slack.com/api/${method}`;
        const res = await fetch(url, {
          method: isRead ? "GET" : "POST",
          headers: isRead
            ? { Authorization: `Bearer ${SLACK_BOT_TOKEN}` }
            : { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          ...(!isRead && { body: JSON.stringify(payload) }),
        });
        const d = await res.json() as any;
        if (!d.ok) {
          const hints: Record<string, string> = {
            not_in_channel: " (bot not invited to this channel — use your session's own channel instead)",
            missing_scope: ` (need: ${d.needed || "unknown"}, have: ${d.provided || "unknown"})`,
            channel_not_found: " (channel ID may be wrong — check get_context for your session's channel)",
          };
          return { content: [{ type: "text", text: `${method}: ${d.error}${hints[d.error] || ""}` }], isError: true };
        }
        if (isRead) {
          const text = JSON.stringify(d, null, 2);
          const maxLen = 50_000;
          return { content: [{ type: "text", text: text.length > maxLen ? text.slice(0, maxLen) + "\n...(truncated)" : text }] };
        }
        return { content: [{ type: "text", text: `OK${d.ts ? ` (ts: ${d.ts})` : ""}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: e.message }], isError: true };
      }
    });

  // ── create_pr ──────────────────────────────────────────────────
  server.tool("create_pr",
    "Push workspace commits and create a draft PR. Always creates draft PRs. WARNING: .claude/ files are blocked by default — pass include_claude_files=true ONLY if your PR intentionally modifies ClaudeBox infrastructure. .github/ workflow files are also blocked unless the session was started with 'ci-allow'. If blocked, copy CI changes to .github-new/ instead.",
    {
      title: z.string().describe("PR title"),
      body: z.string().describe("PR description"),
      base: z.string().default("next").describe("Base branch"),
      closes: z.array(z.number()).optional().describe("Issue numbers to close, e.g. [123, 456]"),
      include_claude_files: z.boolean().optional().describe("Force-include .claude/ files in the commit. Only use for PRs that intentionally modify ClaudeBox infra."),
      include_noir_submodule: z.boolean().optional().describe("Force-include noir/noir-repo submodule changes. Only use if the PR intentionally updates the Noir submodule."),
      force_push: z.boolean().optional().describe("Force-push to the branch (git push --force). Use when you need to overwrite the remote branch, e.g. after a rebase or amend."),
    },
    async ({ title, body, base, closes, include_claude_files, include_noir_submodule, force_push }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };
      if (!/^[\w./-]+$/.test(base))
        return { content: [{ type: "text", text: `Invalid base: ${base}` }], isError: true };
      if (/^(master|main)$/.test(base))
        return { content: [{ type: "text", text: `Blocked: never target '${base}'. Use 'next', a merge-train branch, or a version branch (e.g. 'v4').` }], isError: true };

      try {
        const branch = `claudebox/${SESSION_META.log_id || Date.now()}`;

        // Auto-commit uncommitted changes
        try {
          git("add", "-A");
          git("diff", "--cached", "--quiet");
        } catch {
          // Block .claude/ files unless explicitly forced
          const staged = git("diff", "--cached", "--name-only").trim();
          const claudeFiles = staged.split("\n").filter(f => f.startsWith(".claude/"));
          if (claudeFiles.length > 0 && !include_claude_files) {
            git("reset", "HEAD", "--", ".claude");
            return { content: [{ type: "text", text: `Blocked: your commit includes .claude/ files (${claudeFiles.join(", ")}). Run 'git checkout -- .claude' to discard those changes, then retry. If this PR intentionally modifies .claude/ infra, pass include_claude_files=true.` }], isError: true };
          }
          // Block .github/ workflow files unless ci-allow is set
          const ciFiles = staged.split("\n").filter(f => f.startsWith(".github/"));
          if (ciFiles.length > 0 && !CI_ALLOW) {
            git("reset", "HEAD", "--", ".github");
            return { content: [{ type: "text", text: `Blocked: your commit includes .github/ workflow files (${ciFiles.join(", ")}). CI workflow changes require the 'ci-allow' prefix in the prompt. Copy your changes to .github-new/ instead so they can be reviewed and applied manually.` }], isError: true };
          }
          git("commit", "-m", title);
        }

        // Check we have commits beyond base
        let logOutput: string;
        try {
          logOutput = git("log", "--oneline", `origin/${base}..HEAD`);
        } catch {
          logOutput = git("log", "--oneline", "-5");
        }
        if (!logOutput.trim())
          return { content: [{ type: "text", text: "No commits to push" }], isError: true };

        // Block noir submodule changes unless explicitly forced
        if (!include_noir_submodule) {
          try {
            const diff = git("diff", "--name-only", `origin/${base}...HEAD`);
            if (diff.split("\n").some(f => f.trim() === "noir/noir-repo")) {
              return { content: [{ type: "text", text: `Blocked: your commits change the noir/noir-repo submodule. Noir submodule updates require follow-on steps (see noir-sync-update skill) and should not be pushed accidentally. If this is intentional, pass include_noir_submodule=true.` }], isError: true };
            }
          } catch {}
        }

        // Push — token in URL, never on disk. execFileSync avoids shell.
        const pushUrl = `https://x-access-token:${GH_TOKEN}@github.com/${SESSION_META.repo}.git`;
        const pushArgs = ["push", ...(force_push ? ["--force"] : []), pushUrl, `HEAD:refs/heads/${branch}`];
        execFileSync("git", pushArgs, {
          cwd: WORKSPACE, encoding: "utf-8", timeout: 120000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });

        // Create PR
        const prRes = await fetch(`https://api.github.com/repos/${SESSION_META.repo}/pulls`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title, base, draft: true, head: branch,
            body: body
              + (closes?.length ? "\n\n" + closes.map(n => `Closes #${n}`).join("\n") : "")
              + (SESSION_META.log_url ? `\n\n[ClaudeBox log](${SESSION_META.log_url})` : ""),
          }),
        });
        const pr = await prRes.json() as any;
        if (!prRes.ok)
          return { content: [{ type: "text", text: `PR failed: ${pr.message || JSON.stringify(pr)}` }], isError: true };

        // Add claudebox label
        try {
          await fetch(`https://api.github.com/repos/${SESSION_META.repo}/issues/${pr.number}/labels`, {
            method: "POST",
            headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
            body: JSON.stringify({ labels: ["claudebox"] }),
          });
        } catch {}

        // Track PR and update status postamble
        addTrackedPR(pr.number, title, pr.html_url, "created");
        logActivity("artifact", `- [PR #${pr.number}: ${title}](${pr.html_url})`);
        await updateRootComment();

        return { content: [{ type: "text", text: `${pr.html_url}\nBranch: ${branch}\n#${pr.number}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_pr: ${e.message}` }], isError: true };
      }
    });

  // ── update_pr ────────────────────────────────────────────────
  server.tool("update_pr",
    "Push workspace commits and/or update an existing PR. Only works on PRs with the 'claudebox' label. Use push=true to push current commits to the PR branch. WARNING: .claude/ files are blocked by default — pass include_claude_files=true ONLY if your PR intentionally modifies ClaudeBox infrastructure. .github/ workflow files are also blocked unless the session was started with 'ci-allow'.",
    {
      pr_number: z.number().describe("PR number"),
      push: z.boolean().optional().describe("Push current workspace commits to the PR's branch"),
      title: z.string().optional().describe("New title"),
      body: z.string().optional().describe("New body"),
      base: z.string().optional().describe("New base branch"),
      state: z.enum(["open", "closed"]).optional().describe("PR state"),
      include_claude_files: z.boolean().optional().describe("Force-include .claude/ files in the commit. Only use for PRs that intentionally modify ClaudeBox infra."),
      include_noir_submodule: z.boolean().optional().describe("Force-include noir/noir-repo submodule changes. Only use if the PR intentionally updates the Noir submodule."),
      force_push: z.boolean().optional().describe("Force-push to the branch (git push --force). Use when you need to overwrite the remote branch, e.g. after a rebase or amend."),
    },
    async ({ pr_number, push, title, body, base, state, include_claude_files, include_noir_submodule, force_push }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      try {
        // Fetch PR and verify claudebox label
        const prRes = await fetch(`https://api.github.com/repos/${SESSION_META.repo}/pulls/${pr_number}`, {
          headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json" },
        });
        if (!prRes.ok) return { content: [{ type: "text", text: `PR #${pr_number} not found` }], isError: true };
        const prData = await prRes.json() as any;
        const labels: string[] = (prData.labels || []).map((l: any) => l.name);
        if (!labels.includes("claudebox"))
          return { content: [{ type: "text", text: `PR #${pr_number} does not have the 'claudebox' label. Can only update claudebox PRs.` }], isError: true };

        const results: string[] = [];

        // Push commits to the PR's branch
        if (push) {
          const branch = prData.head?.ref;
          if (!branch) return { content: [{ type: "text", text: "Cannot determine PR branch" }], isError: true };

          // Auto-commit uncommitted changes
          try {
            git("add", "-A");
            git("diff", "--cached", "--quiet");
          } catch {
            const staged = git("diff", "--cached", "--name-only").trim();
            const claudeFiles = staged.split("\n").filter(f => f.startsWith(".claude/"));
            if (claudeFiles.length > 0 && !include_claude_files) {
              git("reset", "HEAD", "--", ".claude");
              return { content: [{ type: "text", text: `Blocked: your commit includes .claude/ files (${claudeFiles.join(", ")}). Run 'git checkout -- .claude' to discard those changes, then retry. If this PR intentionally modifies .claude/ infra, pass include_claude_files=true.` }], isError: true };
            }
            const ciFiles = staged.split("\n").filter(f => f.startsWith(".github/"));
            if (ciFiles.length > 0 && !CI_ALLOW) {
              git("reset", "HEAD", "--", ".github");
              return { content: [{ type: "text", text: `Blocked: your commit includes .github/ workflow files (${ciFiles.join(", ")}). CI workflow changes require the 'ci-allow' prefix in the prompt. Copy your changes to .github-new/ instead so they can be reviewed and applied manually.` }], isError: true };
            }
            git("commit", "-m", title || `update PR #${pr_number}`);
          }

          // Block noir submodule changes unless explicitly forced
          const prBase = prData.base?.ref || "next";
          if (!include_noir_submodule) {
            try {
              const diff = git("diff", "--name-only", `origin/${prBase}...HEAD`);
              if (diff.split("\n").some(f => f.trim() === "noir/noir-repo")) {
                return { content: [{ type: "text", text: `Blocked: your commits change the noir/noir-repo submodule. Noir submodule updates require follow-on steps (see noir-sync-update skill) and should not be pushed accidentally. If this is intentional, pass include_noir_submodule=true.` }], isError: true };
              }
            } catch {}
          }

          const pushUrl = `https://x-access-token:${GH_TOKEN}@github.com/${SESSION_META.repo}.git`;
          const pushArgs = ["push", ...(force_push ? ["--force"] : []), pushUrl, `HEAD:refs/heads/${branch}`];
          execFileSync("git", pushArgs, {
            cwd: WORKSPACE, encoding: "utf-8", timeout: 120000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          });
          results.push(`${force_push ? "Force-pushed" : "Pushed"} to ${branch}`);
        }

        // Update PR metadata
        if (base && /^(master|main)$/.test(base))
          return { content: [{ type: "text", text: `Blocked: never target '${base}'. Use 'next', a merge-train branch, or a version branch (e.g. 'v4').` }], isError: true };
        const update: any = {};
        if (title) update.title = title;
        if (body) update.body = body;
        if (base) update.base = base;
        if (state) update.state = state;

        if (Object.keys(update).length > 0) {
          const res = await fetch(`https://api.github.com/repos/${SESSION_META.repo}/pulls/${pr_number}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
            body: JSON.stringify(update),
          });
          const result = await res.json() as any;
          if (!res.ok)
            return { content: [{ type: "text", text: `Update failed: ${result.message || JSON.stringify(result)}` }], isError: true };
          results.push(`Updated PR metadata`);
        }

        if (results.length === 0)
          return { content: [{ type: "text", text: "Nothing to do — specify push=true or fields to update" }], isError: true };

        // Track PR and update status postamble
        const prTitle = title || prData.title || `PR #${pr_number}`;
        addTrackedPR(pr_number, prTitle, prData.html_url, "updated");
        logActivity("artifact", `- [PR #${pr_number}: ${prTitle}](${prData.html_url}) (updated)`);
        await updateRootComment();

        return { content: [{ type: "text", text: `PR #${pr_number}: ${results.join(", ")}\n${prData.html_url}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `update_pr: ${e.message}` }], isError: true };
      }
    });

  // ── linear_get_issue ───────────────────────────────────────────
  server.tool("linear_get_issue",
    "Fetch a Linear issue by identifier (e.g. UNIFIED-26). Returns title, description, state, assignee, labels, and URL.",
    { identifier: z.string().describe("Issue identifier, e.g. UNIFIED-26 or ENG-1234") },
    async ({ identifier }) => {
      if (!LINEAR_API_KEY) return { content: [{ type: "text", text: "No LINEAR_API_KEY" }], isError: true };

      // Parse "TEAM-123" into team key + number
      const m = identifier.match(/^([A-Za-z][\w-]*)-(\d+)$/);
      if (!m) return { content: [{ type: "text", text: `Invalid identifier: ${identifier}` }], isError: true };
      const number = parseInt(m[2], 10);

      try {
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: LINEAR_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query($filter: IssueFilter) {
              issues(filter: $filter, first: 1) {
                nodes {
                  identifier title description url
                  state { name }
                  assignee { name }
                  labels { nodes { name } }
                  priority priorityLabel
                  comments { nodes { body user { name } createdAt } }
                }
              }
            }`,
            variables: { filter: { number: { eq: number }, team: { key: { eq: m[1].toUpperCase() } } } },
          }),
        });
        const json = await res.json() as any;
        const issue = json?.data?.issues?.nodes?.[0];
        if (!issue) return { content: [{ type: "text", text: `Issue ${identifier} not found` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Linear API error: ${e.message}` }], isError: true };
      }
    });

  // ── linear_create_issue ────────────────────────────────────────
  server.tool("linear_create_issue",
    "Create a new Linear issue. Returns the issue identifier and URL.",
    {
      team: z.string().describe("Team key: A (Alpha - sequencer/nodes), AVM (Bonobos - AVM), NOIR (Noir compiler), F (Fairies), GK (Gurkhas), CRY (Crypto), TRIAGE, ECODR (Ecosystem/DevRel), TMNT"),
      title: z.string().describe("Issue title"),
      description: z.string().optional().describe("Markdown description"),
      priority: z.number().min(0).max(4).optional().describe("0=none, 1=urgent, 2=high, 3=medium, 4=low"),
    },
    async ({ team, title, description, priority }) => {
      if (!LINEAR_API_KEY) return { content: [{ type: "text", text: "No LINEAR_API_KEY" }], isError: true };

      try {
        // Look up team ID from key
        const teamRes = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: LINEAR_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`,
            variables: { key: team.toUpperCase() },
          }),
        });
        const teamJson = await teamRes.json() as any;
        const teamId = teamJson?.data?.teams?.nodes?.[0]?.id;
        if (!teamId) return { content: [{ type: "text", text: `Team '${team}' not found` }], isError: true };

        const input: any = { teamId, title };
        if (description) input.description = description;
        if (priority !== undefined) input.priority = priority;

        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: LINEAR_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `mutation($input: IssueCreateInput!) {
              issueCreate(input: $input) {
                success
                issue { identifier title url }
              }
            }`,
            variables: { input },
          }),
        });
        const json = await res.json() as any;
        const result = json?.data?.issueCreate;
        if (!result?.success) return { content: [{ type: "text", text: `Failed: ${JSON.stringify(json.errors || json)}` }], isError: true };

        // Auto-post issue to root comment
        const issueLink = `${result.issue.identifier}: ${result.issue.title} — ${result.issue.url}`;
        otherArtifacts.push(`- [${result.issue.identifier}: ${result.issue.title}](${result.issue.url})`);
        logActivity("artifact", issueLink);
        await updateRootComment();

        return { content: [{ type: "text", text: `${result.issue.identifier}: ${result.issue.title}\n${result.issue.url}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Linear API error: ${e.message}` }], isError: true };
      }
    });

  // ── ci_failures ──────────────────────────────────────────────────
  server.tool("ci_failures",
    `CI status for a PR. Shows the CI3 workflow status on both the PR branch and merge-queue: last pass, last fail, with GitHub Actions links. CI dashboard link included.`,
    { pr: z.number().describe("PR number") },
    async ({ pr }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      const ghGet = async (path: string) => {
        const res = await fetch(`https://api.github.com/${path}`, {
          headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json" },
        });
        if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
        return res.json() as any;
      };

      // Format a workflow run as a one-liner with GitHub link
      const fmtRun = (r: any) =>
        `${r.conclusion ?? r.status} | ${r.head_sha?.slice(0, 10)} | ${r.created_at}\n  https://github.com/${REPO}/actions/runs/${r.id}`;

      try {
        // PR metadata
        const prData = await ghGet(`repos/${REPO}/pulls/${pr}`);
        const branch = prData.head.ref as string;
        const base = prData.base.ref as string;
        const prUrl = `https://github.com/${REPO}/pull/${pr}`;

        // CI3 workflow runs on PR branch (recent, any status)
        const prRuns = await ghGet(
          `repos/${REPO}/actions/workflows/ci3.yml/runs?branch=${encodeURIComponent(branch)}&per_page=20`
        );
        const prWorkflows: any[] = prRuns.workflow_runs ?? [];
        const prLastPass = prWorkflows.find((r: any) => r.conclusion === "success");
        const prLastFail = prWorkflows.find((r: any) => r.conclusion === "failure");
        const prLatest = prWorkflows[0]; // most recent regardless of status

        // CI3 workflow runs in merge-queue for this PR
        // Merge-queue branches: gh-readonly-queue/{base}/pr-{number}-{sha}
        let mqLastPass: any = null;
        let mqLastFail: any = null;
        let mqLatest: any = null;
        try {
          const mqRuns = await ghGet(
            `repos/${REPO}/actions/workflows/ci3.yml/runs?event=merge_group&per_page=30`
          );
          const mqForPr = (mqRuns.workflow_runs ?? []).filter(
            (r: any) => r.head_branch?.includes(`pr-${pr}-`)
          );
          mqLatest = mqForPr[0];
          mqLastPass = mqForPr.find((r: any) => r.conclusion === "success");
          mqLastFail = mqForPr.find((r: any) => r.conclusion === "failure");
        } catch {}

        const ciDashboard = `http://ci.aztec-labs.com/section/prs?filter=${encodeURIComponent(branch)}`;

        const lines: string[] = [];
        lines.push(`## PR #${pr}: ${prData.title}`);
        lines.push(`${prUrl}`);
        lines.push(`Branch: ${branch} → ${base}`);
        lines.push(`CI Dashboard: ${ciDashboard}`);
        lines.push("");

        lines.push("### PR Branch (CI3)");
        if (prLatest) {
          lines.push(`Latest: ${fmtRun(prLatest)}`);
        }
        if (prLastFail && prLastFail !== prLatest) {
          lines.push(`Last fail: ${fmtRun(prLastFail)}`);
        }
        if (prLastPass && prLastPass !== prLatest) {
          lines.push(`Last pass: ${fmtRun(prLastPass)}`);
        }
        if (!prLatest) lines.push("No CI3 runs found");
        lines.push("");

        lines.push("### Merge Queue (CI3)");
        if (mqLatest) {
          lines.push(`Latest: ${fmtRun(mqLatest)}`);
        }
        if (mqLastFail && mqLastFail !== mqLatest) {
          lines.push(`Last fail: ${fmtRun(mqLastFail)}`);
        }
        if (mqLastPass && mqLastPass !== mqLatest) {
          lines.push(`Last pass: ${fmtRun(mqLastPass)}`);
        }
        if (!mqLatest) lines.push("No merge-queue CI3 runs found for this PR");

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `ci_failures: ${e.message}` }], isError: true };
      }
    });

  // ── record_stat ──────────────────────────────────────────────────
  server.tool("record_stat",
    `Record a structured data point. Appends to /stats/<schema>.jsonl. Auto-adds _ts, _log_id, _worktree_id.\n\nAvailable schemas:\n${schemasPrompt()}`,
    {
      schema: z.string().describe(`Schema name: ${allSchemas().map(s => s.name).join(", ")}`),
      data: z.record(z.any()).describe("Data object matching the schema fields"),
    },
    async ({ schema, data }) => {
      const s = getSchema(schema);
      if (!s) return { content: [{ type: "text", text: `Unknown schema '${schema}'. Available: ${allSchemas().map(s => s.name).join(", ")}` }], isError: true };

      const entry = {
        _ts: new Date().toISOString(),
        _log_id: SESSION_META.log_id,
        _worktree_id: process.env.CLAUDEBOX_WORKTREE_ID || "",
        _user: SESSION_META.user,
        ...data,
      };

      try {
        mkdirSync(STATS_DIR, { recursive: true });
        const file = join(STATS_DIR, `${schema}.jsonl`);
        appendFileSync(file, JSON.stringify(entry) + "\n");
        return { content: [{ type: "text", text: `Recorded ${schema} entry (${Object.keys(data).length} fields)` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Failed to write stat: ${e.message}` }], isError: true };
      }
    });

  // ── create_gist ──────────────────────────────────────────────────
  server.tool("create_gist",
    "Create a GitHub gist. Useful for sharing verbose output, logs, or large data that doesn't belong in a Slack message or PR description.",
    {
      description: z.string().describe("Short description of the gist"),
      files: z.record(z.string()).describe("Map of filename → content, e.g. {\"output.log\": \"...\", \"analysis.md\": \"...\"}"),
      public_gist: z.boolean().default(false).describe("Whether the gist is public (default: false/secret)"),
    },
    async ({ description, files, public_gist }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      const gistFiles: Record<string, { content: string }> = {};
      for (const [name, content] of Object.entries(files)) {
        gistFiles[name] = { content };
      }

      try {
        const res = await fetch("https://api.github.com/gists", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ description, files: gistFiles, public: public_gist }),
        });
        const gist = await res.json() as any;
        if (!res.ok)
          return { content: [{ type: "text", text: `Gist failed: ${gist.message || JSON.stringify(gist)}` }], isError: true };

        logActivity("artifact", `Gist: ${gist.html_url}`);
        return { content: [{ type: "text", text: `${gist.html_url}\nID: ${gist.id}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_gist: ${e.message}` }], isError: true };
      }
    });

  // ── create_skill ──────────────────────────────────────────────
  server.tool("create_skill",
    `Create or update a Claude Code skill. Writes .claude/skills/<name>/SKILL.md, commits, and pushes.

A skill is a reusable prompt that Claude Code users invoke with /<name>. Skills have YAML frontmatter and a markdown body.

Example:
  name: "review-pr"
  description: "Review a PR for correctness, style, and security"
  argument_hint: "<PR number>"
  body: "# Review PR\\n\\n## Steps\\n1. Fetch the PR diff...\\n2. Check for..."

The body should be detailed, step-by-step instructions that Claude follows when the skill is invoked.`,
    {
      name: z.string().regex(/^[a-z0-9-]+$/).describe("Skill name (lowercase, hyphens only). Used as /<name> command."),
      description: z.string().describe("One-line description shown in skill listings"),
      argument_hint: z.string().optional().describe("Hint for arguments, e.g. '<PR number>' or '<url-or-hash>'"),
      body: z.string().describe("Markdown body with detailed instructions for Claude to follow"),
    },
    async ({ name, description, argument_hint, body }) => {
      const skillDir = join(WORKSPACE, ".claude", "skills", name);
      const skillFile = join(skillDir, "SKILL.md");

      let frontmatter = `---\nname: ${name}\ndescription: ${description}\n`;
      if (argument_hint) frontmatter += `argument-hint: ${argument_hint}\n`;
      frontmatter += `---\n\n`;

      const content = frontmatter + body;
      const action = existsSync(skillFile) ? "Updated" : "Created";

      try {
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(skillFile, content);

        git("add", skillFile);
        git("commit", "-m", `chore: ${action.toLowerCase()} skill /${name}`);
        const branch = git("rev-parse", "--abbrev-ref", "HEAD").trim();
        git("push", "origin", branch);

        logActivity("artifact", `${action} skill [/${name}](https://github.com/${REPO}/blob/${branch}/.claude/skills/${name}/SKILL.md)`);
        return { content: [{ type: "text", text: `${action} skill /${name} at .claude/skills/${name}/SKILL.md — committed and pushed to ${branch}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_skill: ${e.message}` }], isError: true };
      }
    });

  return server;
}

// ── HTTP Server ─────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

const MCP_PATH = "/mcp";

// ── HTTP Server ─────────────────────────────────────────────────

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    return;
  }

  if (req.url === MCP_PATH && req.method === "POST") {
    try {
      const bodyStr = await readBody(req);
      const body = JSON.parse(bodyStr);
      const server = createMcpServerWithTools();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    } catch (error: any) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
      }
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

/** Claim a Slack message for status updates from a parsed permalink.
 *  Try to update the linked message directly (we own it if it's a ClaudeBox message).
 *  If that fails, post a thread reply we do own. */
async function initSlackFromPermalink(): Promise<void> {
  if (!SLACK_BOT_TOKEN || !SESSION_META.slack_channel || !SESSION_META.slack_thread_ts || SESSION_META.slack_message_ts) return;
  const initText = buildSlackText("Starting…");
  const headers = { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" };

  // Try updating the linked message directly (works if the bot owns it)
  try {
    const r = await fetch("https://slack.com/api/chat.update", {
      method: "POST", headers,
      body: JSON.stringify({ channel: SESSION_META.slack_channel, ts: SESSION_META.slack_thread_ts, text: initText }),
    });
    const d = await r.json() as any;
    if (d.ok) {
      SESSION_META.slack_message_ts = SESSION_META.slack_thread_ts;
      console.log(`[Sidecar] Updated linked message directly in ${SESSION_META.slack_channel}, ts=${SESSION_META.slack_thread_ts}`);
      return;
    }
    console.log(`[Sidecar] Can't update linked message (${d.error}), posting thread reply`);
  } catch (e: any) {
    console.log(`[Sidecar] Can't update linked message (${e.message}), posting thread reply`);
  }

  // Fall back: post a thread reply we own
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST", headers,
      body: JSON.stringify({ channel: SESSION_META.slack_channel, thread_ts: SESSION_META.slack_thread_ts, text: initText }),
    });
    const d = await r.json() as any;
    if (d.ok && d.ts) {
      SESSION_META.slack_message_ts = d.ts;
      console.log(`[Sidecar] Posted thread reply in ${SESSION_META.slack_channel}, ts=${d.ts}`);
    } else {
      console.error(`[Sidecar] Failed to post thread reply: ${d.error}`);
    }
  } catch (e: any) {
    console.error(`[Sidecar] Failed to post thread reply: ${e.message}`);
  }
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[Sidecar] :${PORT} gh=${GH_TOKEN ? "yes" : "no"} slack=${SLACK_BOT_TOKEN ? "yes" : "no"} linear=${LINEAR_API_KEY ? "yes" : "no"} quiet=${QUIET_MODE ? "yes" : "no"} ci_allow=${CI_ALLOW ? "yes" : "no"} docker=${existsSync("/var/run/docker.sock") ? "yes" : "no"}`);
  // If we parsed a Slack permalink, claim it (update directly or reply in thread)
  initSlackFromPermalink();
  // Start polling Claude's JSONL transcript for assistant messages
  startTranscriptPoller();
});

/** Build a completion summary from the transcript and activity log. */
function buildCompletionSummary(): string {
  const parts: string[] = [];

  // Collect the last respond_to_user message if it exists
  if (respondToUserCalled && lastStatus) {
    return lastStatus; // respond_to_user already set a good final status
  }

  // Otherwise build from transcript
  try {
    const projDir = join(process.env.HOME || "/home/aztec-dev", ".claude", "projects", "-workspace");
    if (existsSync(projDir)) {
      const files = readdirSync(projDir)
        .filter(f => f.endsWith(".jsonl"))
        .map(f => ({ name: f, mtime: statSync(join(projDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) {
        const lines = readFileSync(join(projDir, files[0].name), "utf-8").split("\n").filter(l => l.trim());
        // Walk backwards to find last assistant text
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const d = JSON.parse(lines[i]);
            if (d.type === "assistant" && Array.isArray(d.message?.content)) {
              for (const item of d.message.content) {
                if (item.type === "text" && item.text?.trim()) {
                  parts.push(item.text.trim());
                  break;
                }
              }
              if (parts.length) break;
            }
          } catch {}
        }
      }
    }
  } catch {}

  // Add artifact summary
  const artifactCount = trackedPRs.size + otherArtifacts.length;
  if (artifactCount > 0) {
    const prList = [...trackedPRs.entries()].map(([num, pr]) =>
      `${pr.action === "created" ? "created" : "updated"} #${num}`
    );
    if (prList.length) parts.push(`PRs: ${prList.join(", ")}`);
  }

  if (parts.length === 0) return "Session completed";
  return parts.join(" | ");
}

/** DM the session author on Slack with a completion summary.
 *  Skips if the session was triggered from a DM (already updating in-place there). */
async function dmAuthorOnCompletion(): Promise<void> {
  if (!SLACK_BOT_TOKEN || !SESSION_META.user) return;
  // If we're already in the user's DM, the in-place status update is enough
  if (SESSION_META.slack_channel && SESSION_META.slack_channel.startsWith("D")) return;
  try {
    // Build a short summary with links
    const parts: string[] = [];
    if (commentSections.response) {
      parts.push(commentSections.response);
    } else {
      parts.push("Session completed.");
    }
    // Add artifact links
    for (const [num, pr] of trackedPRs) {
      const label = pr.action === "created" ? "Created" : "Updated";
      parts.push(`${label}: <${pr.url}|#${num}: ${pr.title}>`);
    }
    const links: string[] = [];
    if (statusPageUrl) links.push(`<${statusPageUrl}|status>`);
    if (SESSION_META.log_url) links.push(`<${SESSION_META.log_url}|log>`);
    if (links.length) parts.push(links.join(" "));

    // Open DM channel with the user (by username → need to look up user ID)
    // SESSION_META.user is a display name; try to find Slack user by name
    const searchResp = await fetch("https://slack.com/api/users.list?limit=200", {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const searchData = await searchResp.json() as any;
    const slackUser = searchData.members?.find((m: any) =>
      m.real_name === SESSION_META.user || m.name === SESSION_META.user || m.profile?.display_name === SESSION_META.user
    );
    if (!slackUser) {
      console.log(`[Sidecar] Could not find Slack user for "${SESSION_META.user}", skipping DM`);
      return;
    }

    const openResp = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users: slackUser.id }),
    });
    const openData = await openResp.json() as any;
    if (!openData.ok) {
      console.log(`[Sidecar] Could not open DM: ${openData.error}`);
      return;
    }

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: openData.channel.id, text: parts.join("\n") }),
    });
    console.log(`[Sidecar] DM'd ${SESSION_META.user} (${slackUser.id}) on completion`);
  } catch (e: any) {
    console.error(`[Sidecar] Failed to DM author: ${e.message}`);
  }
}

process.on("SIGTERM", async () => {
  stopTranscriptPoller();
  httpServer.close();

  if (!respondToUserCalled) {
    const summary = buildCompletionSummary();
    if (summary !== "Session completed") {
      logActivity("response", summary);
      addProgress("response", summary);
    }
  }

  // Append completion marker to existing status
  const completionStatus = lastStatus
    ? `${lastStatus} — _completed_`
    : "_completed_";
  addProgress("status", "Session completed");
  await updateRootComment(completionStatus);

  // DM the author with the final summary
  await dmAuthorOnCompletion();

  process.exit(0);
});
