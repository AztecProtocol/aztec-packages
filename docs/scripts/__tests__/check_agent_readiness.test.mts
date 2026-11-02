import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brokenLinks,
  markdownLinks,
  missingTwins,
  served,
  siteUrls,
  splitContinuations,
} from "../check_agent_readiness.mts";

const files = new Set([
  "index.html",
  "index.md",
  "developers/docs/aztec-js.html",
  "developers/docs/aztec-js.md",
  "developers/docs/aztec-js/how_to_test.html",
  "developers/docs/aztec-js/how_to_test.md",
  "llms.txt",
  "img/brand/favicon.svg",
  "aztec-nr-api/mainnet/noir_aztec/index.html",
  "aztec-nr-api/mainnet/noir_aztec/macros/fn.aztec.html",
  "typescript-api/mainnet/aztec.js.md",
]);
const problemsIn = (file: string, text: string, production = true) =>
  brokenLinks([{ file, text }], files, { production }).problems.map((p) => `${p.line}: ${p.message}`);

test("markdownLinks reads inline, reference and autolinks outside code only", () => {
  const md = [
    "See [tests](./aztec-js/how_to_test.md) and ![logo](/img/brand/favicon.svg).",
    "`[not](/a/link)` in a code span",
    "```",
    "[nor](/this) in a fence",
    "```",
    "[ref]: </developers/docs/aztec-js.md>",
    "<https://docs.aztec.network/llms.txt>",
  ].join("\n");
  assert.deepEqual(markdownLinks(md), [
    { line: 1, target: "./aztec-js/how_to_test.md" },
    { line: 1, target: "/img/brand/favicon.svg" },
    { line: 6, target: "/developers/docs/aztec-js.md" },
    { line: 7, target: "https://docs.aztec.network/llms.txt" },
  ]);
});

test("siteUrls finds docs URLs in code too, without closing punctuation", () => {
  assert.deepEqual(siteUrls("// See https://docs.aztec.network/aztec-nr/testing_contracts.\n`x`"), [
    { line: 1, target: "https://docs.aztec.network/aztec-nr/testing_contracts" },
  ]);
});

test("served follows HTML pretty URLs, never an implied .md", () => {
  assert.ok(served("/developers/docs/aztec-js", files));
  assert.ok(served("/aztec-nr-api/mainnet/noir_aztec/", files));
  assert.ok(served("/aztec-nr-api/mainnet/noir_aztec/macros/fn.aztec", files));
  assert.ok(served("/typescript-api/mainnet/aztec.js.md", files));
  assert.ok(!served("/typescript-api/mainnet/aztec.js", files));
});

test("brokenLinks resolves relative links against the markdown page", () => {
  const page = "developers/docs/aztec-js.md";
  assert.deepEqual(problemsIn(page, "[ok](./aztec-js/how_to_test.md) [frag](#x) [ext](https://noir-lang.org/x)"), []);
  assert.deepEqual(problemsIn(page, "[gone](./aztec-js/how_to_deploy.md)"), [
    "1: link to ./aztec-js/how_to_deploy.md has no built target",
  ]);
});

test("brokenLinks fails a markdown-only target linked without .md, and a typo'd API folder", () => {
  assert.deepEqual(problemsIn("llms.txt", "- [TS](/typescript-api/mainnet/aztec.js)\n- [nr](/aztec-nr-api/mainnnet/noir_aztec/)"), [
    "1: link to /typescript-api/mainnet/aztec.js has no built target",
    "2: link to /aztec-nr-api/mainnnet/noir_aztec/ has no built target",
  ]);
});

test("brokenLinks checks absolute docs links in pages only in production's layout", () => {
  const text = "// See https://docs.aztec.network/aztec-nr/testing_contracts";
  assert.deepEqual(problemsIn("index.md", text, false), []);
  assert.deepEqual(problemsIn("index.md", text, true), [
    "1: link to https://docs.aztec.network/aztec-nr/testing_contracts has no built target",
  ]);
  assert.deepEqual(problemsIn("llms.txt", "[x](https://docs.aztec.network/developers/docs/aztec-js.md)", false), []);
});

test("brokenLinks counts links into the preview-only API folder outside production", () => {
  const text = "[next](/aztec-nr-api/next/noir_aztec/index.html)";
  const run = (production: boolean) => brokenLinks([{ file: "index.md", text }], files, { production });
  assert.deepEqual(run(false), { problems: [], checked: 1, previewOnly: 1 });
  assert.equal(run(true).problems.length, 1);
});

test("missingTwins names sitemap pages without a .md", () => {
  assert.deepEqual(missingTwins(["/", "/developers/docs/aztec-js"], files), []);
  assert.deepEqual(missingTwins(["/developers/docs/aztec-nr"], files), [
    { file: "sitemap.xml", message: "/developers/docs/aztec-nr has no markdown twin" },
  ]);
});

test("splitContinuations finds a blank line after a fenced \\ continuation", () => {
  const split = "```\nnpm install a \\\n\n  b\n```\n";
  const whole = "```bash\nnpm install a \\\n  b\n```\nA prose line ending in \\\n\n";
  assert.deepEqual(splitContinuations(split), [2]);
  assert.deepEqual(splitContinuations(whole), []);
});
