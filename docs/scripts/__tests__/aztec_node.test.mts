import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  type Options,
  type Pin,
  PinError,
  envLines,
  fetchTree,
  integrityMatches,
  pinFile,
  pinTag,
  platform,
  problems,
  readPin,
  treeDir,
  validatePin,
} from "../aztec_node.mts";

// A local stand-in for aztec-node: commit A tagged v1.0.0 (annotated), commit B tagged
// v1.1.0-nightly.20260101 (lightweight), and a docs/ directory whose package.json pins l1-artifacts.
type Fixture = { root: string; o: Options; remote: string; a: string; b: string; pinA: Pin; pinB: Pin };

const quiet = ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t"];
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...quiet, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function makeFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aztec-node-test-"));
  const repo = path.join(root, "remote");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  write(path.join(repo, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.0.0-rc.1\n# comment\nNOIR_VERSION=0.9.0 # trailing\n");
  write(path.join(repo, "noir-projects/lib.nr"), "fn main() {}\n");
  write(path.join(repo, "docs/upstream.md"), "upstream docs\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "A");
  const a = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "-a", "-m", "release", "v1.0.0");
  write(path.join(repo, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.1.0\nNOIR_VERSION=0.9.1\n");
  git(repo, "commit", "-q", "-am", "B");
  const b = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "v1.1.0-nightly.20260101");

  const docsDir = path.join(root, "docs");
  write(path.join(docsDir, "package.json"), JSON.stringify({ devDependencies: { "@aztec-foundation/l1-artifacts": "1.0.0-rc.1" } }));
  const remote = pathToFileURL(repo).href;
  const pinA: Pin = { repository: remote, ref: "v1.0.0", commit: a, toolchain: { aztec: "1.0.0", bb: "1.0.0-rc.1", noir: "0.9.0", l1Artifacts: "1.0.0-rc.1" } };
  const pinB: Pin = { repository: remote, ref: "v1.1.0-nightly.20260101", commit: b, toolchain: { aztec: "1.1.0-nightly.20260101", bb: "1.1.0", noir: "0.9.1", l1Artifacts: "1.1.0" } };
  return { root, o: { docsDir, repository: remote }, remote, a, b, pinA, pinB };
}

let f: Fixture;
beforeEach(() => {
  delete process.env.AZTEC_NODE_DIR;
  f = makeFixture();
});
afterEach(() => fs.rmSync(f.root, { recursive: true, force: true }));

const head = (o: Options) => git(treeDir(o), "rev-parse", "HEAD");

test("fetch checks out the pinned commit without aztec-node's own docs/", () => {
  fetchTree(f.o, f.pinA);
  assert.equal(head(f.o), f.a);
  assert.ok(fs.existsSync(path.join(treeDir(f.o), "noir-projects/lib.nr")));
  assert.ok(!fs.existsSync(path.join(treeDir(f.o), "docs")));
  assert.deepEqual(problems(f.o, f.pinA), []);
});

test("a checkout at the pinned commit is reused without touching the remote", () => {
  fetchTree(f.o, f.pinA);
  const saved = process.env.GIT_ALLOW_PROTOCOL;
  process.env.GIT_ALLOW_PROTOCOL = "https"; // a fetch from the file:// remote would now fail
  try {
    fetchTree(f.o, f.pinA);
  } finally {
    if (saved === undefined) delete process.env.GIT_ALLOW_PROTOCOL;
    else process.env.GIT_ALLOW_PROTOCOL = saved;
  }
  assert.equal(head(f.o), f.a);
});

test("a moved pin fetches the new commit", () => {
  fetchTree(f.o, f.pinA);
  fetchTree(f.o, f.pinB);
  assert.equal(head(f.o), f.b);
});

test("a tag that names a different commit than the pin is refused", () => {
  assert.throws(() => fetchTree(f.o, { ...f.pinA, commit: f.b }), (e) => e instanceof PinError && /names .* but the pin says/.test(e.message));
});

test("edited or untracked files fail check, and fetch restores the commit", () => {
  fetchTree(f.o, f.pinA);
  const lib = path.join(treeDir(f.o), "noir-projects/lib.nr");
  fs.writeFileSync(lib, "fn main() { edited }\n");
  assert.match(problems(f.o, f.pinA).join(), /edited or untracked/);
  fetchTree(f.o, f.pinA);
  assert.equal(fs.readFileSync(lib, "utf8"), "fn main() {}\n");

  const extra = path.join(treeDir(f.o), "noir-projects/extra.nr");
  fs.writeFileSync(extra, "fn planted() {}\n");
  assert.match(problems(f.o, f.pinA).join(), /edited or untracked/);
  fetchTree(f.o, f.pinA);
  assert.ok(!fs.existsSync(extra));
  assert.deepEqual(problems(f.o, f.pinA), []);
});

test("check names toolchain and package.json drift with the fix", () => {
  fetchTree(f.o, f.pinA);
  const drift = problems(f.o, { ...f.pinA, toolchain: { aztec: "1.0.1", bb: "1.0.0-rc.2", noir: "0.8.0", l1Artifacts: "1.0.0-rc.1" } });
  assert.match(drift.join("\n"), /BB_VERSION=1\.0\.0-rc\.1: set it to 1\.0\.0-rc\.1/);
  assert.match(drift.join("\n"), /NOIR_VERSION=0\.9\.0: set it to 0\.9\.0/);
  assert.match(drift.join("\n"), /toolchain\.aztec must be 1\.0\.0/);
  assert.match(drift.join("\n"), /l1Artifacts must equal toolchain\.bb/);

  write(path.join(f.o.docsDir, "package.json"), JSON.stringify({ devDependencies: { "@aztec-foundation/l1-artifacts": "0.1.0" } }));
  assert.match(problems(f.o, f.pinA).join(), /pins @aztec-foundation\/l1-artifacts 0\.1\.0: set it to 1\.0\.0-rc\.1/);
});

test("check fails on a missing or foreign checkout", () => {
  assert.match(problems(f.o, f.pinA).join(), /not the pinned/);
  fetchTree(f.o, f.pinB);
  assert.match(problems(f.o, f.pinA).join(), new RegExp(`at ${f.b}, not the pinned ${f.a}`));
});

test("fetch refuses a directory it did not create, and AZTEC_NODE_DIR must be absolute", () => {
  const work = path.join(f.root, "work");
  write(path.join(work, "notes.txt"), "mine\n");
  const clone = path.join(f.root, "clone");
  fs.mkdirSync(clone);
  git(clone, "init", "-q");
  write(path.join(clone, "untracked.txt"), "mine\n");
  for (const dir of [work, clone]) {
    process.env.AZTEC_NODE_DIR = dir;
    assert.throws(() => fetchTree(f.o, f.pinA), (e) => e instanceof PinError && /did not create/.test(e.message), dir);
  }
  assert.ok(fs.existsSync(path.join(work, "notes.txt")) && !fs.existsSync(path.join(work, ".git")));
  assert.ok(fs.existsSync(path.join(clone, "untracked.txt")));
  assert.equal(git(clone, "remote"), "");

  process.env.AZTEC_NODE_DIR = "relative/tree";
  assert.throws(() => treeDir(f.o), (e) => e instanceof PinError && /absolute/.test(e.message));
  process.env.AZTEC_NODE_DIR = "";
  assert.equal(treeDir(f.o), path.join(f.o.docsDir, ".aztec-node", "tree"));
});

test("malformed pin fields are refused before they reach git", () => {
  const bad: [string, Partial<Pin>][] = [
    ["repository", { repository: "https://example.com/other" }],
    ["ref", { ref: "--upload-pack=x" }],
    ["ref", { ref: "main" }],
    ["commit", { commit: "abc123" }],
    ["commit", { commit: f.a.toUpperCase() }],
    ["toolchain.bb", { toolchain: { ...f.pinA.toolchain, bb: "-x" } }],
  ];
  for (const [field, change] of bad)
    assert.throws(() => validatePin({ ...f.pinA, ...change }, f.o), (e) => e instanceof PinError && e.message.includes(field), field);
  assert.throws(() => validatePin(f.pinA, { docsDir: f.o.docsDir }), /repository must be https:\/\/github\.com\/aztec-labs-eng\/aztec-node/);
});

test("pin writes the tag's commit and toolchain, peeling annotated tags", () => {
  const nightly = pinTag(f.o, "v1.1.0-nightly.20260101");
  assert.deepEqual(nightly, f.pinB);
  assert.deepEqual(readPin(f.o), f.pinB);
  assert.match(problems(f.o, nightly).join(), /set it to 1\.1\.0 and run yarn install/);

  const release = pinTag(f.o, "v1.0.0");
  assert.equal(release.commit, f.a);
  assert.deepEqual(problems(f.o, release), []);
  assert.equal(fs.readFileSync(pinFile(f.o), "utf8"), `${JSON.stringify(f.pinA, null, 2)}\n`);
  assert.throws(() => pinTag(f.o, "v9.9.9"), /has no tag v9\.9\.9/);
});

test("env quotes every value for the shell and omits unprovisioned binaries", () => {
  const o = { ...f.o, docsDir: path.join(f.root, "it's docs") };
  fs.cpSync(f.o.docsDir, o.docsDir, { recursive: true });
  fetchTree(o, f.pinA);
  const lines = envLines(o, f.pinA);
  assert.ok(!lines.some((l) => /^export (NARGO|BB)=/.test(l)));
  const out = execFileSync("bash", ["-c", `${lines.join("\n")}\nprintf '%s|%s' "$AZTEC_NODE_DIR" "$AZTEC_NODE_REF"`], { encoding: "utf8" });
  assert.equal(out, `${path.join(o.docsDir, ".aztec-node/tree")}|v1.0.0`);

  // A nargo whose version only starts with the pinned one is not the pinned nargo.
  const nargo = path.join(o.docsDir, ".aztec-node/bin/nargo");
  fs.mkdirSync(path.dirname(nargo), { recursive: true });
  for (const [reported, exported] of [["0.9.00", false], ["0.9.0", true]] as const) {
    fs.writeFileSync(nargo, `#!/bin/sh\necho "nargo version = ${reported}"\n`, { mode: 0o755 });
    assert.equal(envLines(o, f.pinA).some((l) => l.startsWith("export NARGO=")), exported, reported);
  }
});

test("registry integrity and platform names", () => {
  const bytes = new TextEncoder().encode("tarball");
  const sri = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  assert.ok(integrityMatches(bytes, sri));
  assert.ok(!integrityMatches(new TextEncoder().encode("tampered"), sri));
  assert.ok(!integrityMatches(bytes, sri.replace("sha512", "sha1")));
  assert.deepEqual(platform("linux", "x64"), { npm: "linux-x64", rust: "x86_64-unknown-linux-gnu" });
  assert.deepEqual(platform("darwin", "arm64"), { npm: "darwin-arm64", rust: "aarch64-apple-darwin" });
  assert.throws(() => platform("win32", "x64"), PinError);
});
