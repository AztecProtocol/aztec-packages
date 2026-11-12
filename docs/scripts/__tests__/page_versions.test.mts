import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { blocks } from "../page_tests.mts";

// A version a page types into a command or file must be the one the example it quotes installs, or the
// reader builds against a package the examples never ran with. Only packages the example declares are
// compared: a version it leaves to the reader is the page's own choice.
const docs = path.resolve(import.meta.dirname, "../..");
const lines = ["", ...fs.readdirSync(path.join(docs, "lines")).map((l) => `lines/${l}/`)];
const yarn = JSON.parse(fs.readFileSync(path.join(docs, "package.json"), "utf8")).packageManager.split("@")[1];

const LITERAL = /(?<![\w@/.-])(?:npm:)?((?:@[a-z0-9-]+\/)?[a-z0-9][\w.-]*)@([\^~]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/g;
const QUOTED = /#include_code\s+\S+\s+\/docs\/((?:lines\/v\d+\/)?)examples\/ts\/([^/\s]+)\//g;

// Each package name@version typed in a page's fenced blocks, with its line in the page.
function literals(text: string) {
  return blocks(text).flatMap((b) =>
    b.body.flatMap((row, i) => [...row.matchAll(LITERAL)].map((m) => ({ row: b.line + 1 + i, name: m[1], version: m[2] }))),
  );
}

// The versions an example installs: its config.yaml's `npm:name@version` entries, the first-party
// scopes at its line's pin (examples/ts/lib.sh), and Yarn at docs/package.json's packageManager.
function declared(config: string, pin: { aztec: string; bb: string }): Map<string, string> {
  const out = new Map([["yarn", yarn]]);
  let inDeps = false;
  for (const row of config.split("\n")) {
    if (/^\S/.test(row)) inDeps = /^dependencies:/.test(row);
    const entry = inDeps && row.match(/^\s*-\s*["']?([^"'\s#]+)["']?\s*(#.*)?$/)?.[1];
    if (!entry) continue;
    const npm = entry.match(/^npm:((?:@[^/]+\/)?[^@]+)@(.+)$/);
    if (npm) out.set(npm[1], npm[2]);
    else if (entry.startsWith("@aztec-labs/")) out.set(entry, pin.aztec);
    else if (entry.startsWith("@aztec-foundation/")) out.set(entry, pin.bb);
  }
  return out;
}

test("the parsers read scoped, aliased and package-manager versions", () => {
  assert.deepEqual(
    literals('x hardhat@3.21.2\n```bash\nyarn add hardhat@3.21.2 @aztec/viem@2.38.2 npm:tsx@^4.1.0 a@#include_x\n```\n```json\n"packageManager": "yarn@4.13.0"\n```'),
    [
      { row: 3, name: "hardhat", version: "3.21.2" },
      { row: 3, name: "@aztec/viem", version: "2.38.2" },
      { row: 3, name: "tsx", version: "^4.1.0" },
      { row: 6, name: "yarn", version: "4.13.0" },
    ],
  );
  const config = 'contracts:\n  - "npm:not@1.0.0"\ndependencies:\n  - "@aztec-labs/aztec.js"\n  # - "npm:viem@9.9.9"\n  - "npm:@aztec/viem@2.38.2"\n  - npm:hardhat@3.21.2 # x\n  - "npm:left"\n';
  assert.deepEqual(
    Object.fromEntries(declared(config, { aztec: "6.1.0", bb: "6.0.0" })),
    { yarn, "@aztec-labs/aztec.js": "6.1.0", "@aztec/viem": "2.38.2", hardhat: "3.21.2" },
  );
});

test("a version typed in a page equals the one the example it quotes installs", () => {
  const wrong: string[] = [];
  let compared = 0;
  for (const line of lines) {
    const dev = path.join(docs, line, "docs-developers");
    const pin = JSON.parse(fs.readFileSync(path.join(docs, line, "aztec-node.json"), "utf8")).toolchain;
    for (const f of (fs.readdirSync(dev, { recursive: true }) as string[]).filter((f) => /\.mdx?$/.test(f))) {
      const text = fs.readFileSync(path.join(dev, f), "utf8");
      const page = path.join(line, "docs-developers", f);
      const projects = new Set([...text.matchAll(QUOTED)].map((m) => `${m[1]}examples/ts/${m[2]}`));
      for (const project of projects) {
        const config = path.join(docs, project, "config.yaml");
        assert.ok(fs.existsSync(config), `${page} quotes ${project}, which has no config.yaml`);
        const versions = declared(fs.readFileSync(config, "utf8"), pin);
        for (const { row, name, version } of literals(text)) {
          const want = versions.get(name);
          if (want === undefined) continue;
          compared++;
          if (version !== want) wrong.push(`${page}:${row}: ${name}@${version}, but ${project} installs ${want}`);
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
  assert.ok(compared > 0, "no page types a version an example declares: the page or config parser no longer matches");
});
