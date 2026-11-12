import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import networkDocs from "../../src/network_docs.js";
import { aztecNrApiFolder } from "../../src/utils/aztecNrApi.mjs";

const { apiReferenceDirs, aztecNrApiFolders, docsInstances } = networkDocs;
const docs = path.join(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(docs, file), "utf8");

// A network on another network's folder keeps its URLs through netlify.toml: netlify_redirects.test.mts.
test("static/ holds the API reference folder of each version a network reads, and no folder no version links", () => {
  const config = JSON.parse(read("developer_version_config.json"));
  const [developer] = docsInstances(config, config, true);
  const folders = aztecNrApiFolders(developer);
  const served = apiReferenceDirs(developer).map(({ dir }: { dir: string }) => dir);
  for (const dir of served) assert.ok(fs.existsSync(path.join(docs, "static", dir)), `static/${dir} is missing`);
  const linked = new Set([
    ...served,
    // A version no network reads links a folder of its own name; `current` links `next`, which previews generate.
    ...[...JSON.parse(read("developer_versions.json")), "current"].map(
      (name: string) => `aztec-nr-api/${aztecNrApiFolder({ name }, folders)}`,
    ),
  ]);
  for (const root of ["aztec-nr-api", "typescript-api"])
    for (const folder of fs.readdirSync(path.join(docs, "static", root)))
      assert.ok(linked.has(`${root}/${folder}`), `static/${root}/${folder} is linked by no docs version: delete it and redirect its URLs`);
});
