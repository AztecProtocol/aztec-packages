#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox MCP Sidecar — runs in its OWN container, shares workspace with Claude.
 *
 * Holds GH_TOKEN + SLACK_BOT_TOKEN. Claude's container never sees them.
 * Both containers mount the same /workspace and /reference-repo/.git.
 *
 * Tools: github_api (whitelisted), slack_api (whitelisted), create_pr,
 *        linear_get_issue, linear_create_issue, session_status, get_context.
 *
 * Auth: token embedded in URL path (/mcp/<token>).
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { execFileSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ── Config ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.MCP_PORT || "9801", 10);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "";
const GH_TOKEN = process.env.GH_TOKEN || "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
const WORKSPACE = "/workspace/aztec-packages";
const REPO = "AztecProtocol/aztec-packages";

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
};

// ── GitHub API whitelist ────────────────────────────────────────
// All repo paths are locked to AztecProtocol/aztec-packages.

const R = "repos/AztecProtocol/aztec-packages";
const GH_WHITELIST: Array<{ method: string; pattern: RegExp }> = [
  // PRs
  { method: "GET",   pattern: new RegExp(`^${R}/pulls(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/pulls/\\d+(/files)?$`) },
  { method: "POST",  pattern: new RegExp(`^${R}/pulls$`) },
  // Issues & comments
  { method: "GET",   pattern: new RegExp(`^${R}/issues(\\?.*)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/\\d+$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/\\d+/comments$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/issues/comments/\\d+$`) },
  { method: "PATCH", pattern: new RegExp(`^${R}/issues/comments/\\d+$`) },
  { method: "POST",  pattern: new RegExp(`^${R}/issues/\\d+/comments$`) },
  // Reactions
  { method: "POST",  pattern: new RegExp(`^${R}/issues/comments/\\d+/reactions$`) },
  // Actions / CI
  { method: "GET",   pattern: new RegExp(`^${R}/actions/runs/\\d+(/jobs|/logs)?$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/check-runs/\\d+$`) },
  { method: "GET",   pattern: new RegExp(`^${R}/check-suites/\\d+/check-runs$`) },
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

const SLACK_WHITELIST = new Set(["chat.postMessage", "chat.update", "reactions.add"]);

// ── Git helper (runs locally in sidecar container) ──────────────

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: WORKSPACE, encoding: "utf-8", timeout: 60000 });
}

// ── Create MCP Server ───────────────────────────────────────────

function createMcpServerWithTools(): McpServer {
  const server = new McpServer({ name: "claudebox-sidecar", version: "1.0.0" });

  // ── get_context ────────────────────────────────────────────────
  server.tool("get_context", "Session metadata: user, repo, log_url, comment_id, thread, etc.", {},
    async () => ({ content: [{ type: "text", text: JSON.stringify(SESSION_META, null, 2) }] }));

  // ── session_status ─────────────────────────────────────────────
  server.tool("session_status",
    "Update status in both Slack and GitHub. Log link auto-appended.",
    { status: z.string().describe("Status text") },
    async ({ status }) => {
      const results: string[] = [];
      const logLink = SESSION_META.log_url;

      if (SLACK_BOT_TOKEN && SESSION_META.slack_channel && SESSION_META.slack_message_ts) {
        try {
          const r = await fetch("https://slack.com/api/chat.update", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              channel: SESSION_META.slack_channel, ts: SESSION_META.slack_message_ts,
              text: logLink ? `${status} <${logLink}|log>` : status,
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
              body: JSON.stringify({ body: logLink ? `${status}\n\n[View log](${logLink})` : status }),
            });
          results.push(r.ok ? "GitHub updated" : `GitHub: ${r.status}`);
        } catch (e: any) { results.push(`GitHub: ${e.message}`); }
      }

      return { content: [{ type: "text", text: results.length ? results.join("\n") : "No channels configured" }] };
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

      const payload = { ...args };
      if (!payload.channel && SESSION_META.slack_channel) payload.channel = SESSION_META.slack_channel;
      if (!payload.thread_ts && SESSION_META.slack_thread_ts && method === "chat.postMessage")
        payload.thread_ts = SESSION_META.slack_thread_ts;
      if (!payload.ts && SESSION_META.slack_message_ts && method === "chat.update")
        payload.ts = SESSION_META.slack_message_ts;

      try {
        const res = await fetch(`https://slack.com/api/${method}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json() as any;
        if (!d.ok) return { content: [{ type: "text", text: `${method}: ${d.error}` }], isError: true };
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

        return { content: [{ type: "text", text: `${pr.html_url}\nBranch: ${branch}\n#${pr.number}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_pr: ${e.message}` }], isError: true };
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
        return { content: [{ type: "text", text: `${result.issue.identifier}: ${result.issue.title}\n${result.issue.url}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Linear API error: ${e.message}` }], isError: true };
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

const MCP_PATH = AUTH_TOKEN ? `/mcp/${AUTH_TOKEN}` : "/mcp";

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

  res.writeHead(req.url?.startsWith("/mcp") ? 403 : 404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: req.url?.startsWith("/mcp") ? "forbidden" : "not found" }));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[Sidecar] :${PORT} auth=${AUTH_TOKEN ? "yes" : "no"} gh=${GH_TOKEN ? "yes" : "no"} slack=${SLACK_BOT_TOKEN ? "yes" : "no"} linear=${LINEAR_API_KEY ? "yes" : "no"}`);
});

process.on("SIGTERM", () => { httpServer.close(); process.exit(0); });
