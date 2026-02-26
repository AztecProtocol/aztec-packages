#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox MCP Sidecar — runs in its OWN container, shares workspace with Claude.
 *
 * Holds GH_TOKEN + SLACK_BOT_TOKEN. Claude's container never sees them.
 * Both containers mount the same /workspace and /reference-repo/.git.
 *
 * Tools: github_api (whitelisted), slack_api (whitelisted), create_pr,
 *        linear_get_issue, linear_create_issue, session_status, get_context,
 *        ci_failures.
 *
 * Auth: token embedded in URL path (/mcp/<token>).
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { execFileSync, execFile, spawn, ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ── Config ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.MCP_PORT || "9801", 10);
const GH_TOKEN = process.env.GH_TOKEN || "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
const WORKSPACE = "/workspace/aztec-packages";
const REPO = "AztecProtocol/aztec-packages";

const QUIET_MODE = process.env.CLAUDEBOX_QUIET === "1";

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
  { method: "GET",   pattern: new RegExp(`^${R}/pulls/\\d+(/files)?$`) },
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
];

function isGhAllowed(method: string, path: string): boolean {
  const clean = path.replace(/^\//, "");
  return GH_WHITELIST.some(r => r.method === method.toUpperCase() && r.pattern.test(clean));
}

// ── Slack API whitelist ─────────────────────────────────────────

const SLACK_WHITELIST = new Set(["chat.postMessage", "chat.update", "chat.delete", "reactions.add", "conversations.replies", "conversations.history"]);

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
import { appendFileSync } from "fs";
const ACTIVITY_LOG = "/workspace/activity.jsonl";

function logActivity(type: string, text: string): void {
  try {
    appendFileSync(ACTIVITY_LOG, JSON.stringify({ ts: new Date().toISOString(), type, text }) + "\n");
  } catch {}
}

// ── Root comment state (accumulated across tool calls) ──────────
let lastStatus = "";
const sessionArtifacts: string[] = [];

function buildGhBody(status: string): string {
  let body = status;
  if (sessionArtifacts.length > 0) body += "\n\n---\n" + sessionArtifacts.join("\n");
  if (SESSION_META.log_url) body += `\n\n[View log](${SESSION_META.log_url})`;
  return body;
}

function buildSlackText(status: string): string {
  let text = truncateForSlack(status);
  if (sessionArtifacts.length > 0) text += "\n" + sessionArtifacts.join("\n");
  if (SESSION_META.log_url) text += ` <${SESSION_META.log_url}|log>`;
  if (statusPageUrl) text += ` <${statusPageUrl}|status>`;
  return text;
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
      ctx.tools = "respond_to_user, get_context, session_status, github_api, slack_api, create_pr, update_pr, ci_failures, linear_get_issue, linear_create_issue";
      return { content: [{ type: "text", text: JSON.stringify(ctx, null, 2) }] };
    });

  // ── session_status ─────────────────────────────────────────────
  server.tool("session_status",
    "Update status in both Slack and GitHub. Log link + accumulated PR/issue links auto-appended.",
    { status: z.string().describe("Status text") },
    async ({ status }) => {
      logActivity("status", status);
      const results = await updateRootComment(status);
      return { content: [{ type: "text", text: results.length ? results.join("\n") : "No channels configured" }] };
    });

  // ── respond_to_user ───────────────────────────────────────────
  server.tool("respond_to_user",
    `Send your final response to the user. Posts to Slack thread and/or GitHub comment. You MUST call this before ending.

CRITICAL — Keep your message to 1-2 SHORT sentences. For anything complex, print details to stdout (they appear in the log) and include a log link in your message.

ALWAYS reference PRs and issues as full GitHub links (https://github.com/${REPO}/pull/123), never just "#123". This makes messages clickable in Slack.

The log URL is in your context (get_context → log_url). Use it inline:
- GOOD: "Fixed flaky test in https://github.com/${REPO}/pull/1234. Race condition in p2p layer."
- GOOD: "Found 3 PRs needing manual backport — <LOG_URL|see full analysis>"
- GOOD: "Build failed in yarn-project/pxe. <LOG_URL|error details>"
- GOOD: "Created https://github.com/${REPO}/pull/5678 — changelog and test results in <LOG_URL|log>."
- BAD: "Created PR #5678" (not clickable in Slack)

NEVER post tables, bullet lists, reports, code blocks, or multi-paragraph text here. Print verbose output to stdout and link to it.`,
    { message: z.string().describe("1-2 sentences MAX. Use full GitHub URLs for PRs/issues (https://github.com/AztecProtocol/aztec-packages/pull/123), not #123.") },
    async ({ message }) => {
      logActivity("response", message);
      const results: string[] = [];

      if (QUIET_MODE) {
        // Quiet mode: fold response into root status comment instead of posting thread reply
        const updateResults = await updateRootComment(message);
        results.push(...updateResults);
        if (!results.length) results.push("No channels configured — message printed to log only");
        return { content: [{ type: "text", text: results.join("\n") }] };
      }

      if (SLACK_BOT_TOKEN && SESSION_META.slack_channel && SESSION_META.slack_thread_ts) {
        try {
          let text = truncateForSlack(message);
          // Append status page link with message hash for highlighting
          if (statusPageUrl) {
            const msgHash = Buffer.from(message.slice(0, 50)).toString("base64url").slice(0, 12);
            text += ` <${statusPageUrl}?msg=${msgHash}|log>`;
          } else if (SESSION_META.log_url) {
            text += ` <${SESSION_META.log_url}|log>`;
          }
          const r = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              channel: SESSION_META.slack_channel,
              thread_ts: SESSION_META.slack_thread_ts,
              text,
            }),
          });
          const d = await r.json() as any;
          results.push(d.ok ? "Slack reply posted" : `Slack: ${d.error}`);
        } catch (e: any) { results.push(`Slack: ${e.message}`); }
      }

      if (GH_TOKEN && SESSION_META.run_comment_id) {
        try {
          let body = message;
          if (sessionArtifacts.length > 0) body += "\n\n---\n" + sessionArtifacts.join("\n");
          if (SESSION_META.log_url) body += `\n\n[View log](${SESSION_META.log_url})`;
          const r = await fetch(
            `https://api.github.com/repos/${SESSION_META.repo}/issues/comments/${SESSION_META.run_comment_id}`,
            {
              method: "PATCH",
              headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
              body: JSON.stringify({ body }),
            });
          results.push(r.ok ? "GitHub comment updated" : `GitHub: ${r.status}`);
        } catch (e: any) { results.push(`GitHub: ${e.message}`); }
      }

      return { content: [{ type: "text", text: results.length ? results.join("\n") : "No channels configured — message printed to log only" }] };
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
      if (!payload.channel && SESSION_META.slack_channel) payload.channel = SESSION_META.slack_channel;
      if (!payload.thread_ts && SESSION_META.slack_thread_ts && method === "chat.postMessage")
        payload.thread_ts = SESSION_META.slack_thread_ts;
      if (!payload.ts && SESSION_META.slack_message_ts && method === "chat.update")
        payload.ts = SESSION_META.slack_message_ts;
      // conversations.replies needs 'ts' (thread parent) — auto-inject from session
      if (!payload.ts && SESSION_META.slack_thread_ts && method === "conversations.replies")
        payload.ts = SESSION_META.slack_thread_ts;

      try {
        // Read methods need GET with query params (Slack rejects JSON body for these)
        const READ_METHODS = new Set(["conversations.replies", "conversations.history"]);
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
    "Push workspace commits and create a draft PR. Always creates draft PRs.",
    {
      title: z.string().describe("PR title"),
      body: z.string().describe("PR description"),
      base: z.string().default("next").describe("Base branch"),
      closes: z.array(z.number()).optional().describe("Issue numbers to close, e.g. [123, 456]"),
    },
    async ({ title, body, base, closes }) => {
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

        // Push — token in URL, never on disk. execFileSync avoids shell.
        const pushUrl = `https://x-access-token:${GH_TOKEN}@github.com/${SESSION_META.repo}.git`;
        execFileSync("git", ["push", pushUrl, `HEAD:refs/heads/${branch}`], {
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

        // Auto-post PR to root comment
        const prLink = `- [PR #${pr.number}: ${title}](${pr.html_url})`;
        sessionArtifacts.push(prLink);
        logActivity("artifact", prLink);
        await updateRootComment();

        return { content: [{ type: "text", text: `${pr.html_url}\nBranch: ${branch}\n#${pr.number}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_pr: ${e.message}` }], isError: true };
      }
    });

  // ── update_pr ────────────────────────────────────────────────
  server.tool("update_pr",
    "Push workspace commits and/or update an existing PR. Only works on PRs with the 'claudebox' label. Use push=true to push current commits to the PR branch.",
    {
      pr_number: z.number().describe("PR number"),
      push: z.boolean().optional().describe("Push current workspace commits to the PR's branch"),
      title: z.string().optional().describe("New title"),
      body: z.string().optional().describe("New body"),
      base: z.string().optional().describe("New base branch"),
      state: z.enum(["open", "closed"]).optional().describe("PR state"),
    },
    async ({ pr_number, push, title, body, base, state }) => {
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
            git("commit", "-m", title || `update PR #${pr_number}`);
          }

          const pushUrl = `https://x-access-token:${GH_TOKEN}@github.com/${SESSION_META.repo}.git`;
          execFileSync("git", ["push", pushUrl, `HEAD:refs/heads/${branch}`], {
            cwd: WORKSPACE, encoding: "utf-8", timeout: 120000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          });
          results.push(`Pushed to ${branch}`);
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
        sessionArtifacts.push(`- [${result.issue.identifier}: ${result.issue.title}](${result.issue.url})`);
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

// ── Docker proxy endpoint ────────────────────────────────────────
// Drop-in docker replacement: receives raw docker args, validates, runs real docker.
// Claude's container has a `docker` shim that POSTs args here.

// Real docker binary — must not resolve to our own shim.
const DOCKER_BIN = existsSync("/usr/bin/docker") ? "/usr/bin/docker" : "docker";

const DANGEROUS_CAPS = new Set([
  "SYS_ADMIN", "CAP_SYS_ADMIN", "SYS_PTRACE", "CAP_SYS_PTRACE",
  "NET_ADMIN", "CAP_NET_ADMIN", "SYS_RAWIO", "CAP_SYS_RAWIO",
  "DAC_OVERRIDE", "CAP_DAC_OVERRIDE",
]);

const ALLOWED_MOUNT_PREFIXES = [
  "/workspace", "/tmp",
  process.env.HOME || "/root",  // docker_isolate mounts $HOME:$HOME
];

/** Check if a mount source path is allowed. Returns error string or null. */
function checkMount(mountSpec: string): string | null {
  if (mountSpec.includes("docker.sock")) return "docker.sock mount not allowed";
  const src = mountSpec.split(":")[0];
  if (src.startsWith("/") && !ALLOWED_MOUNT_PREFIXES.some(p => src === p || src.startsWith(p + "/")))
    return `bind mount '${src}' outside allowed prefixes (${ALLOWED_MOUNT_PREFIXES.join(", ")})`;
  return null;
}

/** Parse a flag that may be --flag=val or --flag val. Returns the value and how many args consumed. */
function flagVal(args: string[], i: number, flag: string): [string, number] {
  const a = args[i];
  if (a === flag && i + 1 < args.length) return [args[i + 1], 2];
  if (a.startsWith(flag + "=")) return [a.slice(flag.length + 1), 1];
  return ["", 0];
}

/** Validate docker run/create args. Strips dangerous flags, blocks forbidden ones. */
function validateAndSanitizeRunArgs(args: string[]): { error?: string; sanitized: string[] } {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];

    if (a === "--privileged") return { error: "privileged containers not allowed", sanitized: [] };
    if (a === "--device" || a.startsWith("--device=")) return { error: "device mapping not allowed", sanitized: [] };
    if (a === "--volumes-from" || a.startsWith("--volumes-from=")) return { error: "volumes-from not allowed", sanitized: [] };

    // Dangerous capabilities
    for (const flag of ["--cap-add"]) {
      const [val, consumed] = flagVal(args, i, flag);
      if (consumed && DANGEROUS_CAPS.has(val.toUpperCase()))
        return { error: `capability ${val.toUpperCase()} not allowed`, sanitized: [] };
    }

    // Host namespace flags
    for (const [flag, label] of [["--network", "network"], ["--net", "network"], ["--ipc", "IPC"], ["--uts", "UTS"]] as const) {
      const [val, consumed] = flagVal(args, i, flag);
      if (consumed && val === "host") return { error: `host ${label} not allowed`, sanitized: [] };
    }

    // Strip --pid=host silently (docker_isolate uses it, works without)
    {
      const [val, consumed] = flagVal(args, i, "--pid");
      if (consumed && val === "host") { i += consumed; continue; }
    }

    // Validate bind mounts (-v, --volume, -vPATH:DST)
    for (const flag of ["-v", "--volume"]) {
      const [val, consumed] = flagVal(args, i, flag);
      if (consumed) { const e = checkMount(val); if (e) return { error: e, sanitized: [] }; }
    }
    // Handle -v/path:/dst (no space, short form)
    if (a.startsWith("-v") && a.length > 2 && !a.startsWith("-v ") && !a.startsWith("-v=")) {
      const e = checkMount(a.slice(2));
      if (e) return { error: e, sanitized: [] };
    }

    // Validate --mount source=
    {
      const [val, consumed] = flagVal(args, i, "--mount");
      if (consumed) {
        if (val.includes("docker.sock")) return { error: "docker.sock mount not allowed", sanitized: [] };
        const srcMatch = val.match(/(?:source|src)=([^,]+)/i);
        if (srcMatch) { const e = checkMount(srcMatch[1] + ":"); if (e) return { error: e, sanitized: [] }; }
      }
    }

    out.push(a);
    i++;
  }
  return { sanitized: out };
}

/** Reference repo git dir — used to verify compose files match the committed version. */
const REFERENCE_GIT = existsSync("/reference-repo/.git") ? "/reference-repo/.git" : "";

/** Validate compose file content matches what's committed in the reference repo (next branch). */
function validateComposeFile(composefile: string): string | null {
  if (!composefile.startsWith("/workspace/aztec-packages/")) {
    return "compose file must be under /workspace/aztec-packages/";
  }
  if (!existsSync(composefile)) return `file not found: ${composefile}`;

  const repoRelPath = composefile.replace("/workspace/aztec-packages/", "");

  if (!REFERENCE_GIT) {
    // No reference repo — fall back to allowing if the file exists in the workspace
    // (happens during local testing without the full container setup)
    console.log(`[docker-proxy] compose verify: no reference repo, allowing ${repoRelPath}`);
    return null;
  }

  // Use git show to get the committed version from the reference repo
  try {
    const committed = execFileSync("git", [
      "--git-dir", REFERENCE_GIT, "show", `HEAD:${repoRelPath}`,
    ], { encoding: "utf-8", timeout: 10000 });

    const localContent = readFileSync(composefile, "utf-8");
    const localHash = createHash("sha256").update(localContent).digest("hex");
    const committedHash = createHash("sha256").update(committed).digest("hex");

    if (localHash !== committedHash) {
      return `compose file '${repoRelPath}' has been modified (hash mismatch vs reference repo)`;
    }
  } catch (e: any) {
    // File doesn't exist in reference repo
    if (e.stderr?.includes("does not exist") || e.stderr?.includes("exists on disk")) {
      return `compose file '${repoRelPath}' not found in reference repo`;
    }
    return `compose file verification failed: ${e.message}`;
  }

  return null;
}

/** Handle POST /docker — receives {"args": ["run", "--rm", ...]} */
async function handleDockerProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const bodyStr = await readBody(req);
  let payload: any;
  try { payload = JSON.parse(bodyStr); } catch {
    res.writeHead(400); res.end('{"error":"invalid JSON"}'); return;
  }

  const rawArgs: string[] = payload.args;
  if (!Array.isArray(rawArgs) || rawArgs.length === 0) {
    res.writeHead(400); res.end('{"error":"missing args array"}'); return;
  }

  const subcommand = rawArgs[0];
  let dockerArgs: string[];
  let timeout = 30 * 60 * 1000;

  // ── docker run / create ────────────────────────────────────────
  if (subcommand === "run" || subcommand === "create") {
    const { error, sanitized } = validateAndSanitizeRunArgs(rawArgs.slice(1));
    if (error) {
      res.writeHead(403); res.end(JSON.stringify({ error })); return;
    }
    dockerArgs = [subcommand, ...sanitized];

  // ── docker build ───────────────────────────────────────────────
  } else if (subcommand === "build") {
    // Allow builds — the build context must be under allowed prefixes
    const contextArg = rawArgs[rawArgs.length - 1];
    if (contextArg.startsWith("/") && !ALLOWED_MOUNT_PREFIXES.some(p => contextArg === p || contextArg.startsWith(p + "/"))) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: `build context '${contextArg}' outside allowed prefixes (${ALLOWED_MOUNT_PREFIXES.join(", ")})` }));
      return;
    }
    dockerArgs = rawArgs;
    timeout = 60 * 60 * 1000;

  // ── docker compose ─────────────────────────────────────────────
  } else if (subcommand === "compose") {
    // Find the compose file from args (-f/--file)
    let composefile = "";
    for (let i = 1; i < rawArgs.length; i++) {
      if ((rawArgs[i] === "-f" || rawArgs[i] === "--file") && i + 1 < rawArgs.length) {
        composefile = rawArgs[i + 1]; break;
      }
      if (rawArgs[i].startsWith("-f") && rawArgs[i].length > 2) {
        composefile = rawArgs[i].slice(2); break;
      }
      if (rawArgs[i].startsWith("--file=")) {
        composefile = rawArgs[i].split("=").slice(1).join("="); break;
      }
    }

    if (composefile) {
      const err = await validateComposeFile(composefile);
      if (err) { res.writeHead(403); res.end(JSON.stringify({ error: err })); return; }
    }
    // If no -f, docker compose uses ./docker-compose.yml which is fine

    dockerArgs = rawArgs;
    timeout = 60 * 60 * 1000;

  // ── Safe read-only commands ────────────────────────────────────
  } else if (["ps", "images", "logs", "inspect", "wait", "port", "top", "stats",
              "network", "volume", "info", "version", "tag", "pull", "save", "load",
              "login", "logout"].includes(subcommand)) {
    dockerArgs = rawArgs;

  // ── Container lifecycle (stop, rm, kill) — allow freely ────────
  } else if (["stop", "rm", "kill", "start", "restart", "pause", "unpause"].includes(subcommand)) {
    dockerArgs = rawArgs;

  // ── docker exec — allow but strip dangerous flags ──────────────
  } else if (subcommand === "exec") {
    // Strip --privileged from exec
    dockerArgs = rawArgs.filter(a => a !== "--privileged");

  // ── Block everything else ──────────────────────────────────────
  } else {
    res.writeHead(403);
    res.end(JSON.stringify({ error: `docker subcommand '${subcommand}' not allowed` }));
    return;
  }

  console.log(`[docker-proxy] ${dockerArgs.slice(0, 3).join(" ")}...`);

  // Stream output back
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Transfer-Encoding": "chunked",
    "X-Accel-Buffering": "no",
  });

  const proc = spawn(DOCKER_BIN, dockerArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: payload.cwd || WORKSPACE,
    env: { ...process.env, ...(payload.env || {}) },
  });
  proc.stdout?.on("data", (d: Buffer) => { try { res.write(d); } catch {} });
  proc.stderr?.on("data", (d: Buffer) => { try { res.write(d); } catch {} });
  proc.on("close", (code) => {
    try { res.end(`\n__DOCKERPROXY_EXIT__:${code ?? 1}\n`); } catch {}
  });
  const timer = setTimeout(() => { try { proc.kill("SIGTERM"); } catch {} }, timeout);
  proc.on("close", () => clearTimeout(timer));
  req.on("close", () => { try { proc.kill("SIGTERM"); } catch {} });
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    return;
  }

  // Docker proxy endpoint
  if (req.url === "/docker" && req.method === "POST") {
    try {
      await handleDockerProxy(req, res);
    } catch (e: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    }
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

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[Sidecar] :${PORT} gh=${GH_TOKEN ? "yes" : "no"} slack=${SLACK_BOT_TOKEN ? "yes" : "no"} linear=${LINEAR_API_KEY ? "yes" : "no"} quiet=${QUIET_MODE ? "yes" : "no"} docker=${existsSync("/var/run/docker.sock") ? "yes" : "no"}`);
});

process.on("SIGTERM", () => {
  httpServer.close();
  process.exit(0);
});
