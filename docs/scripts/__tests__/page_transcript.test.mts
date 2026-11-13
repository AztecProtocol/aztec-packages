import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { blocks, type Step, walk } from "../page_tests.mts";
import { locate, mergeToml, script } from "../page_transcript.mts";

// Runs the script for a fixture page in an empty folder, with the copy source in examples/, and
// returns the files it names as they are after the run (undefined when absent).
function run(page: string, steps: Step[], files: string[] = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "page-transcript-"));
  try {
    fs.mkdirSync(path.join(dir, "examples"));
    fs.mkdirSync(path.join(dir, "reader"));
    fs.writeFileSync(path.join(dir, "examples/src.nr"), "copied\n");
    const { bound, errors } = walk(blocks(page), steps);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(dir, "t.sh"), script("p.md", bound, path.join(dir, "examples")));
    const r = spawnSync("bash", [path.join(dir, "t.sh")], {
      cwd: path.join(dir, "reader"),
      encoding: "utf8",
      input: "",
      env: { PATH: process.env.PATH, TRANSCRIPT_DONE: path.join(dir, "done") },
    });
    const read = (f: string) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : undefined);
    return { status: r.status, stderr: r.stderr, done: read("done") === "done", files: files.map(read) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("the script types blocks verbatim in one shell and ends with the done marker", () => {
  const page = "```bash\nmkdir app && cd app\necho \"it's $(echo ok)\" > out\n```\n```rust title=\"src/a.nr\"\nlet s = '$HOME `x`';\nTRANSCRIPT_EOF_9\n```";
  const steps: Step[] = [{ run: "mkdir app" }, { write: "src/a.nr", to: "src/a.nr" }, { copy: "src.nr", to: "src/b.nr" }];
  const r = run(page, steps, ["reader/app/out", "reader/app/src/a.nr", "reader/app/src/b.nr"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.done);
  assert.deepEqual(r.files, ["it's ok\n", "let s = '$HOME `x`';\nTRANSCRIPT_EOF_9\n", "copied\n"]);
});

test("a skipped block is logged and never run, and a check runs where the spec puts it", () => {
  const page = "```bash\nfalse && aztec start\n```\n```bash\necho page >> out\n```";
  const steps: Step[] = [{ skip: "aztec start", why: "needs a network" }, { check: "echo check >> out", why: "a test-only step" }, { run: "echo page" }];
  const r = run(page, steps, ["reader/out"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.done);
  assert.match(r.stderr, /skipped p\.md:1: false && aztec start \(needs a network\)/);
  assert.deepEqual(r.files, ["check\npage\n"]);
  const failing = run(page, [{ skip: "aztec start", runner: "x" }, { check: "false", why: "a test-only step" }, { run: "echo page" }]);
  assert.match(failing.stderr, /transcript failed at p\.md:check: not on the page, a test-only step/);
});

test("a failing command names its page line, and a block that exits early never writes the done marker", () => {
  const failing = run("x\n```bash\necho a\nfalse 'it''s'\n```", [{ run: "false" }]);
  assert.notEqual(failing.status, 0);
  assert.match(failing.stderr, /transcript failed at p\.md:2: false/);
  assert.equal(failing.done, false);
  const early = run("```bash\nexit 0\n```", [{ run: "exit" }]);
  assert.equal(early.status, 0);
  assert.equal(early.done, false);
});

test("a write whose body holds its own delimiter is refused", () => {
  const { bound } = walk(blocks("```text\nTRANSCRIPT_EOF_1\n```"), [{ write: "TRANSCRIPT", to: "a" }]);
  assert.throws(() => script("p.md", bound, "/x"), /holds the line TRANSCRIPT_EOF_1/);
});

test("merge adds only the keys a table lacks, at the end of that table, and refuses another value for a key it has", () => {
  const file = '[package]\nname = "c"\n\n[dependencies]\naztec = { git = "a" }\n\n[extra]\nk = 1\n';
  const block = '[dependencies]\naztec = {git="a"}\nbalance_set = { git = "b" }\n[new]\nz = 2';
  assert.equal(mergeToml(file, block), '[package]\nname = "c"\n\n[dependencies]\naztec = { git = "a" }\nbalance_set = { git = "b" }\n\n[extra]\nk = 1\n\n[new]\nz = 2');
  assert.throws(() => mergeToml(file, '[dependencies]\naztec = { git = "a/" }'), /another value: aztec/);
  assert.throws(() => mergeToml(file, '[dependencies]\naztec = { git = " a" }'), /another value: aztec/);
  assert.throws(() => mergeToml(file, "[dependencies]\naztec = {invalid toml"), /another value/);
  assert.throws(() => mergeToml(file, "[d]\nx = [\n  1,\n]"), /one-line keys/);
});

test("a page path maps to its spec key and the examples it copies from", () => {
  const key = "docs-developers/docs/tutorials/a.md";
  assert.deepEqual(locate(`docs/${key}`), { root: "docs", key });
  assert.deepEqual(locate(`docs/lines/v6/${key}`), { root: "docs/lines/v6", key });
  assert.deepEqual(locate("docs/developer_versioned_docs/version-v6.0.0/docs/tutorials/a.md"), { root: "docs", key });
});
