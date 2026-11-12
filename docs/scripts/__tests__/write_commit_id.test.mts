import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const script = path.resolve(import.meta.dirname, "../write_commit_id.sh");
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|COMMIT_REF$)/.test(k)));
let root: string;
let repo: string;
let head: string;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "write-commit-id-"));
  repo = path.join(root, "repo");
  const git = (...args: string[]) => execFileSync("git", args, { env: clean, encoding: "utf8" }).trim();
  git("init", "-q", repo);
  git("-C", repo, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "c");
  head = git("-C", repo, "rev-parse", "HEAD");
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

function write(cwd: string, env: Record<string, string>) {
  const out = fs.mkdtempSync(path.join(root, "build-"));
  // The ceiling keeps git from finding a repository above the temporary directory.
  const run = spawnSync("bash", [script, out], { cwd, env: { ...clean, GIT_CEILING_DIRECTORIES: root, ...env }, encoding: "utf8" });
  const file = path.join(out, "commit.txt");
  return { status: run.status, stdout: run.stdout, commit: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined };
}

test("commit.txt names a valid COMMIT_REF, else the checkout's HEAD, else is skipped, and never fails", () => {
  const ref = "0123456789abcdef0123456789abcdef01234567";
  assert.deepEqual(write(repo, { COMMIT_REF: ref }), { status: 0, stdout: "", commit: `${ref}\n` });

  const malformed = write(repo, { COMMIT_REF: "x\nforged" });
  assert.deepEqual([malformed.status, malformed.commit], [0, `${head}\n`]);
  assert.match(malformed.stdout, /^COMMIT_REF is not a commit id[^\n]*\n$/);

  const neither = write(root, {});
  assert.deepEqual([neither.status, neither.commit], [0, undefined]);
  assert.match(neither.stdout, /^No COMMIT_REF and no git checkout[^\n]*\n$/);
});
