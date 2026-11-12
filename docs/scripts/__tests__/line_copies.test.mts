import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import line from "../../src/preprocess/line.js";
import { allowListFile, compare, LineCopyError, toLine, write } from "../line_copies.mts";

const docsDir = path.resolve(import.meta.dirname, "../..");

test("every line's copies equal main's after the path rewrite, except the allowed differences", () => {
  for (const name of line.lineNames(path.dirname(docsDir))) {
    assert.deepEqual(
      compare(docsDir, name),
      [],
      `run \`node scripts/line_copies.mts\` from docs/: \`write <path>\` copies main's file to ${name}; a deliberate difference goes into ${path.relative(docsDir, allowListFile(docsDir, name))} with its reason`,
    );
  }
});

// A repository with main's tree and a v6 line, both pinned to one commit.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "line-copies-"));
  const docs = path.join(root, "docs");
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(docs, rel)), { recursive: true });
    fs.writeFileSync(path.join(docs, rel), text);
  };
  const pin = (commit: string) => JSON.stringify({ commit });
  put("aztec-node.json", pin("a".repeat(40)));
  put("lines/v6/aztec-node.json", pin("a".repeat(40)));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  git("init", "-q");
  const both = (rel: string, text: string) => {
    put(rel, text);
    put(`lines/v6/${rel}`, rel.startsWith("docs-") ? toLine(text, "v6") : text);
  };
  const read = (rel: string) => fs.readFileSync(path.join(docs, rel), "utf8");
  const commit = () => git("add", "-A") && git("commit", "-qm", "fixture");
  return { root, docs, put, both, read, pin, commit };
}

const kinds = (docs: string) => compare(docs, "v6").map((f) => `${f.path}: ${f.kind}`);
const allow = (docs: string, ...rows: string[]) => fs.writeFileSync(allowListFile(docs, "v6"), `# why\n${rows.join("\n")}\n`);

test("compare reports one-copy edits, one-sided files and stale allowances", () => {
  assert.equal(
    toLine("my-docs/examples docs/examples) /docs/examples/a docs/examples-x docs/examples.md", "v6"),
    "my-docs/examples docs/lines/v6/examples) /docs/lines/v6/examples/a docs/examples-x docs/examples.md",
  );
  const { root, docs, put, both, commit } = fixture();
  try {
    both("docs-developers/same name.md", "quote docs/examples/a.ts and docs/node_modules/@aztec-foundation/l1-artifacts/x.sol\n");
    both("docs-developers/edited.md", "one\ntwo\n");
    put("docs-developers/edited.md", "one\ntwo, edited in main only\n");
    put("lines/v6/docs-operate/quotes-main.md", "see [docs/examples](https://github.com/o/r/tree/c/docs/examples)\n");
    put("docs-operate/quotes-main.md", "see [docs/examples](https://github.com/o/r/tree/c/docs/examples)\n");
    both("examples/lib.sh", "# docs/examples stays byte-exact outside the pages\n");
    put("examples/main-only.sh", "x\n");
    put("examples/allowed-main-only.sh", "x\n");
    put("lines/v6/docs-operate/line-only.md", "x\n");
    both("docs-operate/deleted.md", "x\n");
    both("docs-developers/clone.md", "clone docs/Nargo.toml\n");
    put("lines/v6/docs-developers/clone.md", "clone docs/lines/v6/Nargo.toml\n");
    both("docs-developers/synced.md", "x\n");
    allow(docs, "docs-developers/clone.md: the line clones its own workspace", "examples/allowed-main-only.sh: main's tooling",
      "docs-developers/synced.md: was different", "docs-developers/gone.md: was different");
    commit();
    fs.rmSync(path.join(docs, "docs-operate/deleted.md"));
    assert.deepEqual(kinds(docs), [
      "docs-developers/edited.md: differs",
      "docs-developers/gone.md: stale",
      "docs-developers/synced.md: stale",
      "docs-operate/deleted.md: v6 only",
      "docs-operate/line-only.md: v6 only",
      "docs-operate/quotes-main.md: differs",
      "examples/main-only.sh: main only",
    ]);
    allow(docs, "docs-developers/clone.md the reason has no colon");
    assert.throws(() => compare(docs, "v6"), LineCopyError);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("write copies main's files to the line except allowed ones, never over unsaved work", () => {
  const { root, docs, put, both, read, pin, commit } = fixture();
  try {
    both("docs-developers/edited.md", "old docs/examples/a.ts\n");
    put("docs-developers/edited.md", "new docs/examples/a.ts\n");
    put("examples/new.ts", "x\n");
    put("lines/v6/examples/gone.ts", "x\n");
    put("examples/link.ts", "x\n");
    fs.writeFileSync(path.join(root, "outside.txt"), "kept\n");
    fs.symlinkSync("../../../../outside.txt", path.join(docs, "lines/v6/examples/link.ts"));
    both("docs-developers/clone.md", "clone\n");
    put("lines/v6/docs-developers/clone.md", "clone the line's own\n");
    allow(docs, "docs-developers/clone.md: the line clones its own workspace");
    commit();
    assert.throws(() => write(docs, "v6", ["../aztec-node.json"]), LineCopyError);

    put("lines/v6/docs-operate/draft.md", "unsaved\n");
    assert.throws(() => write(docs, "v6"), /draft\.md: uncommitted[\s\S]*link\.ts: not a regular file/);
    assert.equal(read("lines/v6/examples/gone.ts"), "x\n", "a refused write changes nothing");
    assert.equal(fs.readFileSync(path.join(root, "outside.txt"), "utf8"), "kept\n");
    fs.rmSync(path.join(docs, "lines/v6/docs-operate/draft.md"));
    fs.rmSync(path.join(docs, "lines/v6/examples/link.ts"));

    put("lines/v6/aztec-node.json", pin("b".repeat(40)));
    assert.throws(() => write(docs, "v6"), LineCopyError, "the pins differ: write takes named paths only");
    write(docs, "v6", ["docs-developers/edited.md"]);
    assert.equal(read("lines/v6/docs-developers/edited.md"), "new docs/lines/v6/examples/a.ts\n");
    put("lines/v6/aztec-node.json", pin("a".repeat(40)));
    write(docs, "v6");
    assert.deepEqual(compare(docs, "v6"), []);
    assert.equal(read("lines/v6/examples/new.ts"), "x\n");
    assert.ok(!fs.existsSync(path.join(docs, "lines/v6/examples/gone.ts")));
    assert.equal(read("lines/v6/docs-developers/clone.md"), "clone the line's own\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
