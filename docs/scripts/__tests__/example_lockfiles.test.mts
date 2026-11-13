import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import line from "../../src/preprocess/line.js";

const docsDir = path.resolve(import.meta.dirname, "../..");

// An empty yarn.lock makes an example its own Yarn project instead of an unlisted part of docs/'s. The
// install that needs one creates it, so a tracked copy could only ever be committed filled.
test("no TypeScript example tracks a yarn.lock, and git ignores the one its install creates", () => {
  const roots = ["examples/ts", ...line.lineNames(path.dirname(docsDir)).map((name: string) => `lines/${name}/examples/ts`)];
  const lockfiles = roots.flatMap((root) =>
    fs
      .readdirSync(path.join(docsDir, root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(docsDir, root, entry.name, "config.yaml")))
      .map((entry) => `${root}/${entry.name}/yarn.lock`),
  );
  assert.ok(lockfiles.length >= 2 * roots.length, `too few examples found: ${lockfiles.join(", ")}`);

  const tracked = execFileSync("git", ["-C", docsDir, "ls-files", "--", ...roots.map((root) => `${root}/*/yarn.lock`)], { encoding: "utf8" });
  assert.deepEqual(tracked.split("\n").filter(Boolean), []);
  const ignored = spawnSync("git", ["-C", docsDir, "check-ignore", "--no-index", "--stdin"], { input: lockfiles.join("\n"), encoding: "utf8" });
  assert.deepEqual(ignored.stdout.split("\n").filter(Boolean).sort(), [...lockfiles].sort());
});
