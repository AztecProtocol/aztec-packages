import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const docs = path.resolve(import.meta.dirname, "../..");
const script = path.join(docs, "scripts/validate_api_ref_links.sh");

// Mainnet and testnet read v1.0.0, so the build writes a scoped index into the mainnet API folders
// only, although static/ has a testnet folder too.
const page = [
  "[index](pathname:///typescript-api/mainnet/llms.txt)",
  "[package](pathname:///typescript-api/mainnet/aztec.js.md)",
  "[nr index](pathname:///aztec-nr-api/mainnet/llms.txt)",
  "[no index built](pathname:///typescript-api/testnet/llms.txt)",
  "[missing folder](pathname:///typescript-api/devnet/llms.txt)",
  "[missing file](pathname:///typescript-api/mainnet/missing.md)",
];
let root: string;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "validate-api-ref-links-"));
  fs.symlinkSync(path.join(docs, "src"), path.join(root, "src"));
  for (const name of ["developer", "network"]) {
    fs.writeFileSync(path.join(root, `${name}_version_config.json`), JSON.stringify({ mainnet: "v1.0.0", testnet: "v1.0.0" }));
  }
  for (const folder of ["mainnet", "testnet"]) {
    fs.mkdirSync(path.join(root, "static/typescript-api", folder), { recursive: true });
    fs.writeFileSync(path.join(root, "static/typescript-api", folder, "aztec.js.md"), "# aztec.js\n");
  }
  fs.mkdirSync(path.join(root, "static/aztec-nr-api/mainnet"), { recursive: true });
  fs.writeFileSync(path.join(root, "static/aztec-nr-api/mainnet/index.html"), "<html></html>\n");
  const versioned = path.join(root, "developer_versioned_docs/version-v1.0.0");
  fs.mkdirSync(versioned, { recursive: true });
  fs.writeFileSync(path.join(versioned, "page.md"), `${page.join("\n")}\n`);
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

const validate = () => spawnSync("bash", [script], { env: { ...process.env, DOCS_ROOT: root }, encoding: "utf8" });

test("a scoped index the build writes resolves; a missing folder, file or index is broken and fails", () => {
  const run = validate();
  assert.equal(run.status, 1, run.stderr);
  const broken = [...run.stdout.matchAll(/BROKEN: (\S+)/g)].map((m) => m[1]);
  assert.deepEqual(broken, [4, 5, 6].map((line) => `developer_versioned_docs/version-v1.0.0/page.md:${line}`), run.stdout);
});

test("links that all resolve pass", () => {
  fs.writeFileSync(path.join(root, "developer_versioned_docs/version-v1.0.0/page.md"), `${page.slice(0, 3).join("\n")}\n`);
  const run = validate();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /Broken links: 0/);
});
