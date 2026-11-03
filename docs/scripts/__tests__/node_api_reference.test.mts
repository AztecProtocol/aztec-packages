import assert from "node:assert/strict";
import { test } from "node:test";
import { generateDocument, type MethodInfo } from "../node_api_reference_generation/generate_node_api_reference.mts";

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
