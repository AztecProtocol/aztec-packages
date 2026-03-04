import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export interface QuestionOption {
  label: string;
  description: string;
}

export interface AuditQuestion {
  id: string;
  worktree_id: string;
  // Skill-form fields (description + body stored separately)
  description: string;            // short description (like skill description)
  body: string;                   // detailed body — reasoning, code refs, implementation plan
  text: string;                   // the actual question
  context: string;                // why this matters
  options: QuestionOption[];      // multiple-choice options (2-4)
  urgency: "critical" | "important" | "nice-to-have";
  deadline: string;               // ISO timestamp
  status: "pending" | "answered" | "expired";
  selected_option?: string;       // label of chosen option, or "Other"
  freeform_answer?: string;       // freeform text (used with "Other" or for elaboration)
  answered_by?: string;
  answered_at?: string;
  created_at: string;
}

/** Freeform direction attached to a question batch for a worktree. */
export interface QuestionDirection {
  worktree_id: string;
  text: string;
  author: string;
  created_at: string;
}

const URGENCY_DEADLINES: Record<string, number> = {
  "critical": 30 * 60_000,       // 30 minutes
  "important": 2 * 3600_000,     // 2 hours
  "nice-to-have": 24 * 3600_000, // 24 hours
};

export interface QuestionInput {
  description: string;
  body: string;
  text: string;
  context: string;
  options: QuestionOption[];
  urgency: "critical" | "important" | "nice-to-have";
}

export class QuestionStore {
  private dir: string;

  constructor(baseDir?: string) {
    // Default: inside stats dir (which is already mounted rw into sidecar containers as /stats)
    const statsDir = process.env.CLAUDEBOX_STATS_DIR || join(process.env.HOME || "/root", ".claudebox", "stats");
    this.dir = baseDir || join(statsDir, "questions");
    mkdirSync(this.dir, { recursive: true });
  }

  private filePath(worktreeId: string): string {
    return join(this.dir, `${worktreeId}.jsonl`);
  }

  private directionPath(worktreeId: string): string {
    return join(this.dir, `${worktreeId}.direction.json`);
  }

  /** Add questions for a worktree. Returns the created questions. */
  addQuestions(worktreeId: string, questions: QuestionInput[]): AuditQuestion[] {
    const now = new Date();
    const created: AuditQuestion[] = questions.map(q => ({
      id: randomUUID().slice(0, 8),
      worktree_id: worktreeId,
      description: q.description,
      body: q.body,
      text: q.text,
      context: q.context,
      options: q.options,
      urgency: q.urgency,
      deadline: new Date(now.getTime() + (URGENCY_DEADLINES[q.urgency] || URGENCY_DEADLINES["important"])).toISOString(),
      status: "pending" as const,
      created_at: now.toISOString(),
    }));

    const lines = created.map(q => JSON.stringify(q)).join("\n") + "\n";
    const file = this.filePath(worktreeId);
    if (existsSync(file)) {
      const existing = readFileSync(file, "utf-8");
      writeFileSync(file, existing + lines);
    } else {
      writeFileSync(file, lines);
    }
    return created;
  }

  /** Read all questions for a worktree, optionally filtered by status. */
  getQuestions(worktreeId: string, status?: string): AuditQuestion[] {
    const file = this.filePath(worktreeId);
    if (!existsSync(file)) return [];
    const questions = readFileSync(file, "utf-8")
      .split("\n").filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) as AuditQuestion; } catch { return null; } })
      .filter((q): q is AuditQuestion => q !== null);
    if (status) return questions.filter(q => q.status === status);
    return questions;
  }

  /** Answer a specific question. Returns true if found and answered. */
  answerQuestion(worktreeId: string, questionId: string, selectedOption: string, freeformAnswer?: string, answeredBy?: string): boolean {
    const questions = this.getQuestions(worktreeId);
    const q = questions.find(q => q.id === questionId);
    if (!q || q.status !== "pending") return false;

    q.status = "answered";
    q.selected_option = selectedOption;
    q.freeform_answer = freeformAnswer || undefined;
    q.answered_by = answeredBy || "unknown";
    q.answered_at = new Date().toISOString();

    this.writeAll(worktreeId, questions);
    return true;
  }

  /** Save or update freeform direction for a worktree's question batch. */
  setDirection(worktreeId: string, text: string, author: string): void {
    const direction: QuestionDirection = {
      worktree_id: worktreeId,
      text,
      author,
      created_at: new Date().toISOString(),
    };
    writeFileSync(this.directionPath(worktreeId), JSON.stringify(direction));
  }

  /** Get freeform direction for a worktree. */
  getDirection(worktreeId: string): QuestionDirection | null {
    const file = this.directionPath(worktreeId);
    if (!existsSync(file)) return null;
    try { return JSON.parse(readFileSync(file, "utf-8")); } catch { return null; }
  }

  /** Check if all questions for a worktree are resolved (answered or expired). */
  allResolved(worktreeId: string): boolean {
    const questions = this.getQuestions(worktreeId);
    if (questions.length === 0) return false;
    return questions.every(q => q.status === "answered" || q.status === "expired");
  }

  /** Expire overdue pending questions. Returns worktree IDs that became fully resolved. */
  expireOverdue(): string[] {
    const now = Date.now();
    const resolvedWorktrees: string[] = [];

    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const worktreeId = file.replace(".jsonl", "");
      const questions = this.getQuestions(worktreeId);

      let changed = false;
      let hadPending = false;
      for (const q of questions) {
        if (q.status === "pending") {
          if (new Date(q.deadline).getTime() <= now) {
            q.status = "expired";
            changed = true;
          } else {
            hadPending = true;
          }
        }
      }

      if (changed) {
        this.writeAll(worktreeId, questions);
        if (!hadPending && this.allResolved(worktreeId)) {
          resolvedWorktrees.push(worktreeId);
        }
      }
    }

    return resolvedWorktrees;
  }

  /** Get all pending questions across all worktrees. */
  getAllPending(): AuditQuestion[] {
    const all: AuditQuestion[] = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const worktreeId = file.replace(".jsonl", "");
      all.push(...this.getQuestions(worktreeId, "pending"));
    }
    return all.sort((a, b) => a.deadline.localeCompare(b.deadline));
  }

  /** Get all questions across all worktrees (for dashboard). */
  getAll(status?: string): AuditQuestion[] {
    const all: AuditQuestion[] = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const worktreeId = file.replace(".jsonl", "");
      all.push(...this.getQuestions(worktreeId, status));
    }
    return all.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }

  /** Build a resume prompt from resolved questions + direction. */
  buildResumePrompt(worktreeId: string): string {
    const questions = this.getQuestions(worktreeId);
    const direction = this.getDirection(worktreeId);
    const lines: string[] = ["Your previous session asked questions. Here are the results:\n"];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      lines.push(`**Q${i + 1}** [${q.status}] (${q.urgency}): ${q.text}`);
      lines.push(`Description: ${q.description}`);
      if (q.context) lines.push(`Context: ${q.context}`);
      if (q.status === "answered") {
        lines.push(`Selected: ${q.selected_option || "n/a"}`);
        if (q.freeform_answer) lines.push(`Details: ${q.freeform_answer}`);
        if (q.answered_by) lines.push(`Answered by: ${q.answered_by}`);
      } else if (q.status === "expired") {
        lines.push(`(No answer received within deadline)`);
      }
      lines.push("");
    }

    if (direction?.text) {
      lines.push("---");
      lines.push(`**Further direction from ${direction.author}**:`);
      lines.push(direction.text);
      lines.push("");
    }

    lines.push("Continue your audit with this information.");
    return lines.join("\n");
  }

  /**
   * Build skill-form markdown files for each question (for pushing to questions branch).
   * Returns array of { path, content } for each question file.
   */
  buildQuestionFiles(worktreeId: string): Array<{ path: string; content: string }> {
    const questions = this.getQuestions(worktreeId);
    return questions.map(q => {
      const options = q.options.map(o => `- **${o.label}**: ${o.description}`).join("\n");
      const content = [
        `---`,
        `id: ${q.id}`,
        `worktree: ${q.worktree_id}`,
        `urgency: ${q.urgency}`,
        `deadline: ${q.deadline}`,
        `status: ${q.status}`,
        q.selected_option ? `selected: ${q.selected_option}` : null,
        q.answered_by ? `answered_by: ${q.answered_by}` : null,
        q.answered_at ? `answered_at: ${q.answered_at}` : null,
        `created: ${q.created_at}`,
        `---`,
        ``,
        `# ${q.description}`,
        ``,
        `## Question`,
        ``,
        q.text,
        ``,
        `## Context`,
        ``,
        q.context,
        ``,
        `## Options`,
        ``,
        options,
        `- **Other**: Freeform answer`,
        ``,
        `## Body`,
        ``,
        q.body,
        q.status === "answered" ? [
          ``,
          `## Answer`,
          ``,
          `**Selected**: ${q.selected_option}`,
          q.freeform_answer ? `\n${q.freeform_answer}` : "",
        ].join("\n") : "",
      ].filter(l => l !== null).join("\n");

      return {
        path: `questions/${worktreeId}/${q.id}.md`,
        content,
      };
    });
  }

  /**
   * Push question files to a `questions` branch on a GitHub repo via the Contents API.
   * Force-pushes by creating/updating files on the branch.
   */
  async pushToQuestionsBranch(worktreeId: string, repo: string, ghToken: string): Promise<string[]> {
    const files = this.buildQuestionFiles(worktreeId);
    if (!files.length) return [];

    const headers = {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };

    // Ensure `questions` branch exists
    const branchRes = await fetch(`https://api.github.com/repos/${repo}/branches/questions`, { headers });
    if (!branchRes.ok) {
      // Create branch from default branch
      const defaultRef = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/master`, { headers });
      if (defaultRef.ok) {
        const refData = await defaultRef.json() as any;
        await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
          method: "POST", headers,
          body: JSON.stringify({ ref: "refs/heads/questions", sha: refData.object.sha }),
        });
      }
    }

    const pushed: string[] = [];
    for (const file of files) {
      // Check if file exists (get SHA for update)
      let sha: string | undefined;
      const existingRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${file.path}?ref=questions`,
        { headers },
      );
      if (existingRes.ok) {
        const existing = await existingRes.json() as any;
        sha = existing.sha;
      }

      const commitRes = await fetch(`https://api.github.com/repos/${repo}/contents/${file.path}`, {
        method: "PUT", headers,
        body: JSON.stringify({
          message: `questions: ${worktreeId.slice(0, 8)} — update ${file.path.split("/").pop()}`,
          content: Buffer.from(file.content).toString("base64"),
          branch: "questions",
          ...(sha ? { sha } : {}),
        }),
      });

      if (commitRes.ok) pushed.push(file.path);
    }

    return pushed;
  }

  private writeAll(worktreeId: string, questions: AuditQuestion[]): void {
    const lines = questions.map(q => JSON.stringify(q)).join("\n") + "\n";
    writeFileSync(this.filePath(worktreeId), lines);
  }
}
