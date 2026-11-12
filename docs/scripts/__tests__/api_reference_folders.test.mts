import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import networkDocs from "../../src/network_docs.js";
import { aztecNrApiFolder } from "../../src/utils/aztecNrApi.mjs";

const { apiReferenceDirs, aztecNrApiFolders, docsInstances, networkApiFolder } = networkDocs;
const docs = path.join(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(docs, file), "utf8");
const config = JSON.parse(read("developer_version_config.json"));
const ROOTS = ["aztec-nr-api", "typescript-api"];

// `from`, `to` and `status` of each [[redirects]] block; commented-out keys do not match.
const redirects = (toml: string) =>
  toml
    .split(/^\[\[redirects\]\]\s*$/m)
    .slice(1)
    .map((block) => {
      const key = (name: string) => block.match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\n]*?)"?\\s*$`, "m"))?.[1];
      return { from: key("from"), to: key("to"), status: key("status"), force: key("force") };
    });

test("static/ holds the API reference folder of each version a network reads, and no folder no version links", () => {
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
  for (const root of ROOTS)
    for (const folder of fs.readdirSync(path.join(docs, "static", root)))
      assert.ok(linked.has(`${root}/${folder}`), `static/${root}/${folder} is linked by no docs version: delete it and redirect its URLs`);
});

test("a network on another network's API reference folder redirects its own folder's URLs there", () => {
  const rules = redirects(read("netlify.toml"));
  for (const network of Object.keys(config)) {
    const folder = networkApiFolder(config, network);
    if (!folder) continue;
    for (const root of ROOTS) {
      const from = `/${root}/${network}/*`;
      const rule = rules.find((r) => r.from === from);
      if (folder === network) assert.equal(rule, undefined, `${from}: static/${root}/${network} serves ${network}, so the redirect only catches its 404s`);
      // 302 and no `force`: the network's own folder wins again, uncached, the day it returns.
      else assert.deepEqual(rule, { from, to: `/${root}/${folder}/:splat`, status: "302", force: undefined }, `${from} must redirect to ${folder}'s folder`);
    }
  }
});
