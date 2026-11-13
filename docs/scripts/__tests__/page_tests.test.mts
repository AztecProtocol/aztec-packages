import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { blocks, isShell, partlyRun, type Step, TRANSCRIPTS, UNTESTED, uncovered, unread, walk } from "../page_tests.mts";

const docs = path.resolve(import.meta.dirname, "../..");
const lines = ["", ...fs.readdirSync(path.join(docs, "lines")).map((l) => `lines/${l}/`)];
const IN_SCOPE = /^docs-developers\/(docs\/tutorials\/.+|getting_started_on_[^/]+)\.mdx?$/;

// The line-relative keys of one line's in-scope pages, with their text.
function inScope(line: string): { key: string; text: string }[] {
  const dev = path.join(docs, line, "docs-developers");
  return (fs.readdirSync(dev, { recursive: true }) as string[])
    .map((f) => `docs-developers/${f.split(path.sep).join("/")}`)
    .filter((key) => IN_SCOPE.test(key))
    .map((key) => ({ key, text: fs.readFileSync(path.join(docs, line, key), "utf8") }));
}

const shellPages = (line: string) => new Set(inScope(line).flatMap(({ key, text }) => (blocks(text).some(isShell) ? [key] : [])));

test("every tutorial or getting-started page with shell commands is run by a test or listed as untested", () => {
  const hidden = lines.flatMap((line) => inScope(line).flatMap(({ key, text }) => unread(text).map((n) => `${line}${key}:${n}`)));
  assert.deepEqual(hidden, [], "the census reads only plain fenced blocks: write these as one");

  const byLine = lines.map((line) => ({ line, pages: shellPages(line) }));
  const everywhere = new Set(byLine.flatMap(({ pages }) => [...pages]));

  const unaccounted = [...everywhere].filter((k) => !(k in TRANSCRIPTS) && !(k in UNTESTED));
  assert.deepEqual(unaccounted, [], "add a transcript test for these pages, or list them in UNTESTED with the reason");

  const stale = Object.keys(UNTESTED).filter((k) => !everywhere.has(k));
  assert.deepEqual(stale, [], "these UNTESTED pages have no shell block on any line: remove them");

  const unreasoned = Object.entries(UNTESTED).filter(([, why]) => !why.trim()).map(([k]) => k);
  assert.deepEqual(unreasoned, []);

  // A spec runs every shell block it does not skip, so its page is listed only when a skip leaves it partly run.
  const specs = Object.entries(TRANSCRIPTS).flatMap(([k, t]) => ("steps" in t ? [{ k, steps: t.steps }] : []));
  const misfiled = specs.filter(({ k, steps }) => k in UNTESTED !== partlyRun(steps).length > 0).map(({ k }) => k);
  assert.deepEqual(misfiled, [], "list a spec page in UNTESTED exactly when a skip with a reason leaves it partly run");

  // The test commands run every transcript page on every line.
  const missing = byLine.flatMap(({ line, pages }) => Object.keys(TRANSCRIPTS).filter((k) => !pages.has(k)).map((k) => `${line}${k}`));
  assert.deepEqual(missing, [], "these TRANSCRIPTS pages have no shell block on that line");
});

// The dry walk of one spec over a line's raw page, and the lines of each copied file the page does not quote.
function specErrors(line: string, key: string, steps: Step[]): string[] {
  const page = fs.readFileSync(path.join(docs, line, key), "utf8");
  const copies = steps.flatMap((s) => ("copy" in s ? [s.copy] : []));
  return [
    ...walk(blocks(page), steps).errors.map((e) => `${line}${key}:${e}`),
    ...copies.flatMap((copy) => {
      const rel = `docs/${line}examples/${copy}`;
      const rows = uncovered(page, path.join(docs, line, "examples", copy), rel);
      return rows.length ? [`${line}${key}: no region the page includes quotes ${rel} lines ${rows.join(", ")}`] : [];
    }),
  ];
}

// The examples the runner (examples/ts/aztecjs_runner/run.sh) runs by default on one line.
function runnerExamples(line: string): Set<string> {
  const sh = fs.readFileSync(path.join(docs, line, "examples/ts/aztecjs_runner/run.sh"), "utf8");
  return new Set([...(sh.match(/^\s*EXAMPLES=\(([^)]*)\)/m)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

test("a skip the examples runner covers names an example that runner runs, on every line", () => {
  const named = Object.values(TRANSCRIPTS).flatMap((t) => ("steps" in t ? t.steps : [])).flatMap((s) => ("runner" in s ? [s.runner] : []));
  assert.ok(named.length > 0);
  assert.deepEqual(lines.flatMap((line) => named.filter((e) => !runnerExamples(line).has(e)).map((e) => `${line}: ${e}`)), []);
});

test("every transcript spec walks its page on every line, and quotes each file it copies in full", () => {
  const specs = Object.entries(TRANSCRIPTS).flatMap(([key, t]) => ("steps" in t ? [{ key, steps: t.steps }] : []));
  assert.deepEqual(lines.flatMap((line) => specs.flatMap(({ key, steps }) => specErrors(line, key, steps))), []);
});

test("the walk follows page order and accounts for every shell block", () => {
  const page = blocks("```bash\na\n```\n```toml\n[d]\nx = 1\n```\n```bash\nb\n```\n```rust\nfn main() {}\n```\n```bash\nc\n```");
  const ok = walk(page, [{ run: "a" }, { merge: "x", into: "N.toml" }, { run: "b" }, { write: "fn main", to: "m.nr" }, { run: "c" }]);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.bound.map((b) => b.block?.line), [1, 4, 8, 11, 14]);
  assert.deepEqual(walk(page, [{ run: "a" }, { run: "c" }]).errors, ["8: shell block not run"]);
  assert.deepEqual(walk(page, [{ run: "a" }, { run: "b" }]).errors, ["14: shell block not run"]);
  assert.deepEqual(walk(page, [{ run: "b" }, { run: "a" }, { run: "c" }]).errors, ["1: shell block not run", '8: no run block after this line contains "a"']);
  assert.deepEqual(walk(page, [{ run: "a" }, { run: "b" }, { run: "c" }, { copy: "x", to: "../y" }]).errors, ["../y: a target is relative, without .."]);
  const skipping = walk(page, [{ run: "a" }, { skip: "b", why: "w" }, { check: "true", why: "w" }, { run: "c" }]);
  assert.deepEqual(skipping.errors, []);
  assert.deepEqual(skipping.bound.map((b) => b.block?.line), [1, 8, undefined, 14]);
  assert.deepEqual(partlyRun([{ skip: "aztec start", why: "a" }, { skip: "x", runner: "r" }, { skip: "y", why: "b" }]), ["b"]);
});

test("a copied file counts as quoted only where the page includes its regions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "page-tests-"));
  try {
    const file = path.join(dir, "main.nr");
    fs.writeFileSync(file, "// docs:start:a\nfn a() {}\n// docs:end:a\n\nuse b;\n// docs:start:c\nfn c() {\n}\n// docs:end:c\n}\n");
    const page = (...names: string[]) => names.map((n) => `#include_code ${n} /x/main.nr rust`).join("\n");
    assert.deepEqual(uncovered(page("a", "c"), file, "x/main.nr"), [5]);
    assert.deepEqual(uncovered(page("a"), file, "x/main.nr"), [5, 7]);
    assert.deepEqual(uncovered(page("a", "c"), file, "y/main.nr"), [2, 5, 7]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a command block the census cannot read is found, and every shell info string counts", () => {
  const page = "> ```bash\n> false\n> ```\n#include_code run /x/run.sh bash\n#include_code main /x/main.rs rust\n<CodeBlock language=\"bash\">false</CodeBlock>\n```bash\ntrue\n```";
  assert.deepEqual(unread(page), [1, 3, 4, 6]);
  assert.deepEqual(unread("- #include_code run /x/run.sh bash\n#include_code run /x/run.sh\nsh\n<!-- #include_code run /x/run.sh bash -->"), [1, 2]);
  assert.deepEqual(
    blocks("```powershell\na\n```\n```terminal\nb\n```\n```text\nc\n```").map(isShell),
    [true, true, false],
  );
});
