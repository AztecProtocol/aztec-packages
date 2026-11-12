// Each lint gate rejects one bad file and accepts a clean one. These need the installed
// devDependencies, so `yarn test` runs them and the install-free `bootstrap.sh check` does not.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BIN = path.join(DOCS, "node_modules/.bin");

/** A fresh directory on disk, removed after `fn`. */
function withScratch(fn: (dir: string) => void) {
  const root = path.join(os.homedir(), ".cache", "aztec-docs");
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, "lint-gates-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const nested = (depth: number): string =>
  depth === 0 ? 'it("x", () => {});' : `describe("${depth}", () => { ${nested(depth - 1)} });`;

test("Biome rejects a function over both budgets and 6-deep describe nesting, and accepts a small file", () => {
  // Biome's stdin mode reports no diagnostics, so the fixture is a real file beside a copy of the config.
  const lint = (source: string) => {
    let result = { status: -1 as number | null, output: "" };
    withScratch((dir) => {
      fs.copyFileSync(path.join(DOCS, "biome.json"), path.join(dir, "biome.json"));
      fs.mkdirSync(path.join(dir, "scripts"));
      fs.writeFileSync(path.join(dir, "scripts/fixture.mts"), source);
      const r = spawnSync(path.join(BIN, "biome"), ["lint", "--error-on-warnings", "--reporter=concise"], { cwd: dir, encoding: "utf8" });
      result = { status: r.status, output: r.stdout + r.stderr };
    });
    return result;
  };
  const branches = Array.from({ length: 16 }, (_, i) => `  if (a === ${i}) b += ${i};`);
  const statements = Array.from({ length: 81 }, (_, i) => `  b += ${i};`);
  const bad = [
    'import { describe, it } from "node:test";',
    "export function overBudget(a: number) {",
    "  let b = 0;",
    ...branches,
    ...statements,
    "  return b;",
    "}",
    nested(6),
    "",
  ].join("\n");
  const rejected = lint(bad);
  assert.equal(rejected.status, 1, rejected.output);
  assert.deepEqual([...new Set(rejected.output.match(/lint\/[\w/]+/g))].sort(), [
    "lint/complexity/noExcessiveCognitiveComplexity",
    "lint/complexity/noExcessiveLinesPerFunction",
    "lint/complexity/noExcessiveNestedTestSuites",
  ]);
  const accepted = lint(`import { describe, it } from "node:test";\nexport const inc = (a: number) => a + 1;\n${nested(5)}\n`);
  assert.equal(accepted.status, 0, accepted.output);
});
