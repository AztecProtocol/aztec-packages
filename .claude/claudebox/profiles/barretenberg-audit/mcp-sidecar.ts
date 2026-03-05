#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox Barretenberg Audit Profile Sidecar
 *
 * Repo: AztecProtocol/barretenberg-claude (private fork)
 * Clone strategy: remote authenticated URL (no local reference)
 * Docker proxy: disabled
 * Extra tools: create_issue, close_issue, create_audit_label, add_log_link, self_assess
 */

import { mkdirSync, appendFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

import {
  z, McpServer,
  GH_TOKEN, SESSION_META, WORKTREE_ID, statusPageUrl, STATS_DIR,
  buildCommonGhWhitelist, sanitizeError,
  logActivity, updateRootComment, otherArtifacts,
  registerCommonTools, registerCloneRepo, registerPRTools, startMcpHttpServer,
} from "../../mcp-base.ts";

// ── Profile config ──────────────────────────────────────────────
const REPO = "AztecProtocol/barretenberg-claude";
const WORKSPACE = "/workspace/barretenberg-claude";
const R = `repos/${REPO}`;

SESSION_META.repo = REPO;

const GH_WHITELIST = [
  ...buildCommonGhWhitelist(R),
  // Read-only extras — all writes handled by create_issue, close_issue, add_labels, add_log_link, create_audit_label
  { method: "GET",  pattern: new RegExp(`^${R}/labels(\\?.*)?$`) },
  { method: "POST", pattern: new RegExp(`^${R}/issues/\\d+/labels$`) },
];

const TOOL_LIST = "clone_repo, respond_to_user, get_context, session_status, github_api, slack_api, create_pr, update_pr, create_issue, close_issue, add_labels, create_audit_label, add_log_link, self_assess, audit_history, create_gist, create_skill, ci_failures, linear_get_issue, linear_create_issue, record_stat";

// ── Auth check at startup ───────────────────────────────────────
if (GH_TOKEN) {
  const authRes = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Authorization: `Bearer ${GH_TOKEN}` },
  });
  if (!authRes.ok) {
    console.error(`[FATAL] Cannot access ${REPO} (${authRes.status}). Token may lack permissions.`);
    process.exit(1);
  }
  console.log(`[AUDIT] Verified access to ${REPO}`);
} else {
  console.error(`[FATAL] No GH_TOKEN — cannot access private repo ${REPO}`);
  process.exit(1);
}

// ── MCP Server factory ──────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: "claudebox-audit", version: "1.0.0" });

  registerCommonTools(server, { repo: REPO, workspace: WORKSPACE, tools: TOOL_LIST, ghWhitelist: GH_WHITELIST });

  registerCloneRepo(server, {
    repo: REPO, workspace: WORKSPACE,
    strategy: "authenticated-url",
    fallbackRef: "origin/master",
    refHint: "'origin/main', 'abc123'",
    description: "Clone the barretenberg-claude repo (private). Uses authenticated URL. Safe to call on resume — fetches new refs. Call FIRST before doing any work.",
  });

  registerPRTools(server, {
    repo: REPO, workspace: WORKSPACE,
    branchPrefix: "audit/", defaultBase: "master",
  });

  // ── create_issue — audit-only ─────────────────────────────────
  server.tool("create_issue",
    "Create a GitHub issue on barretenberg-claude for audit findings.",
    {
      title: z.string().describe("Issue title — short summary of the finding"),
      body: z.string().describe("Issue body (Markdown) — detailed description, affected code, severity, reproduction steps"),
      labels: z.array(z.string()).optional().describe("Labels, e.g. ['security', 'high-severity']"),
    },
    async ({ title, body, labels }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, body, labels: labels || [] }),
        });
        const issue = await res.json() as any;
        if (!res.ok)
          return { content: [{ type: "text", text: `Failed: ${issue.message || JSON.stringify(issue)}` }], isError: true };

        otherArtifacts.push(`- [Issue #${issue.number}: ${title}](${issue.html_url})`);
        logActivity("artifact", `Issue #${issue.number}: ${title} — ${issue.html_url}`);
        await updateRootComment();

        return { content: [{ type: "text", text: `${issue.html_url}\n#${issue.number}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_issue: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  // ── close_issue — audit-only ─────────────────────────────────
  server.tool("close_issue",
    "Close a GitHub issue on barretenberg-claude. Posts a tracking comment with session log link before closing.",
    {
      issue_number: z.number().describe("Issue number to close"),
      reason: z.string().describe("Why the issue is being closed (e.g. 'fixed in PR #5', 'not a real vulnerability', 'duplicate of #3')"),
    },
    async ({ issue_number, reason }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };
      const headers = {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      };

      try {
        // Verify issue exists
        const getRes = await fetch(`https://api.github.com/repos/${REPO}/issues/${issue_number}`, { headers });
        if (!getRes.ok) return { content: [{ type: "text", text: `Issue #${issue_number} not found (HTTP ${getRes.status})` }], isError: true };
        const issue = await getRes.json() as any;

        // Post tracking comment with session info
        const logLine = SESSION_META.log_url ? `Log: ${SESSION_META.log_url}` : "";
        const statusLine = statusPageUrl ? `Status: ${statusPageUrl}` : "";
        const commentBody = [
          `**Closed by ClaudeBox** — ${reason}`,
          "",
          `Session: ${SESSION_META.user || "unknown"}`,
          logLine,
          statusLine,
        ].filter(Boolean).join("\n");

        await fetch(`https://api.github.com/repos/${REPO}/issues/${issue_number}/comments`, {
          method: "POST", headers,
          body: JSON.stringify({ body: commentBody }),
        });

        // Close the issue
        const closeRes = await fetch(`https://api.github.com/repos/${REPO}/issues/${issue_number}`, {
          method: "PATCH", headers,
          body: JSON.stringify({ state: "closed" }),
        });
        if (!closeRes.ok) {
          const err = await closeRes.json() as any;
          return { content: [{ type: "text", text: `Failed to close: ${err.message || JSON.stringify(err)}` }], isError: true };
        }

        logActivity("artifact", `Closed issue #${issue_number}: ${issue.title} — ${issue.html_url}`);
        await updateRootComment();

        return { content: [{ type: "text", text: `Closed #${issue_number}: ${issue.title}\n${issue.html_url}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `close_issue: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  // ── add_labels — add labels to an issue or PR ──────────────────
  server.tool("add_labels",
    "Add labels to a GitHub issue or pull request on barretenberg-claude.",
    {
      issue_number: z.number().describe("Issue or PR number"),
      labels: z.array(z.string()).describe("Labels to add, e.g. ['merge-to-aztec-packages', 'security']"),
    },
    async ({ issue_number, labels }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/issues/${issue_number}/labels`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ labels }),
        });
        if (!res.ok) {
          const err = await res.json() as any;
          return { content: [{ type: "text", text: `Failed: ${err.message || JSON.stringify(err)}` }], isError: true };
        }
        const result = await res.json() as any[];
        const applied = result.map((l: any) => l.name).join(", ");
        return { content: [{ type: "text", text: `Labels on #${issue_number}: ${applied}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `add_labels: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  // ── create_audit_label — create scope label + commit prompt file ─
  server.tool("create_audit_label",
    `Create a new audit scope label on barretenberg-claude AND commit a prompt file to claudebox/prompts/.
The label will be named "scope/<slug>" and the prompt file will be committed directly to the repo's default branch.
Use this when you discover a new area worth dedicated audit attention.`,
    {
      slug: z.string().describe("Label slug (becomes scope/<slug>), e.g. 'kzg-commitment', 'field-arithmetic'"),
      description: z.string().describe("Human-readable description of what this scope covers"),
      color: z.string().default("d93f0b").describe("Label color hex (6 chars, no #)"),
      prompt: z.string().describe("Full markdown prompt content — audit instructions for this scope"),
      modules: z.array(z.string()).describe("Source paths this scope covers, e.g. ['barretenberg/cpp/src/barretenberg/ecc']"),
    },
    async ({ slug, description, color, prompt, modules }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };
      const headers = {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      };
      const results: string[] = [];

      try {
        // 1. Create the GitHub label
        const labelName = `scope/${slug}`;
        const labelRes = await fetch(`https://api.github.com/repos/${REPO}/labels`, {
          method: "POST", headers,
          body: JSON.stringify({ name: labelName, color, description }),
        });
        const labelData = await labelRes.json() as any;
        if (labelRes.ok) {
          results.push(`Label created: ${labelName}`);
        } else if (labelData.errors?.[0]?.code === "already_exists") {
          results.push(`Label already exists: ${labelName}`);
        } else {
          return { content: [{ type: "text", text: `Label creation failed: ${labelData.message || JSON.stringify(labelData)}` }], isError: true };
        }

        // 2. Commit prompt file via Contents API
        const filePath = `claudebox/prompts/${slug}.md`;
        const content = Buffer.from(prompt).toString("base64");

        // Check if file exists (get SHA for update)
        let sha: string | undefined;
        const existingRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${filePath}`, { headers });
        if (existingRes.ok) {
          const existing = await existingRes.json() as any;
          sha = existing.sha;
        }

        const commitRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${filePath}`, {
          method: "PUT", headers,
          body: JSON.stringify({
            message: `audit: add scope prompt for ${labelName}`,
            content,
            ...(sha ? { sha } : {}),
          }),
        });
        if (!commitRes.ok) {
          const err = await commitRes.json() as any;
          return { content: [{ type: "text", text: `Prompt file commit failed: ${err.message || JSON.stringify(err)}` }], isError: true };
        }
        results.push(`Committed: ${filePath}`);

        // 3. Update labels.json
        const labelsJsonPath = "claudebox/labels.json";
        let labelsJson: any = { labels: [], meta_labels: [], area_labels: [] };
        let labelsJsonSha: string | undefined;
        const ljRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${labelsJsonPath}`, { headers });
        if (ljRes.ok) {
          const ljData = await ljRes.json() as any;
          labelsJsonSha = ljData.sha;
          try { labelsJson = JSON.parse(Buffer.from(ljData.content, "base64").toString()); } catch {}
        }
        // Add or update entry
        const existing = labelsJson.labels?.findIndex((l: any) => l.name === labelName);
        const entry = { name: labelName, color, description, prompt_file: `prompts/${slug}.md`, modules };
        if (existing >= 0) labelsJson.labels[existing] = entry;
        else (labelsJson.labels ??= []).push(entry);

        const ljCommitRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${labelsJsonPath}`, {
          method: "PUT", headers,
          body: JSON.stringify({
            message: `audit: update labels.json for ${labelName}`,
            content: Buffer.from(JSON.stringify(labelsJson, null, 2)).toString("base64"),
            ...(labelsJsonSha ? { sha: labelsJsonSha } : {}),
          }),
        });
        if (ljCommitRes.ok) results.push("Updated labels.json");

        logActivity("artifact", `Created audit label: ${labelName}`);
        await updateRootComment();

        return { content: [{ type: "text", text: results.join("\n") }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `create_audit_label: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  // ── add_log_link — cross-reference session on an issue ──────────
  server.tool("add_log_link",
    "Add a cross-reference comment to an issue linking it to the current session's log. Use this to build an audit trail connecting issues to the sessions that investigated them.",
    {
      issue_number: z.number().describe("Issue number to link"),
      context: z.string().describe("What this session did related to this issue (1-2 sentences)"),
    },
    async ({ issue_number, context }) => {
      if (!GH_TOKEN) return { content: [{ type: "text", text: "No GH_TOKEN" }], isError: true };

      try {
        const body = [
          `**Session cross-reference**`,
          ``,
          context,
          ``,
          `- Log: ${SESSION_META.log_url || "n/a"}`,
          `- Status: ${statusPageUrl || "n/a"}`,
          `- Session: \`${SESSION_META.log_id || WORKTREE_ID}\``,
        ].join("\n");

        const res = await fetch(`https://api.github.com/repos/${REPO}/issues/${issue_number}/comments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) {
          const err = await res.json() as any;
          return { content: [{ type: "text", text: `Failed: ${err.message || JSON.stringify(err)}` }], isError: true };
        }

        logActivity("artifact", `Cross-ref #${issue_number}: ${context}`);
        await updateRootComment();
        return { content: [{ type: "text", text: `Linked session to #${issue_number}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `add_log_link: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  // ── self_assess — session self-assessment ────────────────────────
  server.tool("self_assess",
    `Rate your own audit session. Call this BEFORE respond_to_user.
Be honest about your assessment:
- critical = found security-relevant issues
- thorough = deep line-by-line review, no critical issues found
- surface = quick scan, identified areas for deeper review
- incomplete = could not finish due to complexity or missing context`,
    {
      rating: z.enum(["critical", "thorough", "surface", "incomplete"]).describe("Self-assessment rating"),
      modules_reviewed: z.array(z.string()).describe("Source paths reviewed, e.g. ['barretenberg/cpp/src/barretenberg/ecc/curves']"),
      findings_count: z.number().describe("Number of issues filed this session"),
      questions_count: z.number().describe("Number of question issues posted this session"),
      confidence: z.number().min(0).max(1).describe("Confidence in the review (0 = guessing, 1 = certain)"),
      summary: z.string().describe("2-3 sentence summary of what was covered and key findings"),
    },
    async ({ rating, modules_reviewed, findings_count, questions_count, confidence, summary }) => {
      try {
        const entry = {
          _ts: new Date().toISOString(),
          _log_id: SESSION_META.log_id,
          _worktree_id: WORKTREE_ID,
          _user: SESSION_META.user,
          rating,
          modules_reviewed,
          findings_count,
          questions_count,
          confidence,
          summary,
        };

        // Write to stats JSONL
        mkdirSync(STATS_DIR, { recursive: true });
        appendFileSync(join(STATS_DIR, "audit_assessment.jsonl"), JSON.stringify(entry) + "\n");

        // Log to activity for status page
        logActivity("status", `Assessment: ${rating.toUpperCase()} (${Math.round(confidence * 100)}% confidence) — ${summary}`);
        await updateRootComment();

        return { content: [{ type: "text", text: `Assessment recorded: ${rating} (${modules_reviewed.length} modules, ${findings_count} findings, ${questions_count} questions)` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `self_assess: ${sanitizeError(e.message)}` }], isError: true };
      }
    });

  // ── audit_history — read prior audit stats for continuity ───────
  server.tool("audit_history",
    `Get a summary of all prior audit work: file coverage by module, session assessments, session summary gists, and open issues.
Call this EARLY in your session to understand what has already been reviewed and where to focus next.
The response includes:
- Per-module file coverage (reviewed vs total, depth levels)
- Recent session assessments (rating, summary, confidence)
- Session summary gist URLs (detailed findings)
- List of all reviewed files with notes`,
    {},
    async () => {
      const lines: string[] = [];

      // Read file reviews
      const reviewFile = join(STATS_DIR, "audit_file_review.jsonl");
      const reviews: any[] = [];
      if (existsSync(reviewFile)) {
        readFileSync(reviewFile, "utf-8").split("\n").filter(l => l.trim()).forEach(l => {
          try { reviews.push(JSON.parse(l)); } catch {}
        });
      }

      // Read assessments
      const assessFile = join(STATS_DIR, "audit_assessment.jsonl");
      const assessments: any[] = [];
      if (existsSync(assessFile)) {
        readFileSync(assessFile, "utf-8").split("\n").filter(l => l.trim()).forEach(l => {
          try { assessments.push(JSON.parse(l)); } catch {}
        });
      }

      // Read summaries
      const summaryFile = join(STATS_DIR, "audit_summary.jsonl");
      const summaries: any[] = [];
      if (existsSync(summaryFile)) {
        readFileSync(summaryFile, "utf-8").split("\n").filter(l => l.trim()).forEach(l => {
          try { summaries.push(JSON.parse(l)); } catch {}
        });
      }

      // Dedupe files — keep deepest review per file_path
      const depthOrder: Record<string, number> = { cursory: 0, "line-by-line": 1, deep: 2 };
      const byFile = new Map<string, any>();
      for (const r of reviews) {
        const existing = byFile.get(r.file_path);
        if (!existing || (depthOrder[r.review_depth] ?? 0) > (depthOrder[existing.review_depth] ?? 0)) {
          byFile.set(r.file_path, r);
        }
      }

      // Group by module
      const byModule = new Map<string, { files: any[], issues: number }>();
      for (const r of byFile.values()) {
        const mod = r.module || "unknown";
        if (!byModule.has(mod)) byModule.set(mod, { files: [], issues: 0 });
        const m = byModule.get(mod)!;
        m.files.push(r);
        m.issues += r.issues_found || 0;
      }

      // Format output
      lines.push(`# Audit History`);
      lines.push(`Total unique files reviewed: ${byFile.size}`);
      lines.push(`Total review entries: ${reviews.length}`);
      lines.push(`Total sessions assessed: ${assessments.length}`);
      lines.push(``);

      // Module coverage
      lines.push(`## Module Coverage`);
      for (const [mod, data] of [...byModule.entries()].sort((a, b) => b[1].files.length - a[1].files.length)) {
        const depths: Record<string, number> = {};
        data.files.forEach((f: any) => { depths[f.review_depth] = (depths[f.review_depth] || 0) + 1; });
        const depthStr = Object.entries(depths).map(([d, n]) => `${n} ${d}`).join(", ");
        lines.push(`- **${mod}**: ${data.files.length} files (${depthStr}), ${data.issues} issues`);
      }
      lines.push(``);

      // Reviewed files detail
      lines.push(`## Reviewed Files`);
      for (const [path, r] of [...byFile.entries()].sort()) {
        const noteStr = r.notes ? ` — ${r.notes}` : "";
        const issueStr = r.issues_found ? ` [${r.issues_found} issue(s)]` : "";
        lines.push(`- \`${path}\` (${r.review_depth})${issueStr}${noteStr}`);
      }
      lines.push(``);

      // Session assessments (most recent first)
      if (assessments.length) {
        lines.push(`## Session Assessments (${assessments.length} sessions)`);
        for (const a of assessments.slice().reverse().slice(0, 20)) {
          const date = a._ts ? new Date(a._ts).toISOString().slice(0, 10) : "?";
          lines.push(`- [${date}] **${a.rating}** (${Math.round((a.confidence || 0) * 100)}% confidence) — ${a.summary || "no summary"}`);
          if (a.modules_reviewed?.length) lines.push(`  Modules: ${a.modules_reviewed.join(", ")}`);
          lines.push(`  Findings: ${a.findings_count || 0}, Questions: ${a.questions_count || 0}, Session: ${a._log_id || "?"}`);
        }
        lines.push(``);
      }

      // Session summaries with gist links
      if (summaries.length) {
        lines.push(`## Session Summary Gists`);
        for (const s of summaries.slice().reverse()) {
          const date = s._ts ? new Date(s._ts).toISOString().slice(0, 10) : "?";
          lines.push(`- [${date}] ${s.summary || "no summary"}`);
          if (s.gist_url) lines.push(`  Gist: ${s.gist_url}`);
          lines.push(`  Files: ${s.files_reviewed || 0}, Issues: ${s.issues_filed || 0}, Session: ${s._log_id || "?"}`);
        }
        lines.push(``);
      }

      if (!reviews.length && !assessments.length) {
        lines.push(`No prior audit data found. This appears to be the first session.`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    });

  return server;
}

// ── Start server ────────────────────────────────────────────────

startMcpHttpServer(createServer);
