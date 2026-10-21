const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveSnippetSource } = require("../include_code");

describe("resolveSnippetSource", () => {
  let rootDir;
  const saved = {};

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "include-code-"));
    fs.mkdirSync(path.join(rootDir, "docs"));
    fs.writeFileSync(path.join(rootDir, "docs", ".labs-sync"), "abc123\n");
    for (const k of ["LABS_REF", "COMMIT_TAG"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("links labs/ code to aztec-node at docs/.labs-sync without the prefix", () => {
    assert.deepStrictEqual(
      resolveSnippetSource("labs/noir-projects/a.nr", rootDir),
      {
        repoUrl: "https://github.com/aztec-labs-eng/aztec-node",
        ref: "abc123",
        displayPath: "noir-projects/a.nr",
      },
    );
  });

  it("prefers LABS_REF, then COMMIT_TAG, for docs and labs/ paths", () => {
    process.env.COMMIT_TAG = "v1.0.0";
    assert.strictEqual(
      resolveSnippetSource("docs/examples/a.ts", rootDir).ref,
      "v1.0.0",
    );
    process.env.LABS_REF = "v1.0.1";
    assert.strictEqual(
      resolveSnippetSource("labs/yarn-project/a.ts", rootDir).ref,
      "v1.0.1",
    );
  });

  it("links l1-artifacts snippets to aztec-packages at the installed version", () => {
    const pkg = path.join(
      rootDir,
      "docs/node_modules/@aztec-foundation/l1-artifacts",
    );
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      '{"version":"6.0.0-rc.6"}',
    );
    process.env.LABS_REF = "ignored";
    assert.deepStrictEqual(
      resolveSnippetSource(
        "docs/node_modules/@aztec-foundation/l1-artifacts/src/a.sol",
        rootDir,
      ),
      {
        repoUrl: "https://github.com/AztecProtocol/aztec-packages",
        ref: "v6.0.0-rc.6",
        displayPath: "src/a.sol",
      },
    );
  });
});
