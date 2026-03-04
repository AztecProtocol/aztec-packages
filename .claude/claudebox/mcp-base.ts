/**
 * ClaudeBox MCP Base — shared infrastructure for all profile sidecars.
 *
 * Provides: config, env parsing, GitHub/Slack API helpers, activity log,
 * root comment management, transcript poller, common MCP tool registrars,
 * clone helper, and HTTP server scaffold.
 *
 * Each profile imports from here and adds its own tools (clone_repo, create_pr, etc.).
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { execFileSync, spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { getSchema, allSchemas, schemasPrompt } from "./lib/stat-schemas.ts";

// ── Config ──────────────────────────────────────────────────────
export const PORT = parseInt(process.env.MCP_PORT || "9801", 10);
export const GH_TOKEN = process.env.GH_TOKEN || "";
export const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
export const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
export const QUIET_MODE = process.env.CLAUDEBOX_QUIET === "1";
export const CI_ALLOW = process.env.CLAUDEBOX_CI_ALLOW === "1";
export const STATS_DIR = process.env.CLAUDEBOX_STATS_DIR || "/stats";
export const CLAUDEBOX_HOST = process.env.CLAUDEBOX_HOST || "claudebox.work";
export const WORKTREE_ID = process.env.CLAUDEBOX_WORKTREE_ID || "";

export const SESSION_META = {
  log_id: process.env.CLAUDEBOX_LOG_ID || "",
  log_url: process.env.CLAUDEBOX_LOG_URL || "",
  user: process.env.CLAUDEBOX_USER || "",
  repo: "",  // Set by profile
  comment_id: process.env.CLAUDEBOX_COMMENT_ID || "",
  run_comment_id: process.env.CLAUDEBOX_RUN_COMMENT_ID || "",
  run_url: process.env.CLAUDEBOX_RUN_URL || "",
  link: process.env.CLAUDEBOX_LINK || "",
  slack_channel: process.env.CLAUDEBOX_SLACK_CHANNEL || "",
  slack_thread_ts: process.env.CLAUDEBOX_SLACK_THREAD_TS || "",
  slack_message_ts: process.env.CLAUDEBOX_SLACK_MESSAGE_TS || "",
  base_branch: process.env.CLAUDEBOX_BASE_BRANCH || "next",
};

export const statusPageUrl = WORKTREE_ID ? `https://${CLAUDEBOX_HOST}/s/${WORKTREE_ID}` : "";

// ── Parse Slack permalink from link if no Slack coords provided ──
function parseSlackPermalink(link: string): { channel: string; thread_ts: string } | null {
  const m = link.match(/slack\.com\/archives\/([A-Z0-9]+)\/p(\d+)/);
  if (!m) return null;
  const raw = m[2];
  const ts = raw.length > 10 ? raw.slice(0, 10) + "." + raw.slice(10) : raw;
  return { channel: m[1], thread_ts: ts };
}

if (SLACK_BOT_TOKEN && SESSION_META.link && !SESSION_META.slack_channel) {
  const parsed = parseSlackPermalink(SESSION_META.link);
  if (parsed) {
    SESSION_META.slack_channel = parsed.channel;
    SESSION_META.slack_thread_ts = parsed.thread_ts;
  }
}

// ── GitHub API whitelist builder ────────────────────────────────
// Returns the common whitelist patterns, parameterized by repo prefix R.
export function buildCommonGhWhitelist(R: string): Array<{ method: string; pattern: RegExp }> {
  return [
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
}

export function isGhAllowed(method: string, path: string, whitelist: Array<{ method: string; pattern: RegExp }>): boolean {
  const clean = path.replace(/^\//, "");
  return whitelist.some(r => r.method === method.toUpperCase() && r.pattern.test(clean));
}

// ── Slack API whitelist ─────────────────────────────────────────
// Only allow thread-scoped Slack operations — no channel history, no arbitrary reads
export const SLACK_WHITELIST = new Set(["chat.postMessage", "chat.update", "reactions.add", "conversations.replies", "users.list"]);

// ── Git helper ──────────────────────────────────────────────────
export function git(workspace: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: workspace, encoding: "utf-8", timeout: 60000 });
}

// ── Helpers ──────────────────────────────────────────────────────

/** Strip embedded tokens from error messages (e.g. git push URLs with x-access-token). */
export function sanitizeError(msg: string): string {
  return msg.replace(/https:\/\/[^@\s]+@/g, "https://***@");
}

export function truncateForSlack(text: string, maxLen = 600): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

// ── Activity log ────────────────────────────────────────────────
export const ACTIVITY_LOG = "/workspace/activity.jsonl";

// Seed seen artifacts from existing activity log (so resumed sessions don't re-post)
const _seenArtifactUrls = new Set<string>();
try {
  if (existsSync(ACTIVITY_LOG)) {
    for (const line of readFileSync(ACTIVITY_LOG, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "artifact") {
          const m = entry.text.match(/(https?:\/\/[^\s)>\]]+)/);
          if (m) _seenArtifactUrls.add(m[1].replace(/[.,;:!?]+$/, ''));
        }
      } catch {}
    }
  }
} catch {}

export function logActivity(type: string, text: string): void {
  // Dedup artifacts by URL — don't re-post the same PR/gist/link
  if (type === "artifact") {
    const urlMatch = text.match(/(https?:\/\/[^\s)>\]]+)/);
    if (urlMatch) {
      const cleanUrl = urlMatch[1].replace(/[.,;:!?]+$/, '');
      if (_seenArtifactUrls.has(cleanUrl)) return;
      _seenArtifactUrls.add(cleanUrl);
    }
  }
  try {
    appendFileSync(ACTIVITY_LOG, JSON.stringify({ ts: new Date().toISOString(), type, text }) + "\n");
  } catch {}
}

// ── Root comment state ──────────────────────────────────────────
export let lastStatus = "";
export let respondToUserCalled = false;

export function setRespondToUserCalled(v: boolean): void { respondToUserCalled = v; }
export function setLastStatus(v: string): void { lastStatus = v; }

export const commentSections = {
  status: "" as string,
  statusLog: [] as Array<{ ts: string; text: string }>,
  response: "" as string,
};

export const trackedPRs = new Map<number, { title: string; url: string; action: string }>();
export const otherArtifacts: string[] = [];

export function addProgress(type: "status" | "response", text: string): void {
  if (type === "status") {
    commentSections.status = text;
    commentSections.statusLog.push({ ts: new Date().toISOString(), text });
  } else if (type === "response") {
    commentSections.response = text;
  }
}

export function addTrackedPR(num: number, title: string, url: string, action: "created" | "updated") {
  const existing = trackedPRs.get(num);
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
  const prLinks: string[] = [];
  for (const [num, pr] of trackedPRs) {
    prLinks.push(`<${pr.url}|#${num}>`);
  }
  const lines: string[] = [];
  if (prLinks.length) lines.push(prLinks.join(" "));
  if (otherArtifacts.length > 0) lines.push(...otherArtifacts);
  return lines.join("\n");
}

function buildGhBody(_latestStatus: string): string {
  const lines: string[] = [];
  const links: string[] = [];
  if (statusPageUrl) links.push(`[Live status](${statusPageUrl})`);
  if (SESSION_META.log_url) links.push(`[Log](${SESSION_META.log_url})`);
  if (links.length) lines.push(links.join(" · "));

  if (commentSections.status) {
    lines.push("");
    lines.push(`**Status:** ${commentSections.status}`);
  }

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

  if (commentSections.response) {
    lines.push("");
    lines.push(`**Response:** ${commentSections.response}`);
  }

  const artifacts = buildArtifactsGh();
  if (artifacts) {
    lines.push("");
    lines.push(artifacts);
  }

  return lines.join("\n");
}

export function buildSlackText(status: string): string {
  const parts: string[] = [];
  // Response is the main content; status goes in footer
  if (commentSections.response) {
    parts.push(truncateForSlack(commentSections.response));
  } else {
    parts.push(truncateForSlack(status));
  }
  // Footer: artifacts | status-page | completion state
  const footer: string[] = [];
  const artifacts = buildArtifactsSlack();
  if (artifacts) footer.push(artifacts);
  if (statusPageUrl) footer.push(`<${statusPageUrl}|status>`);
  if (commentSections.response) {
    // Show compact completion state (strip the response prefix if embedded in status)
    const tag = status.includes("completed") ? "completed"
      : status.includes("error") ? status.replace(commentSections.response, "").replace(/^\s*—?\s*/, "").trim() || "error"
      : "";
    if (tag) footer.push(`_${tag}_`);
  }
  if (footer.length) parts.push(footer.join("  \u2502  "));
  return parts.join("\n");
}

export async function updateRootComment(status?: string): Promise<string[]> {
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

// ── Claude transcript poller ────────────────────────────────────
let transcriptPollTimer: ReturnType<typeof setInterval> | null = null;
let transcriptLinesRead = 0;
let transcriptInitialized = false;
let workspaceName = "";

export function startTranscriptPoller(): void {
  const projDir = join(process.env.HOME || "/home/aztec-dev", ".claude", "projects", "-workspace");

  transcriptPollTimer = setInterval(() => {
    try {
      if (!existsSync(projDir)) return;
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

      for (let i = transcriptLinesRead; i < lines.length; i++) {
        try {
          const d = JSON.parse(lines[i]);
          if (d.type === "assistant" && Array.isArray(d.message?.content)) {
            for (const item of d.message.content) {
              if (item.type === "text" && item.text?.trim()) {
                logActivity("context", item.text.trim());
              }
              // Tool invocations — show what Claude is doing
              if (item.type === "tool_use") {
                const name = item.name || "tool";
                // Agent subagent launches
                if (name === "Agent" && item.input?.description) {
                  logActivity("agent_start", item.input.description);
                } else if (name === "Bash" && item.input?.command) {
                  const cmd = item.input.command.length > 120 ? item.input.command.slice(0, 120) + "\u2026" : item.input.command;
                  logActivity("tool_use", `$ ${cmd}`);
                } else if (name === "Read" || name === "Glob" || name === "Grep") {
                  const target = item.input?.file_path || item.input?.pattern || item.input?.path || "";
                  logActivity("tool_use", `${name} ${target.length > 80 ? target.slice(0, 80) + "\u2026" : target}`);
                } else if (name === "Edit" || name === "Write") {
                  const fp = item.input?.file_path || "";
                  logActivity("tool_use", `${name} ${fp}`);
                } else if (!["mcp__ide__getDiagnostics", "mcp__ide__executeCode", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet"].includes(name)) {
                  logActivity("tool_use", name);
                }
              }
            }
          }
          // Tool results — capture agent completions
          if (d.type === "tool_result" && d.tool_use_id) {
            // We don't log individual tool results — too noisy
          }
        } catch {}
      }
      transcriptLinesRead = lines.length;
    } catch {}
  }, 2000);
}

export function stopTranscriptPoller(): void {
  if (transcriptPollTimer) { clearInterval(transcriptPollTimer); transcriptPollTimer = null; }
}

// ── Shared clone helper ─────────────────────────────────────────
export function cloneRepoCheckoutAndInit(targetDir: string, ref: string, fallbackRef = "origin/next"): { text: string; isError?: boolean } {
  let checkedOutRef = ref;
  try {
    execFileSync("git", ["-C", targetDir, "checkout", "--detach", ref], {
      timeout: 30_000, stdio: "pipe",
    });
  } catch {
    try {
      execFileSync("git", ["-C", targetDir, "fetch", "origin", ref], {
        timeout: 120_000, stdio: "pipe",
      });
      execFileSync("git", ["-C", targetDir, "checkout", "--detach", "FETCH_HEAD"], {
        timeout: 30_000, stdio: "pipe",
      });
    } catch {
      try {
        execFileSync("git", ["-C", targetDir, "checkout", "--detach", fallbackRef], {
          timeout: 30_000, stdio: "pipe",
        });
        checkedOutRef = fallbackRef;
      } catch (e: any) {
        return { text: `Checkout failed for both ${ref} and ${fallbackRef}: ${e.message}`, isError: true };
      }
    }
  }
  const head = execFileSync("git", ["-C", targetDir, "rev-parse", "--short", "HEAD"], {
    encoding: "utf-8", timeout: 5_000,
  }).trim();

  const refNote = checkedOutRef !== ref ? ` (WARNING: ${ref} not found, fell back to ${checkedOutRef})` : "";

  let submoduleMsg = "";
  try {
    execFileSync("git", ["-C", targetDir, "submodule", "update", "--init", "--recursive"], {
      timeout: 300_000, stdio: "pipe",
    });
    submoduleMsg = " Submodules initialized.";
  } catch (e: any) {
    submoduleMsg = ` ERROR: submodule init failed: ${e.message}. Builds may fail — try running: git submodule update --init --recursive`;
  }

  return { text: `${head}${refNote}.${submoduleMsg}` };
}

// ── Profile options interface ───────────────────────────────────
export interface ProfileOpts {
  repo: string;
  workspace: string;
  tools: string;
  ghWhitelist: Array<{ method: string; pattern: RegExp }>;
}

// ── Common tool registrar ───────────────────────────────────────
// Registers tools shared by all profiles: get_context, session_status,
// respond_to_user, github_api, slack_api, create_gist, create_skill,
// linear_get_issue, linear_create_issue, ci_failures, record_stat.

export function registerCommonTools(server: McpServer, opts: ProfileOpts): void {
  const { repo, tools, ghWhitelist } = opts;

  // ── get_context ────────────────────────────────────────────────
  server.tool("get_context", "Session metadata: user, repo, log_url, trigger source, git ref, available tools.", {},
    async () => {
      const ctx: Record<string, string> = {};
      for (const [k, v] of Object.entries(SESSION_META)) {
        if (v) ctx[k] = v;
      }
      ctx.tools = tools;
      ctx.ci_allow = CI_ALLOW ? "true — you CAN modify .github/ workflow files" : "false — .github/ workflow files are blocked. If you need to propose CI changes, write them to .github-new/ instead.";
      return { content: [{ type: "text", text: JSON.stringify(ctx, null, 2) }] };
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

  // ── set_workspace_name ─────────────────────────────────────────
  server.tool("set_workspace_name",
    `Set a short, descriptive name for this workspace. Call this early (right after cloning).
The name should be a concise slug describing the task (2-5 words, lowercase, hyphens).
Examples: "fix-flaky-p2p-test", "audit-polynomial-commitment", "add-g0-flag"
The name is used as the git branch name and appears in the dashboard and Slack.`,
    { name: z.string().describe("Short descriptive slug, e.g. fix-flaky-p2p-test") },
    async ({ name }) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      workspaceName = slug;
      logActivity("name", slug);
      return { content: [{ type: "text", text: `Workspace named: ${slug}` }] };
    });

  // ── respond_to_user ───────────────────────────────────────────
  server.tool("respond_to_user",
    `Send your final response to the user. Updates the Slack message inline. You MUST call this before ending.

Your response appears directly in Slack (not quoted). Keep it concise but informative — a few sentences is fine. For detailed analysis, print to stdout and link to the log.

ALWAYS reference PRs and issues as full GitHub links (https://github.com/${repo}/pull/123), never just "#123". This makes messages clickable in Slack.

PRs you create/update are automatically shown as compact #NNN links — no need to repeat them unless adding context.

- GOOD: "Fixed flaky test — race condition in p2p layer. Applied the same pattern from the stdlib fix."
- GOOD: "Found 3 PRs needing manual backport — <LOG_URL|see full analysis>"
- BAD: "Created PR #5678" — not clickable, and PR is already shown

Avoid code blocks and long bullet lists — those belong in the log.`,
    { message: z.string().describe(`Concise response. Use full GitHub URLs for PRs/issues (https://github.com/${repo}/pull/123), not #123.`) },
    async ({ message }) => {
      respondToUserCalled = true;
      logActivity("response", message);
      addProgress("response", message);
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
      path: z.string().describe(`API path, e.g. repos/${repo}/pulls/123`),
      body: z.any().optional().describe("Request body for POST/PATCH/PUT"),
      accept: z.string().optional().describe("Accept header override"),
    },
    async ({ method, path, body, accept }) => {
      if (!isGhAllowed(method, path, ghWhitelist))
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
    `Slack Web API proxy (thread-scoped). Whitelisted: ${[...SLACK_WHITELIST].join(", ")}.
Channel and thread are locked to this session — you can only read/write your own thread.`,
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
      if (method !== "users.list") {
        if (!SESSION_META.slack_channel)
          return { content: [{ type: "text", text: "No Slack channel configured for this session" }], isError: true };
        payload.channel = SESSION_META.slack_channel;
      }
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

  // ── linear_get_issue ───────────────────────────────────────────
  server.tool("linear_get_issue",
    "Fetch a Linear issue by identifier (e.g. UNIFIED-26). Returns title, description, state, assignee, labels, and URL.",
    { identifier: z.string().describe("Issue identifier, e.g. UNIFIED-26 or ENG-1234") },
    async ({ identifier }) => {
      if (!LINEAR_API_KEY) return { content: [{ type: "text", text: "No LINEAR_API_KEY" }], isError: true };

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

      const fmtRun = (r: any) =>
        `${r.conclusion ?? r.status} | ${r.head_sha?.slice(0, 10)} | ${r.created_at}\n  https://github.com/${repo}/actions/runs/${r.id}`;

      try {
        const prData = await ghGet(`repos/${repo}/pulls/${pr}`);
        const branch = prData.head.ref as string;
        const base = prData.base.ref as string;
        const prUrl = `https://github.com/${repo}/pull/${pr}`;

        const prRuns = await ghGet(
          `repos/${repo}/actions/workflows/ci3.yml/runs?branch=${encodeURIComponent(branch)}&per_page=20`
        );
        const prWorkflows: any[] = prRuns.workflow_runs ?? [];
        const prLastPass = prWorkflows.find((r: any) => r.conclusion === "success");
        const prLastFail = prWorkflows.find((r: any) => r.conclusion === "failure");
        const prLatest = prWorkflows[0];

        let mqLastPass: any = null;
        let mqLastFail: any = null;
        let mqLatest: any = null;
        try {
          const mqRuns = await ghGet(
            `repos/${repo}/actions/workflows/ci3.yml/runs?event=merge_group&per_page=30`
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
        if (prLatest) lines.push(`Latest: ${fmtRun(prLatest)}`);
        if (prLastFail && prLastFail !== prLatest) lines.push(`Last fail: ${fmtRun(prLastFail)}`);
        if (prLastPass && prLastPass !== prLatest) lines.push(`Last pass: ${fmtRun(prLastPass)}`);
        if (!prLatest) lines.push("No CI3 runs found");
        lines.push("");

        lines.push("### Merge Queue (CI3)");
        if (mqLatest) lines.push(`Latest: ${fmtRun(mqLatest)}`);
        if (mqLastFail && mqLastFail !== mqLatest) lines.push(`Last fail: ${fmtRun(mqLastFail)}`);
        if (mqLastPass && mqLastPass !== mqLatest) lines.push(`Last pass: ${fmtRun(mqLastPass)}`);
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
        _worktree_id: WORKTREE_ID,
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
      const skillDir = join(opts.workspace, ".claude", "skills", name);
      const skillFile = join(skillDir, "SKILL.md");

      // Build frontmatter
      let frontmatter = `---\nname: ${name}\ndescription: ${description}\n`;
      if (argument_hint) frontmatter += `argument-hint: ${argument_hint}\n`;
      frontmatter += `---\n\n`;

      const content = frontmatter + body;
      const action = existsSync(skillFile) ? "Updated" : "Created";

      try {
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(skillFile, content);

        // Commit and push
        git(opts.workspace, "add", skillFile);
        git(opts.workspace, "commit", "-m", `chore: ${action.toLowerCase()} skill /${name}`);
        const branch = git(opts.workspace, "rev-parse", "--abbrev-ref", "HEAD").trim();
        git(opts.workspace, "push", "origin", branch);

        logActivity("artifact", `${action} skill [/${name}](https://github.com/${repo}/blob/${branch}/.claude/skills/${name}/SKILL.md)`);
        return { content: [{ type: "text", text: `${action} skill /${name} at .claude/skills/${name}/SKILL.md — committed and pushed to ${branch}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_skill: ${e.message}` }], isError: true };
      }
    });
}

// ── Completion summary + DM ─────────────────────────────────────

function buildCompletionSummary(): string {
  if (respondToUserCalled && lastStatus) {
    return lastStatus;
  }

  const parts: string[] = [];
  try {
    const projDir = join(process.env.HOME || "/home/aztec-dev", ".claude", "projects", "-workspace");
    if (existsSync(projDir)) {
      const files = readdirSync(projDir)
        .filter(f => f.endsWith(".jsonl"))
        .map(f => ({ name: f, mtime: statSync(join(projDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) {
        const lines = readFileSync(join(projDir, files[0].name), "utf-8").split("\n").filter(l => l.trim());
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

async function dmAuthorOnCompletion(): Promise<void> {
  if (!SLACK_BOT_TOKEN || !SESSION_META.user) return;
  if (SESSION_META.slack_channel && SESSION_META.slack_channel.startsWith("D")) return;
  try {
    // Build a brief DM with link back to context
    const parts: string[] = [];

    // Context link — where the task was triggered
    const contextLinks: string[] = [];
    if (SESSION_META.slack_channel && SESSION_META.slack_thread_ts) {
      const threadLink = `https://aztecprotocol.slack.com/archives/${SESSION_META.slack_channel}/p${SESSION_META.slack_thread_ts.replace(".", "")}`;
      contextLinks.push(`<${threadLink}|thread>`);
    }
    if (SESSION_META.link) {
      contextLinks.push(`<${SESSION_META.link}|source>`);
    }

    // Brief status + PR links
    const prLinks = [...trackedPRs.entries()].map(([num, pr]) => `<${pr.url}|#${num}>`);
    const hasError = lastStatus?.includes("error");
    const status = hasError ? "Task failed" : "Task done";
    parts.push(status + (prLinks.length ? ` ${prLinks.join(" ")}` : ""));

    // Footer: context + status page
    const footer: string[] = [...contextLinks];
    if (statusPageUrl) footer.push(`<${statusPageUrl}|status>`);
    if (footer.length) parts.push(footer.join(" \u2502 "));

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

async function initSlackFromPermalink(): Promise<void> {
  if (!SLACK_BOT_TOKEN || !SESSION_META.slack_channel || !SESSION_META.slack_thread_ts || SESSION_META.slack_message_ts) return;
  const initText = buildSlackText("Starting…");
  const headers = { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" };

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

// ── HTTP body reader ────────────────────────────────────────────
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLen = 0;
    req.on("data", (c: Buffer) => {
      totalLen += c.length;
      if (totalLen > MAX_BODY_BYTES) { req.destroy(); reject(new Error("Request body too large")); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ── HTTP Server scaffold ────────────────────────────────────────
// Profiles call this to start the MCP HTTP server.

export function startMcpHttpServer(createMcpServer: () => McpServer): void {
  const MCP_PATH = "/mcp";

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }

    if (req.url === MCP_PATH && req.method === "POST") {
      try {
        const bodyStr = await readBody(req);
        const body = JSON.parse(bodyStr);
        const server = createMcpServer();
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Sidecar] :${PORT} gh=${GH_TOKEN ? "yes" : "no"} slack=${SLACK_BOT_TOKEN ? "yes" : "no"} linear=${LINEAR_API_KEY ? "yes" : "no"} quiet=${QUIET_MODE ? "yes" : "no"} ci_allow=${CI_ALLOW ? "yes" : "no"}`);
    initSlackFromPermalink();
    startTranscriptPoller();
  });

  process.on("SIGTERM", async () => {
    try {
      stopTranscriptPoller();
      httpServer.close();

      if (!respondToUserCalled) {
        const summary = buildCompletionSummary();
        if (summary !== "Session completed") {
          logActivity("response", summary);
          addProgress("response", summary);
        }
      }

      const completionStatus = lastStatus
        ? `${lastStatus} — _completed_`
        : "_completed_";
      addProgress("status", "Session completed");
      await updateRootComment(completionStatus);

      await dmAuthorOnCompletion();
    } catch (e) {
      console.error(`[SIGTERM] Cleanup error: ${e}`);
    }
    process.exit(0);
  });
}

// ── Profile tool configs ────────────────────────────────────────

export interface CloneToolConfig {
  repo: string;
  workspace: string;
  strategy: "local-reference" | "authenticated-url";
  /** Remote URL to set as origin after local-reference clone */
  remoteUrl?: string;
  /** Fallback ref for cloneRepoCheckoutAndInit (default: "origin/next") */
  fallbackRef?: string;
  /** Hint shown in the ref parameter description */
  refHint?: string;
  /** Override tool description */
  description?: string;
}

export interface PRToolConfig {
  repo: string;
  workspace: string;
  /** Branch name prefix, e.g. "claudebox/", "audit/" */
  branchPrefix: string;
  /** Default base branch for create_pr schema */
  defaultBase: string;
  /** Reject these base branch names */
  blockedBases?: RegExp;
  /** Block .claude/ files unless include_claude_files=true */
  blockClaudeFiles?: boolean;
  /** Block .github/ files unless CI_ALLOW env is set */
  blockGithubFiles?: boolean;
  /** Auto-reset noir/noir-repo submodule before staging (prevents accidental submodule changes from cherry-pick/rebase) */
  checkNoirSubmodule?: boolean;
  /** Label to apply on create, require on update (e.g. "claudebox") */
  label?: string;
  /** Override create_pr tool description */
  createDescription?: string;
  /** Override update_pr tool description */
  updateDescription?: string;
}

// ── Staging + push helpers ──────────────────────────────────────

function stageAndCommit(workspace: string, commitMsg: string, opts: {
  blockClaudeFiles?: boolean; includeClaudeFiles?: boolean;
  blockGithubFiles?: boolean;
  resetNoirSubmodule?: boolean;
}): { error?: string; noirReset?: boolean } {
  // Auto-reset noir submodule before staging to avoid accidental changes from cherry-pick/rebase
  let noirReset = false;
  if (opts.resetNoirSubmodule) {
    try {
      git(workspace, "checkout", "HEAD", "--", "noir/noir-repo");
      git(workspace, "submodule", "update", "--init", "noir/noir-repo");
      noirReset = true;
    } catch { /* submodule may not exist in this workspace */ }
  }

  git(workspace, "add", "-A");
  try {
    git(workspace, "diff", "--cached", "--quiet");
    return {}; // nothing staged
  } catch {
    const staged = git(workspace, "diff", "--cached", "--name-only").trim();
    if (opts.blockClaudeFiles && !opts.includeClaudeFiles) {
      const claudeFiles = staged.split("\n").filter(f => f.startsWith(".claude/"));
      if (claudeFiles.length > 0) {
        git(workspace, "reset", "HEAD", "--", ".claude");
        return { error: `Blocked: .claude/ files (${claudeFiles.join(", ")}). Pass include_claude_files=true to include.` };
      }
    }
    if (opts.blockGithubFiles && !CI_ALLOW) {
      const ciFiles = staged.split("\n").filter(f => f.startsWith(".github/"));
      if (ciFiles.length > 0) {
        git(workspace, "reset", "HEAD", "--", ".github");
        return { error: `Blocked: .github/ workflow files. Requires 'ci-allow' prefix.` };
      }
    }
    git(workspace, "commit", "-m", commitMsg);
    return { noirReset };
  }
}

export function pushToRemote(workspace: string, repo: string, branch: string, forcePush?: boolean): void {
  const pushUrl = `https://x-access-token:${GH_TOKEN}@github.com/${repo}.git`;
  const pushArgs = ["push", ...(forcePush ? ["--force"] : []), pushUrl, `HEAD:refs/heads/${branch}`];
  execFileSync("git", pushArgs, {
    cwd: workspace, encoding: "utf-8", timeout: 120000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

// ── registerCloneRepo ───────────────────────────────────────────

export function registerCloneRepo(server: McpServer, config: CloneToolConfig): void {
  const desc = config.description ||
    `Clone the repo into ${config.workspace}. Safe to call on resume — fetches new refs. Call FIRST before doing any work.`;
  const refHint = config.refHint || "'origin/next', 'abc123'";

  server.tool("clone_repo", desc,
    { ref: z.string().describe(`Branch, tag, or commit hash to check out (e.g. ${refHint})`) },
    async ({ ref }) => {
      const targetDir = config.workspace;

      if (existsSync(join(targetDir, ".git"))) {
        try {
          try {
            execFileSync("git", ["-C", targetDir, "fetch", "origin"], { timeout: 120_000, stdio: "pipe" });
          } catch { /* fetch failure is non-fatal */ }

          const result = cloneRepoCheckoutAndInit(targetDir, ref, config.fallbackRef);
          if (result.isError) return { content: [{ type: "text", text: result.text }], isError: true };
          return { content: [{ type: "text", text: `Repo already cloned. Checked out ${ref} (${result.text}) Work in ${targetDir}.` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Repo exists but operation failed: ${sanitizeError(e.message)}` }], isError: true };
        }
      }

      try {
        if (config.strategy === "local-reference") {
          const refGit = "/reference-repo/.git";
          execFileSync("git", ["config", "--global", "--add", "safe.directory", refGit], { timeout: 5_000 });
          execFileSync("git", ["config", "--global", "--add", "safe.directory", targetDir], { timeout: 5_000 });
          execFileSync("git", ["clone", "--shared", refGit, targetDir], { timeout: 120_000, stdio: "pipe" });
          if (config.remoteUrl) {
            execFileSync("git", ["-C", targetDir, "remote", "set-url", "origin", config.remoteUrl], { timeout: 5_000 });
          }
        } else {
          const cloneUrl = `https://x-access-token:${GH_TOKEN}@github.com/${config.repo}.git`;
          execFileSync("git", ["config", "--global", "--add", "safe.directory", targetDir], { timeout: 5_000 });
          execFileSync("git", ["clone", cloneUrl, targetDir], { timeout: 300_000, stdio: "pipe" });
        }

        const result = cloneRepoCheckoutAndInit(targetDir, ref, config.fallbackRef);
        if (result.isError) return { content: [{ type: "text", text: `Clone succeeded but: ${result.text}` }], isError: true };
        logActivity("clone", `Cloned ${config.repo} at ${ref} (${result.text})`);
        return { content: [{ type: "text", text: `Cloned ${config.repo} to ${targetDir} at ${ref} (${result.text}) Work in ${targetDir}.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Clone failed: ${sanitizeError(e.message)}` }], isError: true };
      }
    });
}

// ── registerPRTools (create_pr + update_pr) ─────────────────────

export function registerPRTools(server: McpServer, config: PRToolConfig): void {
  // ── create_pr ──
  const createSchema: Record<string, any> = {
    title: z.string().describe("PR title"),
    body: z.string().describe("PR description"),
    base: z.string().default(config.defaultBase).describe(`Base branch (default: ${config.defaultBase})`),
    closes: z.array(z.number()).optional().describe("Issue numbers to close"),
    force_push: z.boolean().optional().describe("Force-push to the branch"),
  };
  if (config.blockClaudeFiles) createSchema.include_claude_files = z.boolean().optional().describe("Force-include .claude/ files.");
  if (config.checkNoirSubmodule) createSchema.include_noir_submodule = z.boolean().optional().describe("Include noir/noir-repo submodule changes (by default, the submodule is auto-reset to HEAD before staging).");

  server.tool("create_pr",
    config.createDescription || "Push workspace commits and create a draft PR.",
    createSchema,
    async (params: any) => {
      const { title, body, closes, force_push, include_claude_files, include_noir_submodule } = params;
      // Redirect v* branches to backport-to-v*-staging (never open PRs directly against version branches)
      let base: string = params.base;
      if (/^v\d+/.test(base)) base = `backport-to-${base}-staging`;
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      // Verify commits are actually based on the target branch
      if (base !== SESSION_META.base_branch) {
        try {
          git(config.workspace, "fetch", "origin", base);
          const mergeBase = git(config.workspace, "merge-base", `origin/${base}`, "HEAD").trim();
          const remoteTip = git(config.workspace, "rev-parse", `origin/${base}`).trim();
          if (mergeBase !== remoteTip) {
            return { content: [{ type: "text", text: `Your commits are not based on origin/${base}. Rebase first:\ngit fetch origin ${base} && git rebase --onto origin/${base} origin/${SESSION_META.base_branch || "next"} HEAD` }], isError: true };
          }
        } catch {}
      }

      if (config.blockedBases) {
        if (!/^[\w./-]+$/.test(base)) return { content: [{ type: "text", text: `Invalid base: ${base}` }], isError: true };
        if (config.blockedBases.test(base))
          return { content: [{ type: "text", text: `Blocked: never target '${base}'. Use '${config.defaultBase}' or a version branch.` }], isError: true };
      }

      try {
        const branch = `${config.branchPrefix}${workspaceName || SESSION_META.log_id || Date.now()}`;

        const stage = stageAndCommit(config.workspace, title, {
          blockClaudeFiles: config.blockClaudeFiles, includeClaudeFiles: include_claude_files,
          blockGithubFiles: config.blockGithubFiles,
          resetNoirSubmodule: config.checkNoirSubmodule && !include_noir_submodule,
        });
        if (stage.error) return { content: [{ type: "text", text: stage.error }], isError: true };

        let logOutput: string;
        try { logOutput = git(config.workspace, "log", "--oneline", `origin/${base}..HEAD`); }
        catch { logOutput = git(config.workspace, "log", "--oneline", "-5"); }
        if (!logOutput.trim()) return { content: [{ type: "text", text: "No commits to push" }], isError: true };

        pushToRemote(config.workspace, config.repo, branch, force_push);

        const prRes = await fetch(`https://api.github.com/repos/${config.repo}/pulls`, {
          method: "POST",
          headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
          body: JSON.stringify({
            title, base, draft: true, head: branch,
            body: body
              + (closes?.length ? "\n\n" + closes.map((n: number) => `Closes #${n}`).join("\n") : "")
              + (SESSION_META.log_url ? `\n\nClaudeBox log: ${SESSION_META.log_url}` : ""),
          }),
        });
        const pr = await prRes.json() as any;
        if (!prRes.ok) return { content: [{ type: "text", text: `PR failed: ${pr.message || JSON.stringify(pr)}` }], isError: true };

        if (config.label) {
          try {
            await fetch(`https://api.github.com/repos/${config.repo}/issues/${pr.number}/labels`, {
              method: "POST",
              headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
              body: JSON.stringify({ labels: [config.label] }),
            });
          } catch {}
        }

        addTrackedPR(pr.number, title, pr.html_url, "created");
        logActivity("artifact", `- [PR #${pr.number}: ${title}](${pr.html_url})`);
        await updateRootComment();
        return { content: [{ type: "text", text: `${pr.html_url}\nBranch: ${branch}\n#${pr.number}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_pr: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  // ── update_pr ──
  const updateSchema: Record<string, any> = {
    pr_number: z.number().describe("PR number"),
    push: z.boolean().optional().describe("Push current workspace commits to the PR's branch"),
    title: z.string().optional().describe("New title"),
    body: z.string().optional().describe("New body"),
    base: z.string().optional().describe("New base branch"),
    state: z.enum(["open", "closed"]).optional().describe("PR state"),
    force_push: z.boolean().optional(),
  };
  if (config.blockClaudeFiles) updateSchema.include_claude_files = z.boolean().optional();
  if (config.checkNoirSubmodule) updateSchema.include_noir_submodule = z.boolean().optional();

  server.tool("update_pr",
    config.updateDescription || "Push workspace commits and/or update an existing PR.",
    updateSchema,
    async (params: any) => {
      const { pr_number, push, title, body, state, force_push, include_claude_files, include_noir_submodule } = params;
      // Redirect v* branches to backport-to-v*-staging
      let base: string | undefined = params.base;
      if (base && /^v\d+/.test(base)) base = `backport-to-${base}-staging`;
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      try {
        const prRes = await fetch(`https://api.github.com/repos/${config.repo}/pulls/${pr_number}`, {
          headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json" },
        });
        if (!prRes.ok) return { content: [{ type: "text", text: `PR #${pr_number} not found (HTTP ${prRes.status}). Verify the number via github_api(method="GET", path="repos/${config.repo}/pulls/${pr_number}").` }], isError: true };
        const prData = await prRes.json() as any;

        if (config.label) {
          const labels: string[] = (prData.labels || []).map((l: any) => l.name);
          if (!labels.includes(config.label))
            return { content: [{ type: "text", text: `PR #${pr_number} exists but lacks required '${config.label}' label. Only labeled PRs can be updated via update_pr. Add the label via github_api first, or use create_pr instead.` }], isError: true };
        }

        const results: string[] = [];

        if (push) {
          const branch = prData.head?.ref;
          if (!branch) return { content: [{ type: "text", text: "Cannot determine PR branch" }], isError: true };

          const stage = stageAndCommit(config.workspace, title || `update PR #${pr_number}`, {
            blockClaudeFiles: config.blockClaudeFiles, includeClaudeFiles: include_claude_files,
            blockGithubFiles: config.blockGithubFiles,
            resetNoirSubmodule: config.checkNoirSubmodule && !include_noir_submodule,
          });
          if (stage.error) return { content: [{ type: "text", text: stage.error }], isError: true };

          pushToRemote(config.workspace, config.repo, branch, force_push);
          results.push(`${force_push ? "Force-pushed" : "Pushed"} to ${branch}`);
        }

        if (config.blockedBases && base && config.blockedBases.test(base))
          return { content: [{ type: "text", text: `Blocked: never target '${base}'.` }], isError: true };

        const update: any = {};
        if (title) update.title = title;
        if (body) update.body = body;
        if (base) update.base = base;
        if (state) update.state = state;

        if (Object.keys(update).length > 0) {
          const res = await fetch(`https://api.github.com/repos/${config.repo}/pulls/${pr_number}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
            body: JSON.stringify(update),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({})) as any;
            return { content: [{ type: "text", text: `Update failed: ${errBody.message || JSON.stringify(errBody)}` }], isError: true };
          }
          results.push(`Updated PR metadata`);
        }

        if (results.length === 0)
          return { content: [{ type: "text", text: "Nothing to do — specify push=true or fields to update" }], isError: true };

        const prTitle = title || prData.title || `PR #${pr_number}`;
        addTrackedPR(pr_number, prTitle, prData.html_url, "updated");
        logActivity("artifact", `- [PR #${pr_number}: ${prTitle} — updated](${prData.html_url})`);
        await updateRootComment();
        return { content: [{ type: "text", text: `PR #${pr_number}: ${results.join(", ")}\n${prData.html_url}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `update_pr: ${sanitizeError(e.message)}` }], isError: true };
      }
    });
}

// Re-export z for profile sidecar convenience
export { z, McpServer };
