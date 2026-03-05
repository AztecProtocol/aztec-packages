/**
 * Stat schemas — field definitions for structured data collection.
 *
 * Each schema is a list of fields with descriptions. The MCP tool prompt
 * includes the full field list so Claude knows what to record.
 * No runtime validation — append-only JSONL, bad entries are cheap.
 *
 * Data is written to ~/.claudebox/stats/<schema>.jsonl
 */

export interface StatField {
  name: string;
  type: string;       // "number", "string", "boolean", "string[]", "string?" etc.
  description: string;
}

export interface StatSchema {
  name: string;
  description: string;
  fields: StatField[];
}

const schemas = new Map<string, StatSchema>();

function register(s: StatSchema): void { schemas.set(s.name, s); }
export function getSchema(name: string): StatSchema | undefined { return schemas.get(name); }
export function allSchemas(): StatSchema[] { return [...schemas.values()]; }

/** Format all schemas as a prompt string for the MCP tool description. */
export function schemasPrompt(): string {
  return allSchemas().map(s => {
    const fields = s.fields.map(f => `  - ${f.name} (${f.type}): ${f.description}`).join("\n");
    return `### ${s.name}\n${s.description}\n\n${fields}`;
  }).join("\n\n");
}

// ── pr_analysis ──────────────────────────────────────────────────
// Sentiment analysis of a PR's commits and CI runs.
// One entry per commit. The `pr` field stays the same across all
// entries for a given PR.

register({
  name: "pr_analysis",
  description: "Sentiment analysis of a PR commit and its CI runs. Record one entry per commit.",
  fields: [
    { name: "pr", type: "number", description: "PR number — same across all entries for this PR" },
    { name: "pr_title", type: "string", description: "PR title" },
    { name: "pr_author", type: "string", description: "GitHub username of the PR author" },
    { name: "commit_sha", type: "string", description: "The specific commit SHA" },
    { name: "commit_message", type: "string", description: "First line of the commit message" },
    { name: "commit_ordinal", type: "number", description: "1-indexed position of this commit in the PR (1 = first push)" },
    { name: "category", type: "string", description: "Change type: feature | bugfix | refactor | chore | flake_fix | merge_conflict_fix | ci_fix | revert | docs | test | deps" },
    { name: "ci_runs", type: "number", description: "Total CI workflow runs triggered by this commit (including reruns)" },
    { name: "ci_time_minutes", type: "number", description: "Total CI wall-clock time in minutes across all runs" },
    { name: "ci_outcome", type: "string", description: "Dominant outcome: pass | fail_code | fail_flake | fail_infra | fail_merge_conflict | fail_cascade | mixed" },
    { name: "change_size", type: "string", description: "trivial (<5 lines, whitespace) | small (<50 lines) | medium (50-300) | large (300+)" },
    { name: "waste_category", type: "string", description: "Primary waste type: none | guess_rerun | ci_disproportionate | flake_retry | merge_queue_cascade | infra_failure | automatable_chore | review_iteration" },
    { name: "developer_time_estimate_minutes", type: "number", description: "Estimated developer minutes wasted waiting for or dealing with CI. 0 if clean pass." },
    { name: "ci_cost_estimate_usd", type: "number?", description: "Estimated CI compute cost in USD, if calculable" },
    { name: "automatable", type: "boolean", description: "Could this commit + its CI overhead be fully automated away?" },
    { name: "assessment", type: "string", description: "1-3 sentence analysis. Flag patterns: repeated reruns, flake-heavy suites, disproportionate CI time, automatable work." },
    { name: "tags", type: "string[]?", description: "Freeform tags: e.g. p2p, flaky-e2e, yarn-project, barretenberg" },
    { name: "confidence", type: "number", description: "0-1 confidence in the categorization" },
  ],
});

// ── audit_assessment ──────────────────────────────────────────────
// Self-assessment from an audit session. One entry per session.

register({
  name: "audit_assessment",
  description: "Self-assessment from an audit session. One entry per session.",
  fields: [
    { name: "rating", type: "string", description: "Session quality: critical | thorough | surface | incomplete" },
    { name: "modules_reviewed", type: "string[]", description: "Source paths reviewed, e.g. ['barretenberg/cpp/src/barretenberg/ecc']" },
    { name: "findings_count", type: "number", description: "Number of issues filed this session" },
    { name: "questions_count", type: "number", description: "Number of questions posted this session" },
    { name: "confidence", type: "number", description: "0-1 confidence in the review thoroughness" },
    { name: "summary", type: "string", description: "2-3 sentence summary of what was covered and key findings" },
    { name: "code_rating", type: "string?", description: "Code quality depth: thorough | surface | none" },
    { name: "crypto_rating", type: "string?", description: "Crypto quality depth: thorough | surface | none" },
    { name: "test_rating", type: "string?", description: "Test quality depth: thorough | surface | none" },
  ],
});

// ── audit_file_review ─────────────────────────────────────────────
// Record each file reviewed during an audit for module coverage tracking.

register({
  name: "audit_file_review",
  description: "Record each file reviewed during an audit. Enables module coverage tracking.",
  fields: [
    { name: "file_path", type: "string", description: "Source file path relative to repo root" },
    { name: "module", type: "string", description: "Barretenberg module: ecc | crypto | polynomials | commitment_schemes | honk | ultra_honk | goblin | stdlib | vm2 | eccvm | common | etc." },
    { name: "review_depth", type: "string", description: "cursory | line-by-line | deep" },
    { name: "quality_dimension", type: "string", description: "Quality axis: code (implementation correctness, UB, memory safety) | crypto (mathematical/cryptographic correctness, side-channels) | test (test coverage, edge cases, assertions)" },
    { name: "issues_found", type: "number", description: "Number of issues found in this file" },
    { name: "notes", type: "string?", description: "Brief notes on what was reviewed" },
  ],
});

// ── audit_artifact ──────────────────────────────────────────────
// Correlate GitHub artifacts (issues, PRs, gists) to sessions and quality dimensions.

register({
  name: "audit_artifact",
  description: "Record a GitHub artifact (issue, PR, or gist) created during an audit session. Auto-recorded by create_issue/create_pr/create_gist.",
  fields: [
    { name: "artifact_type", type: "string", description: "issue | pr | gist" },
    { name: "artifact_url", type: "string", description: "Full GitHub URL" },
    { name: "artifact_id", type: "string", description: "Issue/PR number or gist ID" },
    { name: "quality_dimension", type: "string", description: "code | crypto | test" },
    { name: "severity", type: "string", description: "critical | high | medium | low | info (use info for PRs/gists)" },
    { name: "modules", type: "string[]", description: "Affected barretenberg modules" },
    { name: "title", type: "string", description: "Artifact title or description" },
  ],
});

// ── audit_summary ────────────────────────────────────────────────
// Session summary gist — detailed findings, coverage, and progress.

register({
  name: "audit_summary",
  description: "Record a session summary gist URL. Create a gist with full findings/coverage details, then record the URL here.",
  fields: [
    { name: "gist_url", type: "string", description: "URL of the summary gist" },
    { name: "modules_covered", type: "string[]", description: "Modules reviewed this session" },
    { name: "files_reviewed", type: "number", description: "Number of files reviewed" },
    { name: "issues_filed", type: "number", description: "Number of issues created" },
    { name: "summary", type: "string", description: "1-2 sentence summary" },
  ],
});
