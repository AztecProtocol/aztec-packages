import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const script = path.resolve(import.meta.dirname, "../netlify-ignore-build.sh");
const quiet = ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "init.defaultBranch=main"];

// An origin and the clones Netlify builds from: blobless with full history (as Netlify clones), and shallow.
//   A ── B (docs/) ── C (outside docs/) ── P (docs/)   refs/pull/7/merge = C + P
//              │                     └──── Q (outside) refs/pull/8/merge = C + Q
//              └─ S (outside docs/; pushed after cloning, so a build must fetch it)
let root: string;
let origin: string;
let clone: string;
let shallow: string;
const c: Record<string, string> = {};

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...quiet, ...args], { encoding: "utf8" }).trim();

function commit(work: string, name: string, file: string) {
  fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
  fs.writeFileSync(path.join(work, file), `${name}\n`);
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", name);
  c[name] = git(work, "rev-parse", "HEAD");
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "netlify-ignore-build-"));
  origin = path.join(root, "origin.git");
  const work = path.join(root, "work");
  git(root, "init", "-q", "--bare", origin);
  git(origin, "config", "uploadpack.allowFilter", "true");
  git(origin, "config", "uploadpack.allowReachableSHA1InWant", "true");
  git(root, "init", "-q", work);
  commit(work, "A", "docs/page.md");
  commit(work, "B", "docs/page.md");
  commit(work, "C", "src.txt");
  git(work, "push", "-q", origin, "HEAD:refs/heads/main");
  for (const [pr, head, file] of [["7", "P", "docs/page.md"], ["8", "Q", "src.txt"]]) {
    git(work, "checkout", "-q", "--detach", c.C);
    commit(work, head, file);
    const merge = git(work, "commit-tree", `${c[head]}^{tree}`, "-p", c.C, "-p", c[head], "-m", `merge ${pr}`);
    git(work, "push", "-q", origin, `${c[head]}:refs/heads/pr-${pr}`, `${merge}:refs/pull/${pr}/merge`);
  }
  clone = path.join(root, "clone");
  shallow = path.join(root, "shallow");
  git(root, "clone", "-q", "--filter=blob:none", `file://${origin}`, clone);
  git(root, "clone", "-q", "--depth=1", `file://${origin}`, shallow);
  git(work, "checkout", "-q", "--detach", c.B);
  commit(work, "S", "src.txt");
  git(work, "push", "-q", origin, "HEAD:refs/heads/side");
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

function ignore(repo: string, env: Record<string, string>, ...args: string[]) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^(GIT_|COMMIT_REF$|CACHED_COMMIT_REF$|REVIEW_ID$)/.test(k))
  );
  return spawnSync("bash", [script, ...args], { cwd: path.join(repo, "docs"), env: { ...clean, ...env }, encoding: "utf8" });
}

const production = (base: string | undefined, head: string, repo = clone) =>
  ignore(repo, { COMMIT_REF: head, ...(base === undefined ? {} : { CACHED_COMMIT_REF: base }) }, "production");

test("production builds whenever the baseline cannot be trusted", () => {
  const cases: [string, string | undefined, string, RegExp, string?][] = [
    ["no baseline", undefined, "C", /^No earlier production build/],
    ["baseline equal to the commit (no cache)", "C", "C", /^No earlier production build/],
    ["malformed baseline", "--upload-pack=x", "C", /^No earlier production build/],
    ["malformed commit", "B", "-x", /^COMMIT_REF is not a commit id/],
    ["unknown baseline", randomBytes(20).toString("hex"), "C", /^Cannot fetch/],
    ["baseline fetched from origin but not an ancestor", "S", "C", /is not on this branch's history/],
    ["shallow clone", "B", "C", /^Shallow clone/, shallow],
  ];
  for (const [label, base, head, reason, repo] of cases) {
    const r = production(base === undefined ? undefined : (c[base] ?? base), c[head] ?? head, repo);
    assert.equal(r.status, 1, `${label}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, reason, label);
    assert.match(r.stdout, /building production\.\n$/, label);
    assert.doesNotMatch(r.stdout, /upload-pack/, `${label} echoes the raw value`);
  }
});

test("production skips only when nothing under docs/ changed since an ancestor baseline", () => {
  const skip = production(c.B, c.C);
  assert.equal(skip.status, 0, skip.stdout + skip.stderr);
  assert.equal(skip.stdout, `No change under docs/ since ${c.B.slice(0, 10)}: skipping production.\n`);
  const build = production(c.A, c.C);
  assert.equal(build.status, 1, build.stdout + build.stderr);
  assert.equal(build.stdout, `docs/ changed since ${c.A.slice(0, 10)}: building production.\n`);
});

test("previews compare the pull request's merge ref with its base", () => {
  assert.equal(ignore(clone, { COMMIT_REF: c.P, REVIEW_ID: "7" }, "preview").status, 1);
  assert.equal(ignore(clone, { COMMIT_REF: c.Q, REVIEW_ID: "8" }, "preview").status, 0);
  assert.equal(ignore(clone, { COMMIT_REF: c.Q }, "preview").status, 1);
});

test("a missing or unknown mode is a usage error", () => {
  assert.equal(ignore(clone, { COMMIT_REF: c.C }).status, 2);
  assert.equal(ignore(clone, { COMMIT_REF: c.C }, "branch-deploy").status, 2);
});
