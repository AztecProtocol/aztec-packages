import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import fences from "../../src/markdown_fences.js";

const docsDir = path.resolve(import.meta.dirname, "../..");
const repoRoot = path.dirname(docsDir);
const GUIDES = ["CLAUDE.md", "README.md", "HOW_WE_WRITE_DOCS.md", "CONTRIBUTING.md"];
const CHECKOUT = "docs/.aztec-node/tree";

// Roots the guides name on purpose whose contents a build, an install or scripts/aztec_node.mts writes, so a path
// under them is not checked. An entry no guide names fails.
const OUTPUTS: Record<string, string> = {
  "docs/processed-docs": "preprocessing output",
  "docs/build": "site build output",
};
// Path-like tokens that name no file of this repository, with the reason. An entry no guide uses fails.
const NOT_PATHS: Record<string, string> = {
  "repos/aztec-labs-eng/aztec-node/compare/<branch>...<commit>": "a GitHub API route",
};

const SHELL_FENCE = /^(?:bash|sh|shell|console)\b/;
// A bare extension (`.md`) names no file.
const EXTENSION = /[^/]\.(?:md|mdx|mts|ts|tsx|js|mjs|cjs|json|toml|ya?ml|sh|py|txt|html|css|lock|nr|sol)$/;
// Yarn's own commands the guides run; any other `yarn <word>` must be a script of docs/package.json.
const YARN_COMMANDS = new Set(["install", "add", "docusaurus", "node", "playwright"]);
// URLs, npm scopes, absolute and home paths, variables, refs and markers with a colon, and remote branches.
const NOT_REPO = /^(?:[a-z][a-z0-9+.-]*:\/\/|[@/~]|origin\/)|[$:]/i;

type Mention = { line: number; token: string } & ({ yarn: string } | { checkout: boolean; patterns: string[] });

/**
 * The paths and `yarn` commands the guide at `guide` (relative to the repository root) names in inline code, shell
 * fences and relative links. A path's patterns are the repository-relative paths it may mean, or with `checkout`
 * the paths it means in the pinned aztec-node checkout; `<placeholder>` and `*` match within one path segment.
 */
function mentions(guide: string, text: string): Mention[] {
  const lines = text.split("\n");
  const fenced = fences.fencedLines(lines);
  const found: Mention[] = [];
  const addPath = (line: number, token: string, from: string[]) => {
    const rel = token.replace(/#.*$/, "").replace(/\/?\.\.\.$/, "").replace(/\/+$/, "");
    if (!rel) return;
    const checkout = rel.match(/^(?:labs|(?:\.\/)?\.aztec-node\/tree)\/(.+)$/);
    if (checkout) found.push({ line, token, checkout: true, patterns: [checkout[1]] });
    else found.push({ line, token, checkout: false, patterns: from.map((base) => path.posix.join(base, rel)) });
  };
  const scan = (line: number, code: string) => {
    const tokens = code.split(/[\s"'`()=,;|&[\]]+/).filter(Boolean);
    tokens.forEach((raw, i) => {
      if (raw === "yarn" && /^[a-z][\w:-]*$/.test(tokens[i + 1] ?? "")) found.push({ line, token: `yarn ${tokens[i + 1]}`, yarn: tokens[i + 1] });
      const token = raw.replace(/[.,:;]+$/, "");
      if (Object.hasOwn(NOT_PATHS, token) || NOT_REPO.test(token) || !(token.includes("/") || EXTENSION.test(token.replace(/#.*$/, "")))) return;
      addPath(line, token, token.startsWith("./") ? ["docs"] : ["docs", "."]);
    });
  };
  lines.forEach((row, i) => {
    if (fenced[i]) return;
    for (const [, code] of row.matchAll(/`([^`]+)`/g)) scan(i + 1, code);
    for (const [, target] of row.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (!NOT_REPO.test(target) && !target.startsWith("#")) addPath(i + 1, target, [path.posix.dirname(guide)]);
    }
  });
  for (const block of fences.fenceBlocks(lines)) {
    if (!SHELL_FENCE.test(block.info)) continue;
    block.body.forEach((code: string, j: number) => {
      scan(block.line + 1 + j, code);
    });
  }
  return found;
}

const segmentRegex = (segment: string) =>
  new RegExp(`^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/<[^>]*>/g, "[^/]+").replace(/\*/g, "[^/]*")}$`);

/** Whether some path under `root` matches `pattern`, a relative path whose segments may hold `<…>` or `*`. */
function resolves(root: string, pattern: string): boolean {
  const walk = (dir: string, segments: string[]): boolean => {
    if (segments.length === 0) return true;
    const [segment, ...rest] = segments;
    if (!/[<*]/.test(segment)) return fs.existsSync(path.join(dir, segment)) && walk(path.join(dir, segment), rest);
    const match = segmentRegex(segment);
    const entries = fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? fs.readdirSync(dir) : [];
    return entries.some((entry) => match.test(entry) && walk(path.join(dir, entry), rest));
  };
  return walk(root, pattern.split("/"));
}

const outputOf = (pattern: string, outputs: Record<string, string>) =>
  Object.keys(outputs).find((root) => pattern === root || pattern.startsWith(`${root}/`));

/** `<guide>:<line>: <token>: <reason>` for each mention under `root` that names nothing; `used` collects the outputs hit. */
function problems(root: string, guide: string, found: Mention[], scripts: Set<string>, outputs: Record<string, string>, used: Set<string>): string[] {
  return found.flatMap((m) => {
    const at = `${guide}:${m.line}: ${m.token}`;
    if ("yarn" in m) return scripts.has(m.yarn) || YARN_COMMANDS.has(m.yarn) ? [] : [`${at}: not a script in docs/package.json`];
    if (m.checkout) return m.patterns.some((p) => resolves(path.join(root, CHECKOUT), p)) ? [] : [`${at}: not in the pinned aztec-node checkout`];
    const inside = m.patterns.map((p) => path.posix.normalize(p)).filter((p) => p !== ".." && !p.startsWith("../"));
    const output = inside.map((p) => outputOf(p, outputs)).find(Boolean);
    if (output) {
      used.add(output);
      return [];
    }
    if (inside.some((p) => resolves(root, p))) return [];
    return [`${at}: no such path from docs/ or the repository root; write the whole path, or list it in NOT_PATHS or OUTPUTS with the reason`];
  });
}

test("guide paths: stale paths and yarn scripts fail; outputs, placeholders, globs and other tokens pass", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "contributor-guides-"));
  try {
    for (const file of ["docs/docs-developers/a.md", "docs/lines/v6/allowed-differences.txt", "docs/sidebars-operate.js", "docs/scripts/aztec_node.mts", "docs/CONTRIBUTING.md", `${CHECKOUT}/yarn-project/stdlib/a.ts`]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "");
    }
    const text = [
      "Pages: `docs-network/`, `docs-developers/`, `versioned_docs/`; versions in `./versions.json`; `docs/migration_notes.md`.",
      "Run `yarn dev`, `yarn build`, `yarn install` and `yarn docusaurus docs:version:developer v1`.",
      "Not ours: `https://docs.aztec.network/x`, `@aztec-labs/aztec.js`, `origin/next`, `$AZTEC_NODE_DIR/x`, `docs:start:hello`, `.md`.",
      "Checkout: `labs/yarn-project/stdlib/a.ts`, `labs/yarn-project/gone.ts`, `.aztec-node/tree/yarn-project/stdlib/`.",
      "Outputs: `processed-docs/x.md`. Patterns: `lines/<line>/allowed-differences.txt`, `lines/<line>/gone.json`, `sidebars-*.js`, `sidebars-*.ts`.",
      "Links: [rules](./CONTRIBUTING.md), [gone](./GONE.md#usage). Fragment: `scripts/gone.mts#usage`. Ellipsis: `docs-developers/...`.",
      "```bash",
      "node scripts/aztec_node.mts fetch && node scripts/gone.mts",
      "```",
      "```yaml",
      "references: [scripts/also_gone.sh]",
      "```",
    ].join("\n");
    const used = new Set<string>();
    const found = problems(root, "docs/README.md", mentions("docs/README.md", text), new Set(["build"]), { "docs/processed-docs": "x" }, used);
    assert.deepEqual(
      found.map((p) => p.split(": ").slice(0, 2).join(": ")),
      [
        "docs/README.md:1: docs-network/",
        "docs/README.md:1: versioned_docs/",
        "docs/README.md:1: ./versions.json",
        "docs/README.md:1: docs/migration_notes.md",
        "docs/README.md:2: yarn dev",
        "docs/README.md:4: labs/yarn-project/gone.ts",
        "docs/README.md:5: lines/<line>/gone.json",
        "docs/README.md:5: sidebars-*.ts",
        "docs/README.md:6: scripts/gone.mts#usage",
        "docs/README.md:6: ./GONE.md#usage",
        "docs/README.md:8: scripts/gone.mts",
      ],
    );
    assert.deepEqual([...used], ["docs/processed-docs"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const guides = GUIDES.map((name) => {
  const text = fs.readFileSync(path.join(docsDir, name), "utf8");
  return { guide: `docs/${name}`, text, found: mentions(`docs/${name}`, text) };
});
const scripts = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(docsDir, "package.json"), "utf8")).scripts));

test("every repo path and yarn script the contributor guides name exists", () => {
  const used = new Set<string>();
  const repoOnly = guides.flatMap(({ guide, found }) => problems(repoRoot, guide, found.filter((m) => !("checkout" in m && m.checkout)), scripts, OUTPUTS, used));
  assert.deepEqual(repoOnly, []);
  assert.deepEqual(Object.keys(OUTPUTS).filter((root) => !used.has(root)), [], "OUTPUTS entries no guide names");
  const unusedNotPaths = Object.keys(NOT_PATHS).filter((token) => !guides.some(({ text }) => text.includes(token)));
  assert.deepEqual(unusedNotPaths, [], "NOT_PATHS entries no guide uses");
});

const noCheckout = !fs.existsSync(path.join(repoRoot, CHECKOUT));
test("every aztec-node path the contributor guides name is in the pinned checkout", { skip: noCheckout && "no checkout: run node scripts/aztec_node.mts fetch" }, () => {
  const inCheckout = guides.flatMap(({ guide, found }) => problems(repoRoot, guide, found.filter((m) => "checkout" in m && m.checkout), scripts, OUTPUTS, new Set()));
  assert.deepEqual(inCheckout, []);
});
