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

// HALF_1 and HALF_2 of the examples runner (examples/ts/aztecjs_runner/run.sh) on one line.
function runnerHalves(line: string): string[][] {
  const sh = fs.readFileSync(path.join(docs, line, "examples/ts/aztecjs_runner/run.sh"), "utf8");
  return ["HALF_1", "HALF_2"].map((half) =>
    [...(sh.match(new RegExp(`^${half}=\\(([^)]*)\\)`, "m"))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  );
}

// The examples the runner runs by default on one line: both halves.
const runnerExamples = (line: string) => new Set(runnerHalves(line).flat());

// The entry the examples runner runs for an example (examples/ts/lib.sh project_entry).
const entry = (line: string, example: string) =>
  fs.existsSync(path.join(docs, line, "examples/ts", example, "hardhat.config.ts")) ? "scripts/index.ts" : "index.ts";

// An example is a folder examples/ts/bootstrap.sh validates: a config.yaml and the entry the runner runs.
// aztecjs_runner is the runner itself.
test("every TypeScript example runs in exactly one half of the examples run, on every line", () => {
  const wrong = lines.flatMap((line) => {
    const root = path.join(docs, line, "examples/ts");
    const examples = fs
      .readdirSync(root, { withFileTypes: true })
      .map((d) => d.name)
      .filter((name) => name !== "aztecjs_runner" && fs.existsSync(path.join(root, name, "config.yaml")))
      .filter((name) => fs.existsSync(path.join(root, name, entry(line, name))));
    const halves = runnerHalves(line);
    const listed = halves.flat();
    return [
      ...halves.flatMap((h, i) => (h.length ? [] : [`${line}HALF_${i + 1} is empty`])),
      ...examples.flatMap((name) => {
        const n = listed.filter((l) => l === name).length;
        return n === 1 ? [] : [`${line}${name}: ${n ? `listed ${n} times` : "in no half"}`];
      }),
      ...[...new Set(listed)].filter((name) => !examples.includes(name)).map((name) => `${line}${name}: no such example`),
    ];
  });
  assert.deepEqual(wrong, [], "list each example in exactly one of run.sh's HALF_1 and HALF_2");
});

test("a skip the examples runner covers is that runner's own run of the example the page builds, on every line", () => {
  const skips = Object.values(TRANSCRIPTS)
    .flatMap((t) => ("steps" in t ? [t.steps] : []))
    .flatMap((steps) => steps.flatMap((s) => ("runner" in s ? [{ skip: s.skip, runner: s.runner, steps }] : [])));
  assert.ok(skips.length > 0);
  const wrong = lines.flatMap((line) =>
    skips.flatMap(({ skip, runner, steps }) => {
      const e = entry(line, runner);
      const copied = steps.some((c) => "copy" in c && c.copy === `ts/${runner}/${e}` && c.to === e);
      return runnerExamples(line).has(runner) && skip === `npx tsx ${e}` && copied ? [] : [`${line}${runner}: ${skip}`];
    }),
  );
  assert.deepEqual(wrong, [], "a runner skip is `npx tsx <entry>` of an example run.sh runs, and the spec copies that entry from it");
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
  assert.deepEqual(partlyRun([{ skip: "aztec start --local-network", why: "a" }, { skip: "x", runner: "r" }, { skip: "aztec start-broken", why: "b" }]), ["b"]);
  const extra = blocks("```bash\n# Terminal 1\naztec start --local-network\nnode setup.js\n```");
  assert.deepEqual(walk(extra, [{ skip: "aztec start --local-network", why: "a" }]).errors, ['1: no skip block after this line is exactly "aztec start --local-network"', "1: shell block not run"]);
  assert.deepEqual(walk(extra.slice(0, 1).map((b) => ({ ...b, body: b.body.slice(0, 2) })), [{ skip: "aztec start --local-network", why: "a" }]).errors, []);
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
