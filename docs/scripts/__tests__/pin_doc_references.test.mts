import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const scripts = path.resolve(import.meta.dirname, "..");
const SCRIPTS = ["pin_doc_references.sh", "lib/extract_doc_references.sh", "lib/aztec_node.sh", "aztec_node.mts"];
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" }).trim();

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// An aztec-node stand-in with one commit per step (a null content deletes the file); returns the commits.
function upstream(dir: string, steps: Record<string, string | null>[]): string[] {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "uploadpack.allowAnySHA1InWant", "true");
  write(path.join(dir, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.0.0\nNOIR_VERSION=0.1.0\n");
  return steps.map((step, i) => {
    for (const [file, text] of Object.entries(step)) {
      if (text === null) fs.rmSync(path.join(dir, file));
      else write(path.join(dir, file), text);
    }
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", `step ${i}`);
    return git(dir, "rev-parse", "HEAD");
  });
}

const pin = (ref: string, commit: string) =>
  JSON.stringify({
    repository: "https://github.com/aztec-labs-eng/aztec-node",
    ref,
    commit,
    toolchain: { aztec: ref.slice(1), bb: "1.0.0", noir: "0.1.0", l1Artifacts: "1.0.0" },
    noirArchives: { "x86_64-unknown-linux-gnu": `sha256:${"0".repeat(64)}` },
  });

const page = (refs: string[]) => `---\ntitle: p\nreferences: [${refs.map((r) => `"${r}"`).join(", ")}]\n---\n`;

// The repository's docs/, whose branch moved main's pin from mainOld to mainNew and the v1 line's
// from lineOld to lineNew since origin/next; each checkout is a depth-1 clone of the new pin.
let base: string, root: string, mainOld: string, mainNew: string;
before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "pin-doc-references-"));
  root = path.join(base, "repo");
  const docs = path.join(root, "docs");
  const line = path.join(docs, "lines/v1");
  fs.mkdirSync(root);
  git(root, "init", "-q");
  for (const script of SCRIPTS) write(path.join(docs, "scripts", script), fs.readFileSync(path.join(scripts, script), "utf8"));
  write(path.join(docs, ".gitignore"), ".aztec-node/\n");
  write(path.join(docs, "package.json"), JSON.stringify({ devDependencies: { "@aztec-foundation/l1-artifacts": "1.0.0" } }));

  [mainOld, mainNew] = upstream(path.join(base, "main"), [
    { "yarn-project/a.ts": "1", "yarn-project/same.ts": "s", "yarn-project/dir/x.ts": "1", "yarn-project/old_name.ts": "renamed\n".repeat(20), "yarn-project/gone.ts": "g" },
    { "yarn-project/a.ts": "2", "yarn-project/dir/x.ts": "2", "yarn-project/old_name.ts": null, "yarn-project/new_name.ts": "renamed\n".repeat(20), "yarn-project/gone.ts": null, "yarn-project/same.ts.orig": "o" },
  ]);
  const [lineOld, lineNew] = upstream(path.join(base, "v1"), [
    { "yarn-project/a.ts": "1", "yarn-project/v1.ts": "1" },
    { "yarn-project/v1.ts": "2" },
  ]);

  write(path.join(docs, "docs-developers/a.md"), page(["labs/yarn-project/a.ts", "labs/yarn-project/same.ts"]));
  write(path.join(docs, "docs-developers/b.md"), "---\ntitle: b\nreferences:\n  [\n    \"labs/yarn-project/dir/*\",\n  ]\n---\n");
  write(path.join(docs, "docs-developers/d.md"), page(["labs/yarn-project/same.ts", "labs/yarn-project/di/*", "docs/examples/x.ts"]));
  write(path.join(docs, "docs-developers/e.md"), page(["labs/yarn-project/a.ts"]));
  write(path.join(docs, "docs-operate/c.md"), page(["labs/yarn-project/old_name.ts", "labs/yarn-project/gone.ts"]));
  write(path.join(line, "docs-developers/a.md"), page(["labs/yarn-project/a.ts", "labs/yarn-project/v1.ts"]));

  write(path.join(docs, "aztec-node.json"), pin("v1.1.0", mainOld));
  write(path.join(line, "aztec-node.json"), pin("v1.0.0", lineOld));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  git(root, "update-ref", "refs/remotes/origin/next", "HEAD");
  write(path.join(docs, "aztec-node.json"), pin("v1.1.0", mainNew));
  write(path.join(line, "aztec-node.json"), pin("v1.0.0", lineNew));
  git(root, "commit", "-q", "-am", "move the pins");

  for (const [up, state] of [["main", docs], ["v1", line]]) {
    execFileSync("git", ["clone", "-q", "--depth", "1", "--no-tags", `file://${path.join(base, up)}`, path.join(state, ".aztec-node/tree")]);
  }
  write(path.join(line, ".aztec-node/l1-artifacts/package.json"), '{"version":"1.0.0"}');
});
after(() => fs.rmSync(base, { recursive: true, force: true }));

function run(...args: string[]) {
  const env = { ...process.env };
  delete env.AZTEC_NODE_DIR;
  return spawnSync("bash", [path.join(root, "docs/scripts/pin_doc_references.sh"), ...args], { cwd: root, env, encoding: "utf8" });
}

const MAIN = [
  "labs/yarn-project/a.ts -> docs/docs-developers/a.md, docs/docs-developers/e.md",
  "labs/yarn-project/dir/* -> docs/docs-developers/b.md",
  "labs/yarn-project/gone.ts -> docs/docs-operate/c.md",
  "labs/yarn-project/old_name.ts -> docs/docs-operate/c.md",
  "",
].join("\n");

test("lists each reference whose files changed, fetching the old commit the checkout lacks", () => {
  const tree = path.join(root, "docs/.aztec-node/tree");
  assert.notEqual(spawnSync("git", ["-C", tree, "cat-file", "-e", `${mainOld}^{commit}`]).status, 0, "the old commit starts outside the checkout");

  const r = run(mainOld);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, MAIN);
});

test("defaults to each line's pin at the merge base with origin/next", () => {
  const main = run();
  assert.equal(main.status, 0, main.stderr);
  assert.equal(main.stdout, MAIN);

  const line = run("--line", "v1");
  assert.equal(line.status, 0, line.stderr);
  assert.equal(line.stdout, "labs/yarn-project/v1.ts -> docs/lines/v1/docs-developers/a.md\n");

  const unmoved = run(mainNew);
  assert.equal(unmoved.status, 0, unmoved.stderr);
  assert.equal(unmoved.stdout, "");

  assert.equal(run("HEAD").status, 2);
});
