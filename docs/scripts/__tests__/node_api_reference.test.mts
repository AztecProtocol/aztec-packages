import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateDocument, type MethodInfo } from "../node_api_reference_generation/node_api_reference_document.mts";

const method = (namespace: string, name: string): MethodInfo => ({
  name,
  namespace,
  jsdoc: { description: "", params: [], returns: "" },
  paramNames: [],
  paramTypes: [],
  returnType: "void",
});

test("every admin port example sends the API key header the operator pages use", () => {
  const methods = [method("aztec", "getBlockNumber"), method("aztecAdmin", "getConfig"), method("aztecAdmin", "ungrouped")];
  const doc = generateDocument(new Map(methods.map((m) => [`${m.namespace}:${m.name}`, m])), {
    aztec: ["getBlockNumber"],
    aztecAdmin: ["getConfig", "ungrouped"],
  });
  const blocks = [...doc.matchAll(/```bash\n([\s\S]*?)```/g)].map(([, body]) => body);
  const admin = blocks.filter((b) => b.includes("localhost:8880"));
  // The section intro's CLI and Docker forms, then CLI and Docker for each admin method, grouped or not.
  assert.equal(admin.length, 6);
  for (const block of admin) assert.match(block, /-H 'x-api-key: \[ADMIN_API_KEY\]'/);
  const pub = blocks.filter((b) => b.includes("localhost:8080"));
  assert.equal(pub.length, 1);
  assert.doesNotMatch(pub[0], /x-api-key/);
});

test("the CLI runs when invoked through a symlink", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "node-api-reference-"));
  try {
    const link = path.join(dir, "generate.mts");
    fs.symlinkSync(fileURLToPath(new URL("../node_api_reference_generation/generate_node_api_reference.mts", import.meta.url)), link);
    const run = spawnSync(process.execPath, [link], { encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^Usage: /m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
