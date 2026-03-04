#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * ClaudeBox Barretenberg Audit Profile Sidecar
 *
 * Repo: AztecProtocol/barretenberg-claude (private fork)
 * Clone strategy: remote authenticated URL (no local reference)
 * Docker proxy: disabled
 * Extra tools: create_issue, close_issue, ask_questions, create_audit_label, add_log_link, list_questions, self_assess
 */

import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";

import {
  z, McpServer,
  GH_TOKEN, SESSION_META, WORKTREE_ID, statusPageUrl, STATS_DIR,
  buildCommonGhWhitelist, sanitizeError,
  logActivity, updateRootComment, otherArtifacts,
  registerCommonTools, registerCloneRepo, registerPRTools, startMcpHttpServer,
} from "../../mcp-base.ts";

import { QuestionStore } from "../../lib/question-store.ts";

// ── Profile config ──────────────────────────────────────────────
const REPO = "AztecProtocol/barretenberg-claude";
const WORKSPACE = "/workspace/barretenberg-claude";
const R = `repos/${REPO}`;

SESSION_META.repo = REPO;

const GH_WHITELIST = [
  ...buildCommonGhWhitelist(R),
  { method: "POST", pattern: new RegExp(`^${R}/issues$`) },
  { method: "PATCH", pattern: new RegExp(`^${R}/issues/\\d+$`) },
  { method: "POST", pattern: new RegExp(`^${R}/issues/\\d+/comments$`) },
  // Labels (create)
  { method: "POST", pattern: new RegExp(`^${R}/labels$`) },
  { method: "GET",  pattern: new RegExp(`^${R}/labels(\\?.*)?$`) },
  // Contents (commit prompt files)
  { method: "PUT",  pattern: new RegExp(`^${R}/contents/.*$`) },
];

const TOOL_LIST = "clone_repo, respond_to_user, get_context, session_status, github_api, slack_api, create_pr, update_pr, create_issue, close_issue, ask_questions, create_audit_label, add_log_link, list_questions, self_assess, create_gist, create_skill, ci_failures, linear_get_issue, linear_create_issue, record_stat";

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

  // ── ask_questions — interactive multiple-choice questions for human experts ──
  server.tool("ask_questions",
    `Post 1-5 multiple-choice questions for human experts. Questions appear on the audit status page with countdown timers and are pushed to the repo's "questions" branch. The session will auto-resume when all questions are answered or expired.

Each question is in "skill form" with separate description and body:
- description: Short summary of what the question is about (like a skill description)
- body: Detailed reasoning, code references, implementation plan context (like a skill body)
- text: The actual question to ask
- context: Why this matters
- options: 2-4 multiple-choice answers (humans can also pick "Other" with freeform text)
- urgency: "critical" (30min), "important" (2hr), or "nice-to-have" (24hr)

Think carefully — provide clear options that reference your implementation plan and reasoning so the expert can give informed answers.`,
    {
      questions: z.array(z.object({
        description: z.string().describe("Short summary of the question topic (skill description form)"),
        body: z.string().describe("Detailed reasoning, code references, implementation plan (skill body form)"),
        text: z.string().describe("The actual question to ask"),
        context: z.string().describe("Why this matters — what blocks the audit without an answer"),
        options: z.array(z.object({
          label: z.string().describe("Short option label (1-5 words)"),
          description: z.string().describe("What this option means or implies"),
        })).min(2).max(4).describe("Multiple-choice options (human can also pick 'Other')"),
        urgency: z.enum(["critical", "important", "nice-to-have"]).describe("How urgent — sets countdown deadline"),
      })).min(1).max(5).describe("Questions to ask (1-5)"),
    },
    async ({ questions }) => {
      try {
        const questionStore = new QuestionStore();
        const created = questionStore.addQuestions(WORKTREE_ID, questions);

        // Push question files to the repo's "questions" branch
        let pushResult = "";
        if (GH_TOKEN) {
          try {
            const pushed = await questionStore.pushToQuestionsBranch(WORKTREE_ID, REPO, GH_TOKEN);
            pushResult = pushed.length ? `\nPushed ${pushed.length} question files to questions branch.` : "";
          } catch (e: any) {
            pushResult = `\nWarning: failed to push to questions branch: ${e.message}`;
          }
        }

        const summary = created.map((q, i) =>
          `Q${i + 1} [${q.urgency}] (deadline: ${q.deadline}): ${q.description}\n  ${q.text}\n  Options: ${q.options.map(o => o.label).join(" | ")} | Other`
        ).join("\n");

        logActivity("artifact", `Posted ${created.length} questions to status page — awaiting expert answers`);
        await updateRootComment();

        return { content: [{ type: "text", text: `Posted ${created.length} questions to the audit status page.${pushResult}\n\n${summary}\n\nThe session will auto-resume when all questions are answered or their deadlines expire. Call respond_to_user now to end this session.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `ask_questions: ${sanitizeError(e.message)}` }], isError: true };
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

  // ── list_questions — see pending/answered/expired audit questions ──
  server.tool("list_questions",
    "List audit questions from the local question store. Use this to check what questions are pending, answered, or expired before filing new ones.",
    {
      state: z.enum(["pending", "answered", "expired", "all"]).default("all").describe("Question status filter"),
    },
    async ({ state }) => {
      try {
        const questionStore = new QuestionStore();
        const filter = state === "all" ? undefined : state;
        const questions = questionStore.getAll(filter);

        if (!questions.length) return { content: [{ type: "text", text: `No questions found (status=${state})` }] };

        const lines = questions.map((q) => {
          const deadline = q.status === "pending" ? ` deadline:${q.deadline}` : "";
          const answer = q.status === "answered" ? ` → ${q.selected_option}${q.freeform_answer ? " (+details)" : ""}` : "";
          return `[${q.id}] [${q.status}] (${q.urgency}${deadline}) ${q.description}: ${q.text}${answer} — worktree:${q.worktree_id.slice(0, 8)}`;
        });

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `list_questions: ${sanitizeError(e.message)}` }], isError: true };
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

  return server;
}

// ── Start server (no docker proxy) ──────────────────────────────

startMcpHttpServer(createServer, { enableDockerProxy: false });
