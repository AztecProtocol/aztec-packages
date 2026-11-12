import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" }).trim();

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const MAIN_PATHS = ["docs-developers", "docs-operate", "sidebars-developer.js", "sidebars-operate.js", "aztec-node.json"];
const PINNED = "b".repeat(40);
const FORK = "f".repeat(40);
const API = "repos/aztec-labs-eng/aztec-node";
const pinFile = (ref: string, commit: string, repository = "https://github.com/aztec-labs-eng/aztec-node") =>
  JSON.stringify({ repository, ref, commit }, null, 2) + "\n";

// A cut worktree: main's paths and a v6 line holding different pages, whose pin names a fork. The pin
// tool is a stand-in (the real one is tested in aztec_node.test.mts) that pins the line to PINNED in
// the canonical repository like `pin` does, or writes the pin and fails like a failed check. `gh`
// answers only the endpoints a test gives it (GitHub's JSON, filtered with --jq), so comparing the
// tag or the fork fails.
let root: string, docs: string, bin: string;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "promote-line-"));
  docs = path.join(root, "docs");
  bin = path.join(root, "bin");
  write(path.join(docs, "scripts/promote_line.sh"), fs.readFileSync(path.resolve(import.meta.dirname, "../promote_line.sh"), "utf8"));
  write(
    path.join(docs, "scripts/aztec_node.mts"),
    `import fs from "node:fs";
const [flag, line, cmd, tag] = process.argv.slice(2);
if (flag !== "--line" || cmd !== "pin") process.exit(2);
fs.writeFileSync(new URL(\`../lines/\${line}/aztec-node.json\`, import.meta.url), ${JSON.stringify(pinFile("TAG", PINNED))}.replace("TAG", tag));
process.exit(process.env.PIN_FAIL ? 1 : 0);
`,
  );
  write(
    path.join(bin, "gh"),
    `#!/usr/bin/env bash
[ "$1" = api ] || exit 2
f="$GH_FIXTURES/$(printf %s "$2" | tr / _).json"
[ -f "$f" ] || exit 1
if [ "\${3:-}" = --jq ]; then jq -r "$4" "$f"; else cat "$f"; fi
`,
  );
  fs.chmodSync(path.join(bin, "gh"), 0o755);
  for (const [dir, who] of [[docs, "main"], [path.join(docs, "lines/v6"), "line"]]) {
    write(path.join(dir, "docs-developers/docs/a.md"), `${who} a\n`);
    write(path.join(dir, "docs-operate/operators/b.md"), `${who} b\n`);
    write(path.join(dir, "sidebars-developer.js"), `// ${who}\n`);
    write(path.join(dir, "sidebars-operate.js"), `// ${who}\n`);
  }
  write(path.join(docs, "docs-developers/docs/main-only.md"), "v7 only\n");
  write(path.join(docs, "aztec-node.json"), pinFile("v7.0.0-nightly.1", "a".repeat(40)));
  write(path.join(docs, "lines/v6/aztec-node.json"), pinFile("v6.1.0-nightly.1", "c".repeat(40), "https://github.com/a-fork/aztec-node"));
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "cut");
});
after(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  git(root, "reset", "-q", "--hard");
  git(root, "clean", "-qfd");
});

type Endpoints = Record<string, unknown>;
const onLine: Endpoints = { [`${API}/compare/v6...${PINNED}`]: { status: "behind" } };
// v6.0.1 tagged on release/6.0.1, which forked at FORK and adds one commit that neither v6 nor main has.
const OWN = { sha: "d".repeat(40), commit: { message: "chore: bump toolchain pins to 6.0.1\n\nbody" } };
const onRelease: Endpoints = {
  [`${API}/compare/v6...${PINNED}`]: {
    status: "diverged",
    ahead_by: 1,
    merge_base_commit: { sha: FORK, commit: { committer: { date: "2026-10-21T11:37:06Z" } } },
    commits: [OWN],
  },
  [`${API}/compare/release/6.0.1...${PINNED}`]: { status: "identical" },
  [API]: { default_branch: "main" },
  [`${API}/compare/main...${PINNED}`]: { status: "diverged", ahead_by: 1, commits: [OWN] },
};

const promote = (tag: string, env: Record<string, string | undefined> = {}, endpoints: Endpoints = onLine) => {
  const fixtures = fs.mkdtempSync(path.join(root, "..", "gh-"));
  for (const [endpoint, json] of Object.entries(endpoints))
    fs.writeFileSync(path.join(fixtures, `${endpoint.replaceAll("/", "_")}.json`), JSON.stringify(json));
  try {
    return spawnSync("bash", [path.join(docs, "scripts/promote_line.sh"), "v6", tag], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CUT: root, GH_FIXTURES: fixtures, PIN_FAIL: undefined, ...env },
    });
  } finally {
    fs.rmSync(fixtures, { recursive: true, force: true });
  }
};

const snapshot = (dir: string) =>
  Object.fromEntries(
    MAIN_PATHS.flatMap((p) => {
      const full = path.join(dir, p);
      if (!fs.existsSync(full)) return [[p, null]];
      if (fs.statSync(full).isFile()) return [[p, fs.readFileSync(full, "utf8")]];
      return (fs.readdirSync(full, { recursive: true }) as string[])
        .filter((f) => fs.statSync(path.join(full, f)).isFile())
        .sort()
        .map((f) => [`${p}/${f}`, fs.readFileSync(path.join(full, f), "utf8")]);
    }),
  );

test("a line cut serves the line's pages and its tag's pin from the main paths", () => {
  const r = promote("v6.0.1");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(docs), snapshot(path.join(docs, "lines/v6")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(docs, "aztec-node.json"), "utf8")).ref, "v6.0.1");
});

test("a release tagged on its own release branch, forked from the line, is promoted, with its fork and its own commits listed", () => {
  // Forked before the line's head moved (diverged), or at the head itself (ahead).
  for (const status of ["diverged", "ahead"]) {
    git(root, "reset", "-q", "--hard");
    const v6 = onRelease[`${API}/compare/v6...${PINNED}`] as object;
    const r = promote("v6.0.1", {}, { ...onRelease, [`${API}/compare/v6...${PINNED}`]: { ...v6, status } });
    assert.equal(r.status, 0, `${status}: ${r.stderr}`);
    assert.deepEqual(snapshot(docs), snapshot(path.join(docs, "lines/v6")), status);
    assert.match(r.stdout, new RegExp(`release/6\\.0\\.1, which forks from v6 at ${FORK} \\(2026-10-21T11:37:06Z\\)`), status);
    assert.match(r.stdout, /^ {2}dddddddddd chore: bump toolchain pins to 6\.0\.1$/m, status);
  }
});

test("a wrong worktree, a dirty docs/, another major, a pinned commit on neither the line nor its own release branch and a failed pin leave the main paths and the line untouched", () => {
  const before = snapshot(docs);
  const cases: [string, () => ReturnType<typeof promote>, RegExp][] = [
    ["no cut", () => promote("v6.0.1", { CUT: undefined }), /not the cut worktree/],
    ["another worktree", () => promote("v6.0.1", { CUT: os.tmpdir() }), /not the cut worktree/],
    ["dirty docs/", () => { write(path.join(docs, "docs-developers/docs/wip.md"), "wip\n"); return promote("v6.0.1"); }, /uncommitted changes/],
    ["another major", () => promote("v7.0.0"), /v7\.0\.0 is not a v6 release/],
    ["off every branch", () => promote("v6.0.1", {}, { [`${API}/compare/v6...${PINNED}`]: { status: "diverged" } }), new RegExp(`${PINNED}\\) is not on aztec-labs-eng/aztec-node's v6 branch .*diverged.*release/6\\.0\\.1`)],
    ["another release's branch", () => promote("v6.0.1", {}, { ...onRelease, [`${API}/compare/release/6.0.1...${PINNED}`]: { status: "diverged" } }), /neither .*v6 nor its release\/6\.0\.1 branch/],
    ["a release branch from main", () => promote("v6.0.1", {}, { ...onRelease, [`${API}/compare/main...${PINNED}`]: { status: "behind", ahead_by: 0, commits: [] } }), /release\/6\.0\.1 carries commits main has \(dddddddddd…\): it is not a release branch of v6/],
    ["failed pin", () => promote("v6.0.1", { PIN_FAIL: "1" }), /pinning line v6 to v6\.0\.1 failed/],
  ];
  for (const [name, run, message] of cases) {
    git(root, "reset", "-q", "--hard");
    git(root, "clean", "-qfd");
    const r = run();
    assert.notEqual(r.status, 0, name);
    assert.match(r.stderr, message, name);
    fs.rmSync(path.join(docs, "docs-developers/docs/wip.md"), { force: true });
    assert.deepEqual(snapshot(docs), before, name);
    assert.equal(git(root, "status", "--porcelain"), "", name);
  }
});
