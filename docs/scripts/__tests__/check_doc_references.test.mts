import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const scripts = path.resolve(import.meta.dirname, "..");
const SCRIPTS = ["check_doc_references.sh", "lib/extract_doc_references.sh", "lib/aztec_node.sh", "aztec_node.mts"];
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" }).trim();

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// A pinned checkout holding `files`, and the pin that names it.
function pinned(stateRoot: string, ref: string, files: string[]) {
  const tree = path.join(stateRoot, ".aztec-node/tree");
  write(path.join(tree, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.0.0\nNOIR_VERSION=0.1.0\n");
  for (const file of files) write(path.join(tree, file), "export {};\n");
  git(tree, "init", "-q");
  git(tree, "add", "-A");
  git(tree, "commit", "-q", "-m", ref);
  const pin = {
    repository: "https://github.com/aztec-labs-eng/aztec-node",
    ref,
    commit: git(tree, "rev-parse", "HEAD"),
    toolchain: { aztec: ref.slice(1), bb: "1.0.0", noir: "0.1.0", l1Artifacts: "1.0.0" },
    noirArchives: { "x86_64-unknown-linux-gnu": `sha256:${"0".repeat(64)}` },
  };
  write(path.join(stateRoot, "aztec-node.json"), JSON.stringify(pin));
}

const page = (refs: string[]) => `---\ntitle: p\nreferences: [${refs.map((r) => `"${r}"`).join(", ")}]\n---\n`;

// The repository's docs/ with main's checkout holding a file the v1 line's checkout lacks, and a
// page in each referencing it.
let root: string;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "doc-references-"));
  git(root, "init", "-q");
  const docs = path.join(root, "docs");
  for (const script of SCRIPTS) {
    fs.mkdirSync(path.dirname(path.join(docs, "scripts", script)), { recursive: true });
    fs.copyFileSync(path.join(scripts, script), path.join(docs, "scripts", script));
  }
  write(path.join(docs, "package.json"), JSON.stringify({ devDependencies: { "@aztec-foundation/l1-artifacts": "1.0.0" } }));
  pinned(docs, "v1.1.0", ["yarn-project/shared.ts", "yarn-project/main_only.ts"]);
  const line = path.join(docs, "lines/v1");
  pinned(line, "v1.0.0", ["yarn-project/shared.ts"]);
  write(path.join(line, ".aztec-node/l1-artifacts/package.json"), '{"version":"1.0.0"}');
  const refs = page(["labs/yarn-project/shared.ts", "labs/yarn-project/main_only.ts"]);
  write(path.join(docs, "docs-developers/page.md"), refs);
  write(path.join(line, "docs-developers/page.md"), refs);
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

const check = (docsDir: string) =>
  spawnSync("bash", [path.join(root, "docs/scripts/check_doc_references.sh"), docsDir], { cwd: root, encoding: "utf8" });

test("a line's references are checked in the line's checkout, main's in main's", () => {
  const main = check("docs");
  assert.equal(main.status, 0, main.stdout + main.stderr);

  const line = check("docs/lines/v1");
  assert.equal(line.status, 1, line.stdout + line.stderr);
  assert.match(line.stdout, /labs\/yarn-project\/main_only\.ts \(referenced in docs\/lines\/v1\/docs-developers\/page\.md\)/);
  assert.doesNotMatch(line.stdout, /shared\.ts \(/);
});
