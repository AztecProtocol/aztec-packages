import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import line from "../../src/preprocess/line.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

// aztec-node deleted its docs/ in its #619; the examples live only in this repository.
const AZTEC_NODE_DOCS = /https:\/\/github\.com\/aztec-labs-eng\/aztec-node\/(?:tree|blob)\/[^/\s)"'`>]+\/docs(?=[/\s)"'`>]|$)/g;
const EXAMPLES = /https:\/\/github\.com\/AztecProtocol\/aztec-packages\/(?:tree|blob)\/([^/\s)"'`>]+)\/(docs\/(?:lines\/v\d+\/)?examples(?:\/[^\s)"'`>#]*)?)/g;

/**
 * Every hand-written link in `text` (the page at `page`, relative to `rootDir`) that cannot follow the page's
 * line: one into aztec-node's docs/, or one into this repository's examples that is not at #docs_commit, names
 * another line's copy, or names a path the working tree lacks. Returns `<page>:<line>: <url>: <reason>` per link.
 */
function exampleLinkProblems(rootDir: string, page: string, text: string): string[] {
  const owner = line.lineOf(page, rootDir)?.name ?? "main";
  const problems: string[] = [];
  text.split("\n").forEach((row, i) => {
    const at = `${page}:${i + 1}`;
    for (const [url] of row.matchAll(AZTEC_NODE_DOCS)) problems.push(`${at}: ${url}: aztec-node has no docs/, link this repository's copy`);
    for (const [url, ref, target] of row.matchAll(EXAMPLES)) {
      const examples = target.replace(/\/+$/, "");
      if (ref !== "#docs_commit") problems.push(`${at}: ${url}: name the commit with #docs_commit`);
      else if ((line.lineOf(examples, rootDir)?.name ?? "main") !== owner) problems.push(`${at}: ${url}: link the ${owner} line's own copy`);
      else if (!fs.existsSync(path.join(rootDir, examples))) problems.push(`${at}: ${url}: no such path`);
    }
  });
  return problems;
}

test("exampleLinkProblems flags aztec-node docs, other refs, other lines and missing paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "example-links-"));
  try {
    fs.mkdirSync(path.join(root, "docs/examples/app"), { recursive: true });
    fs.mkdirSync(path.join(root, "docs/lines/v6/examples/app"), { recursive: true });
    const pkgs = "https://github.com/AztecProtocol/aztec-packages";
    const links = [
      "https://github.com/aztec-labs-eng/aztec-node/tree/#include_aztec_version/docs/examples",
      `${pkgs}/tree/next/docs/lines/v6/examples/app`,
      `${pkgs}/tree/#docs_commit/docs/examples/app`,
      `${pkgs}/tree/#docs_commit/docs/examples`,
      `${pkgs}/blob/#docs_commit/docs/lines/v6/examples/gone.ts`,
      `${pkgs}/tree/#docs_commit/docs/lines/v6/examples/app/`,
      `${pkgs}/tree/#docs_commit/docs/lines/v6/examples`,
      "https://github.com/aztec-labs-eng/aztec-node/blob/#include_aztec_version/noir-projects/aztec-nr",
    ];
    const page = "docs/lines/v6/docs-developers/page.md";
    const reasons = exampleLinkProblems(root, page, links.map((l) => `[x](${l})`).join("\n")).map((p) => p.replace(/^.*?:(\d+): .*: /, "$1 "));
    assert.deepEqual(reasons, [
      "1 aztec-node has no docs/, link this repository's copy",
      "2 name the commit with #docs_commit",
      "3 link the v6 line's own copy",
      "4 link the v6 line's own copy",
      "5 no such path",
    ]);
    assert.deepEqual(exampleLinkProblems(root, "docs/docs-developers/page.md", `[x](${pkgs}/blob/#docs_commit/docs/examples/app)`), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dev pages link the examples of their own line at #docs_commit", () => {
  const roots = [
    "docs/docs",
    "docs/docs-developers",
    "docs/docs-operate",
    "docs/docs-participate",
    ...line.lineNames(repoRoot).flatMap((l) => [`docs/lines/${l}/docs-developers`, `docs/lines/${l}/docs-operate`]),
  ];
  const pages = roots.flatMap((root) => {
    const found = execFileSync("git", ["-C", repoRoot, "ls-files", "--", root], { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.mdx?$/.test(f));
    assert.ok(found.length > 0, `no pages under ${root}`);
    return found;
  });
  const problems = pages.flatMap((page) => exampleLinkProblems(repoRoot, page, fs.readFileSync(path.join(repoRoot, page), "utf8")));
  assert.deepEqual(problems, []);
});
