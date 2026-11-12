const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { preprocessIncludeCode, resolveSnippetSource } = require("../include_code");

const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    encoding: "utf8",
  }).trim();

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// rootDir mirrors this repository: docs/ with the pin tool, the pin and its checkout, and a root labs/
// whose copy of the snippet differs, so a test can tell which one was read.
function makeRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "include-code-"));
  const docs = path.join(rootDir, "docs");
  write(path.join(docs, "scripts/aztec_node.mts"), fs.readFileSync(path.join(__dirname, "../../../scripts/aztec_node.mts")));
  write(path.join(docs, "package.json"), JSON.stringify({ devDependencies: { "@aztec-foundation/l1-artifacts": "1.0.0" } }));
  const tree = path.join(docs, ".aztec-node/tree");
  write(path.join(tree, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.0.0\nNOIR_VERSION=0.1.0\n");
  write(path.join(tree, "noir-projects/a.nr"), "// docs:start:x\nfn pinned() {}\n// docs:end:x\n");
  git(tree, "init", "-q");
  git(tree, "add", "-A");
  git(tree, "commit", "-q", "-m", "pinned");
  const commit = git(tree, "rev-parse", "HEAD");
  write(
    path.join(docs, "aztec-node.json"),
    JSON.stringify({
      repository: "https://github.com/aztec-labs-eng/aztec-node",
      ref: "v1.0.0",
      commit,
      toolchain: { aztec: "1.0.0", bb: "1.0.0", noir: "0.1.0", l1Artifacts: "1.0.0" },
      noirArchives: { "x86_64-unknown-linux-gnu": `sha256:${"0".repeat(64)}` },
    }),
  );
  write(path.join(rootDir, "labs/noir-projects/a.nr"), "// docs:start:x\nfn submodule() {}\n// docs:end:x\n");
  return { rootDir, tree, commit };
}

const page = "#include_code x /labs/noir-projects/a.nr rust\n";

describe("include_code", () => {
  let root;
  const saved = {};

  beforeEach(() => {
    for (const k of ["LABS_REF", "COMMIT_TAG", "DOCS_COMMIT", "RELEASE_TYPE", "AZTEC_NODE_DIR"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    root = makeRoot();
  });

  afterEach(() => {
    fs.rmSync(root.rootDir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("renders labs/ snippets from the pinned checkout and links aztec-node at the pinned commit", async () => {
    process.env.COMMIT_TAG = "v9.9.9";
    process.env.LABS_REF = "v9.9.9";
    const { content } = await preprocessIncludeCode(page, "page.md", root.rootDir);
    assert.match(content, /fn pinned\(\)/);
    assert.doesNotMatch(content, /fn submodule\(\)/);
    assert.ok(content.includes(`https://github.com/aztec-labs-eng/aztec-node/blob/${root.commit}/noir-projects/a.nr#L1-L3`));
  });

  it("refuses an edited or untracked checkout file, naming the fetch", async () => {
    fs.appendFileSync(path.join(root.tree, "noir-projects/a.nr"), "// edited\n");
    await assert.rejects(preprocessIncludeCode(page, "page.md", root.rootDir), /edited or untracked.*aztec_node\.mts fetch/s);

    const other = makeRoot();
    try {
      write(path.join(other.tree, "noir-projects/b.nr"), "// docs:start:x\nfn planted() {}\n// docs:end:x\n");
      await assert.rejects(
        preprocessIncludeCode("#include_code x /labs/noir-projects/b.nr rust\n", "page.md", other.rootDir),
        /edited or untracked/,
      );
    } finally {
      fs.rmSync(other.rootDir, { recursive: true, force: true });
    }
  });

  it("links this repository's files at DOCS_COMMIT, else HEAD, and released docs require DOCS_COMMIT", () => {
    git(root.rootDir, "init", "-q");
    git(root.rootDir, "commit", "-q", "--allow-empty", "-m", "head");
    const head = git(root.rootDir, "rev-parse", "HEAD");
    const ref = () => resolveSnippetSource("docs/examples/a.ts", root.rootDir).ref;

    assert.strictEqual(ref(), head);
    process.env.RELEASE_TYPE = "nightly";
    assert.strictEqual(ref(), head);
    process.env.RELEASE_TYPE = "mainnet";
    assert.throws(ref, /RELEASE_TYPE=mainnet needs DOCS_COMMIT/);
    process.env.DOCS_COMMIT = "def456";
    assert.deepStrictEqual(resolveSnippetSource("docs/examples/a.ts", root.rootDir), {
      repoUrl: "https://github.com/AztecProtocol/aztec-packages",
      ref: "def456",
      displayPath: "docs/examples/a.ts",
    });
  });

  it("renders a line page from its line's checkout, pin and l1-artifacts, and refuses main's files", async () => {
    const line = path.join(root.rootDir, "docs/lines/v1");
    const tree = path.join(line, ".aztec-node/tree");
    write(path.join(tree, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.1.0\nNOIR_VERSION=0.1.0\n");
    write(path.join(tree, "noir-projects/a.nr"), "// docs:start:x\nfn line() {}\n// docs:end:x\n");
    git(tree, "init", "-q");
    git(tree, "add", "-A");
    git(tree, "commit", "-q", "-m", "line");
    const commit = git(tree, "rev-parse", "HEAD");
    const toolchain = { aztec: "1.1.0", bb: "1.1.0", noir: "0.1.0", l1Artifacts: "1.1.0" };
    const pin = JSON.parse(fs.readFileSync(path.join(root.rootDir, "docs/aztec-node.json"), "utf8"));
    write(path.join(line, "aztec-node.json"), JSON.stringify({ ...pin, ref: "v1.1.0", commit, toolchain }));
    write(path.join(line, ".aztec-node/l1-artifacts/package.json"), '{"version":"1.1.0"}');
    process.env.AZTEC_NODE_DIR = root.tree; // main's checkout: a line page never reads it

    const linePage = path.join(line, "docs-developers/page.md");
    const { content } = await preprocessIncludeCode(page, linePage, root.rootDir);
    assert.match(content, /fn line\(\)/);
    assert.ok(content.includes(`https://github.com/aztec-labs-eng/aztec-node/blob/${commit}/noir-projects/a.nr#L1-L3`));
    assert.match((await preprocessIncludeCode(page, "page.md", root.rootDir)).content, /fn pinned\(\)/);
    assert.deepStrictEqual(
      resolveSnippetSource("docs/lines/v1/.aztec-node/l1-artifacts/src/a.sol", root.rootDir),
      { repoUrl: "https://github.com/AztecProtocol/aztec-packages", ref: "v1.1.0", displayPath: "src/a.sol" },
    );

    const include = (file) => `#include_code x /${file} typescript\n`;
    await assert.rejects(preprocessIncludeCode(include("docs/examples/a.ts"), linePage, root.rootDir), /docs\/examples\/a\.ts is main's, but this page is line v1's/);
    await assert.rejects(preprocessIncludeCode(include("docs/lines/v1/examples/a.ts"), "page.md", root.rootDir), /is line v1's, but this page is main's/);
  });

  it("lets main's pages quote a line's files while both pin one commit, as a promoted line cut does", async () => {
    const line = path.join(root.rootDir, "docs/lines/v1");
    write(path.join(line, "aztec-node.json"), fs.readFileSync(path.join(root.rootDir, "docs/aztec-node.json")));
    write(path.join(line, "examples/a.ts"), "// docs:start:x\nconst promoted = 1;\n// docs:end:x\n");
    process.env.DOCS_COMMIT = "def456";

    const { content } = await preprocessIncludeCode("#include_code x /docs/lines/v1/examples/a.ts typescript\n", "page.md", root.rootDir);
    assert.match(content, /const promoted = 1/);
    assert.ok(content.includes("aztec-packages/blob/def456/docs/lines/v1/examples/a.ts#L1-L3"));
  });

  it("checks a line's checkout even after main's check passed on the same directory", async () => {
    const line = path.join(root.rootDir, "docs/lines/v1");
    const tree = path.join(line, ".aztec-node/tree");
    fs.mkdirSync(path.dirname(tree), { recursive: true });
    execFileSync("git", ["clone", "-q", root.tree, tree]); // main's commit, while the line pins another
    const pin = JSON.parse(fs.readFileSync(path.join(root.rootDir, "docs/aztec-node.json"), "utf8"));
    const toolchain = { ...pin.toolchain, aztec: "1.1.0" };
    write(path.join(line, "aztec-node.json"), JSON.stringify({ ...pin, ref: "v1.1.0", commit: "f".repeat(40), toolchain }));
    write(path.join(line, ".aztec-node/l1-artifacts/package.json"), '{"version":"1.0.0"}');
    process.env.AZTEC_NODE_DIR = tree;

    await preprocessIncludeCode(page, "page.md", root.rootDir);
    await assert.rejects(
      preprocessIncludeCode(page, path.join(line, "docs-developers/page.md"), root.rootDir),
      /not the pinned f{40}/,
    );
  });

  it("links l1-artifacts snippets to aztec-packages at the installed version", () => {
    write(path.join(root.rootDir, "docs/node_modules/@aztec-foundation/l1-artifacts/package.json"), '{"version":"6.0.0-rc.6"}');
    assert.deepStrictEqual(
      resolveSnippetSource("docs/node_modules/@aztec-foundation/l1-artifacts/src/a.sol", root.rootDir),
      { repoUrl: "https://github.com/AztecProtocol/aztec-packages", ref: "v6.0.0-rc.6", displayPath: "src/a.sol" },
    );
  });
});
