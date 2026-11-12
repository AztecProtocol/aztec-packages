import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const docs = path.resolve(import.meta.dirname, "../..");
const SNAPSHOTS = ["developer_versioned_docs", "network_versioned_docs"];

// Leftovers a snapshot may keep: an exact match in pages named `page`, with the reason. An entry nothing matches fails.
const ALLOWED: { page: string; match: string; reason: string }[] = [
  { page: "ai_tooling.md", match: "@aztec/mcp-server@latest", reason: "the Aztec MCP server is published on its own schedule, not with a release" },
  { page: "ai_tooling.md", match: "noir-mcp-server@latest", reason: "a third-party package versioned on its own" },
];

// Snapshots are copied from preprocessed pages and are served as written, so nothing here is expanded later.
const RULES: { name: string; pattern: RegExp; body?: true }[] = [
  {
    name: "unexpanded macro",
    pattern: /#(?:include_code|include_\w*version\w*|release_(?:version|network|name|label)|docs_commit|api_ref_version|else|endif)\b|#(?:if|elif)\(/g,
  },
  { name: "unreleased section", pattern: /^## (?:TBD|Unreleased)\b.*/g },
  { name: "moving version", pattern: /[\w@/.-]*@(?:next|latest)(?![\w-])|VERSION=latest\b|tag *= *"next"|aztec\.network\/latest\b/g },
  // A reader's aztec-node checkout has no labs/ prefix. Front matter is never rendered, so `references:` may keep it.
  { name: "labs/ path", pattern: /(?<![\w@-])labs\/\S*/g, body: true },
];

/**
 * Every leftover in the snapshot page `file` (relative to docs/) with content `text`, as
 * `<file>:<line>: <rule>: <match>`. Allowed matches are left out and recorded in `seen`.
 */
function hygieneProblems(file: string, text: string, seen = new Set<(typeof ALLOWED)[number]>()): string[] {
  const lines = text.split("\n");
  const frontMatterEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const problems: string[] = [];
  lines.forEach((row, i) => {
    for (const { name, pattern, body } of RULES) {
      if (body && i <= frontMatterEnd) continue;
      for (const [match] of row.matchAll(pattern)) {
        const allowed = ALLOWED.find((a) => a.match === match && path.basename(file) === a.page);
        if (allowed) seen.add(allowed);
        else problems.push(`${file}:${i + 1}: ${name}: ${match}`);
      }
    }
  });
  // Step 8 of a release leaves unshipped notes above the release's own section.
  const version = file.match(/\/version-v([^/]+)\/(?:.+\/)?migration_notes\.md$/)?.[1];
  if (version) {
    const at = lines.findIndex((row) => row.startsWith("## "));
    if (lines[at] !== `## ${version}`) problems.push(`${file}:${at + 1}: first section is not ## ${version}: ${lines[at] ?? "none"}`);
  }
  return problems;
}

const rules = (file: string, text: string) => hygieneProblems(file, text).map((p) => p.replace(/^[^:]+:(\d+): ([^:]+): .*$/, "$1 $2"));

test("hygieneProblems flags each leftover by line and rule", () => {
  const page = [
    "---",
    'references: ["labs/yarn-project/aztec.js/src/index.ts"]',
    "---",
    "#include_code deploy /docs/examples/ts/index.ts typescript",
    "yarn add @aztec-labs/aztec.js@#include_aztec_version",
    "#if(testnet)",
    "#endif",
    "## TBD",
    "npm i @aztec-labs/aztec@next and VERSION=latest",
    'aztec = { git = "https://github.com/aztec-labs-eng/aztec-node", tag = "next" }',
    "see labs/yarn-project/foo.ts and ../labs/noir-projects",
    "npx @aztec/mcp-server@latest, https://github.com/aztec-labs-eng/aztec-node, @aztec-labs/accounts",
    "npx @aztec/mcp-server@latest-x, foo@nextgen, see `pkg@next`.",
    "text #if(mainnet)",
  ].join("\n");
  assert.deepEqual(rules("developer_versioned_docs/version-v1.0.0/page.md", page), [
    "4 unexpanded macro",
    "5 unexpanded macro",
    "6 unexpanded macro",
    "7 unexpanded macro",
    "8 unreleased section",
    "9 moving version",
    "9 moving version",
    "10 moving version",
    "11 labs/ path",
    "11 labs/ path",
    "12 moving version",
    "13 moving version",
    "14 unexpanded macro",
  ]);
  assert.deepEqual(rules("developer_versioned_docs/version-v1.0.0/ai_tooling.md", "npx @aztec/mcp-server@latest"), []);
});

test("a snapshot's migration notes start with its own version", () => {
  const file = "developer_versioned_docs/version-v1.0.0/docs/resources/migration_notes.md";
  assert.deepEqual(hygieneProblems(file, "intro\n## 1.0.0\n## 0.9.0"), []);
  assert.deepEqual(hygieneProblems(file, "intro\n## 1.1.0\n## 1.0.0"), [`${file}:2: first section is not ## 1.0.0: ## 1.1.0`]);
});

test("every macro the preprocessor expands is flagged", () => {
  const dir = path.join(docs, "src/preprocess");
  const source = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const macros = new Set(source.flatMap((s) => [...s.matchAll(/#[a-z][a-z_]*/g)].map(([m]) => m)));
  assert.ok(["#include_code", "#release_version", "#if", "#elif", "#else", "#endif"].every((m) => macros.has(m)), [...macros].join(" "));
  assert.deepEqual([...macros].filter((m) => !hygieneProblems("page.md", `${m}(x)`).length), []);
});

test("released snapshots carry no macro, unreleased section, moving version or labs/ path", () => {
  const seen = new Set<(typeof ALLOWED)[number]>();
  const problems = SNAPSHOTS.flatMap((root) =>
    fs
      .readdirSync(path.join(docs, root), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.mdx?$/.test(f))
      .sort()
      .flatMap((f) => hygieneProblems(`${root}/${f}`, fs.readFileSync(path.join(docs, root, f), "utf8"), seen)),
  );
  assert.deepEqual(problems, [], `${problems.join("\n")}\nFix each in the snapshot, or allow it in ALLOWED with the reason.`);
  assert.deepEqual(ALLOWED.filter((a) => !seen.has(a)), [], "ALLOWED entries no snapshot matches: remove them");
});
