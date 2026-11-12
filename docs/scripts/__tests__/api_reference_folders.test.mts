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

// The keys of each [[redirects]] table, for the TOML this file uses: basic or literal strings and bare
// values, each optionally followed by a comment. Any other table header ends the table.
function redirects(toml: string): Record<string, string>[] {
  const tables: Record<string, string>[] = [];
  let table: Record<string, string> | undefined;
  for (const line of toml.split("\n")) {
    if (/^\s*\[/.test(line)) {
      table = /^\s*\[\[redirects\]\]\s*(#.*)?$/.test(line) ? {} : undefined;
      if (table) tables.push(table);
      continue;
    }
    const pair = table && line.match(/^\s*(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(#.*)?$/);
    if (pair && table) table[pair[1]] = pair[2] ?? pair[3] ?? pair[4];
  }
  return tables;
}

test("the redirect reader reads both string kinds and comments, and stops at the next table", () => {
  const toml = [
    `[[redirects]]`,
    `    from = '/a/*' # a comment`,
    `    # to = "/commented"`,
    `    to = "/b/:splat"`,
    `    status = 302`,
    `[build.environment]`,
    `    force = "true"`,
  ].join("\n");
  assert.deepEqual(redirects(toml), [{ from: "/a/*", to: "/b/:splat", status: "302" }]);
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
      else assert.deepEqual(rule, { from, to: `/${root}/${folder}/:splat`, status: "302" }, `${from} must redirect to ${folder}'s folder`);
    }
  }
});
