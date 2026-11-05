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
const pinFile = (ref: string, commit: string, repository = "https://github.com/aztec-labs-eng/aztec-node") =>
  JSON.stringify({ repository, ref, commit }, null, 2) + "\n";

// A cut worktree: main's paths and a v6 line holding different pages, whose pin names a fork. The pin
// tool is a stand-in (the real one is tested in aztec_node.test.mts) that pins the line to PINNED in
// the canonical repository like `pin` does, or writes the pin and fails like a failed check. `gh`
// answers only the compare of the v6 branch with PINNED in the canonical repository, so comparing
// the tag or the fork fails.
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
    `#!/usr/bin/env bash\n[ "$2" = repos/aztec-labs-eng/aztec-node/compare/v6...${PINNED} ] && echo "\${COMPARE_STATUS:-behind}" || exit 1\n`,
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

const promote = (tag: string, env: Record<string, string | undefined> = {}) =>
  spawnSync("bash", [path.join(docs, "scripts/promote_line.sh"), "v6", tag], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CUT: root, COMPARE_STATUS: undefined, PIN_FAIL: undefined, ...env },
  });

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

test("a wrong worktree, a dirty docs/, another major, a pinned commit off the branch and a failed pin leave the main paths and the line untouched", () => {
  const before = snapshot(docs);
  const cases: [string, () => ReturnType<typeof promote>, RegExp][] = [
    ["no cut", () => promote("v6.0.1", { CUT: undefined }), /not the cut worktree/],
    ["another worktree", () => promote("v6.0.1", { CUT: os.tmpdir() }), /not the cut worktree/],
    ["dirty docs/", () => (write(path.join(docs, "docs-developers/docs/wip.md"), "wip\n"), promote("v6.0.1")), /uncommitted changes/],
    ["another major", () => promote("v7.0.0"), /v7\.0\.0 is not a v6 release/],
    ["off the branch", () => promote("v6.0.1", { COMPARE_STATUS: "diverged" }), new RegExp(`${PINNED}\\) is not on aztec-labs-eng/aztec-node's v6 branch .*diverged`)],
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
