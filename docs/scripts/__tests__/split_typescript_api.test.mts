import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import networkDocs from "../../src/network_docs.js";
import packages from "../typescript_api_generation/packages.js";
import { declarations, folderPage, main, splitPackage } from "../split_typescript_api.mjs";

const pkg = [
  "# @aztec/foundation",
  "",
  "## Quick Import Reference",
  "",
  "```typescript",
  "import { Logger } from '@aztec/foundation';",
  "```",
  "",
  "## Classes",
  "",
  "### Logger",
  "A logger.",
  "",
  "```typescript",
  "### not a heading",
  "```",
  "",
  "## Functions",
  "",
  "### BlockNumber",
  "Makes one.",
  "",
  "## Types",
  "",
  "### BlockNumber",
  "```typescript",
  "type BlockNumber = number",
  "```",
  "",
  "### logger",
  "The type.",
  "",
  "## Enums",
  "",
  "### LogLevel",
  "Values: `debug`, `info`",
].join("\n");
const options = { pkg: "foundation", npmName: "@aztec-labs/foundation", version: "v6.0.0", index: "https://x/typescript-api/v6.0.0/llms.txt" };

test("splitPackage merges names that differ only in case and keeps every kind", () => {
  const pages = splitPackage(pkg, options);
  assert.deepEqual(pages.map(({ file, kinds }) => `${file} ${kinds.join("+")}`), [
    "foundation/Logger.md class+type",
    "foundation/BlockNumber.md function+type",
    "foundation/LogLevel.md enum",
  ]);
  const [logger, blockNumber] = pages;
  assert.match(logger.markdown, /^> TypeScript API reference, `@aztec-labs\/foundation` v6\.0\.0\. Index: https:\/\/x\/typescript-api\/v6\.0\.0\/llms\.txt\n\n# Logger\n\nPackage: `@aztec-labs\/foundation` \(class, type\)\./);
  assert.match(logger.markdown, /## Class Logger\n\nA logger\.\n\n```typescript\n### not a heading\n```\n\n## Type logger\n\nThe type\.\n$/);
  assert.match(blockNumber.markdown, /## Function BlockNumber\n\nMakes one\.\n\n## Type BlockNumber\n\n```typescript\ntype BlockNumber = number\n```\n$/);
  assert.doesNotMatch(pages.map((p) => p.markdown).join(""), /Quick Import|from '@aztec\/foundation'/);
});

test("a comment flattened to one line of backticks does not hide the declarations after it", () => {
  const markdown = "## Classes\n\n### Wallet\n```typescript new Wallet() ```\n\n### ZWallet\nZ.\n";
  assert.deepEqual(splitPackage(markdown, options).map((p) => p.name), ["Wallet", "ZWallet"]);
});

test("every declaration of the committed reference lands in exactly one page", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../../developer_version_config.json", import.meta.url), "utf8"));
  const dir = new URL(`../../static/typescript-api/${networkDocs.networkApiFolder(config, "mainnet")}/`, import.meta.url);
  for (const { name } of packages.documentedPackages()) {
    const markdown = fs.readFileSync(new URL(`${name}.md`, dir), "utf8");
    const pages = splitPackage(markdown, { ...options, pkg: name });
    const placed = pages.flatMap((p) => [...p.markdown.matchAll(/^## (Class|Interface|Function|Type|Enum) (\S+)$/gm)].map((m) => `${m[1].toLowerCase()} ${m[2]}`));
    assert.deepEqual(placed.sort(), declarations(markdown).map((d) => `${d.kind} ${d.name}`).sort(), name);
    assert.equal(placed.length, markdown.match(/^### /gm)?.length ?? 0, name);
    assert.equal(new Set(pages.map((p) => p.file.toLowerCase())).size, pages.length, name);
  }
});

test("each served folder gets an index page listing the package files it holds, its indexes and the guide", (t) => {
  t.mock.method(console, "log", () => {});
  const config = JSON.parse(fs.readFileSync(new URL("../../developer_version_config.json", import.meta.url), "utf8"));
  const folder = networkDocs.networkApiFolder(config, "mainnet");
  assert.ok(folder, "developer_version_config.json maps no mainnet version");
  const build = fs.mkdtempSync(path.join(os.tmpdir(), "ts-folder-page-"));
  try {
    const dir = path.join(build, "typescript-api", folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const file of ["aztec.js.md", "foundation.md", "llm-summary.txt"]) fs.writeFileSync(path.join(dir, file), pkg);
    assert.equal(main(build, {}), 0);
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, [
      `/typescript-api/${folder}/llms.txt`,
      "/developers/docs/aztec-js/typescript_api_reference",
      `/typescript-api/${folder}/aztec.js.md`,
      `/typescript-api/${folder}/foundation.md`,
      `/typescript-api/${folder}/llm-summary.txt`,
    ]);
    assert.match(html, new RegExp(`^<!doctype html>\\n<html lang="en">[\\s\\S]*<title>TypeScript API reference, ${folder}</title>`));
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
    assert.match(html, />@aztec-labs\/aztec\.js<\/a>: Main SDK for building Aztec applications</);
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
});

test("the index page escapes the text it is built from", () => {
  const html = folderPage({ dir: "typescript-api/v1.0.0", version: "v1.0.0", packages: [{ file: "a.md", npmName: "@x/a", description: '<script>"&' }], summary: false });
  assert.match(html, /: &lt;script&gt;&quot;&amp;<\/li>/);
  assert.doesNotMatch(html, /<script>|llm-summary/);
});

test("packages are ours only under the documented scope", () => {
  assert.equal(packages.npmName("aztec.js"), "@aztec-labs/aztec.js");
  assert.ok(packages.isDocumentedPackage("@aztec-labs/stdlib"));
  for (const other of ["@aztec/stdlib", "@aztec/viem", "@aztec-labs/cli"]) assert.ok(!packages.isDocumentedPackage(other), other);
});
