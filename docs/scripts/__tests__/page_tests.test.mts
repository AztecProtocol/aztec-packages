import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { TRANSCRIPTS, UNTESTED, blocks, isShell } from "../page_tests.mts";

const docs = path.resolve(import.meta.dirname, "../..");
const lines = ["", ...fs.readdirSync(path.join(docs, "lines")).map((l) => `lines/${l}/`)];
const IN_SCOPE = /^docs-developers\/(docs\/tutorials\/.+|getting_started_on_[^/]+)\.mdx?$/;

// Line-relative keys of the in-scope pages of one line that hold a shell block.
function shellPages(line: string): Set<string> {
  const root = path.join(docs, line);
  const dev = path.join(root, "docs-developers");
  const keys = (fs.readdirSync(dev, { recursive: true }) as string[])
    .map((f) => `docs-developers/${f.split(path.sep).join("/")}`)
    .filter((k) => IN_SCOPE.test(k));
  return new Set(keys.filter((k) => blocks(fs.readFileSync(path.join(root, k), "utf8")).some(isShell)));
}

test("every tutorial or getting-started page with shell commands is run by a test or listed as untested", () => {
  const byLine = lines.map((line) => ({ line, pages: shellPages(line) }));
  const everywhere = new Set(byLine.flatMap(({ pages }) => [...pages]));

  const unaccounted = [...everywhere].filter((k) => !(k in TRANSCRIPTS) && !(k in UNTESTED));
  assert.deepEqual(unaccounted, [], "add a transcript test for these pages, or list them in UNTESTED with the reason");

  const stale = Object.keys(UNTESTED).filter((k) => !everywhere.has(k));
  assert.deepEqual(stale, [], "these UNTESTED pages have no shell block on any line: remove them");

  const unreasoned = Object.entries(UNTESTED).filter(([, why]) => !why.trim()).map(([k]) => k);
  assert.deepEqual(unreasoned, []);

  // The test commands run every transcript page on every line.
  const missing = byLine.flatMap(({ line, pages }) => Object.keys(TRANSCRIPTS).filter((k) => !pages.has(k)).map((k) => `${line}${k}`));
  assert.deepEqual(missing, [], "these TRANSCRIPTS pages have no shell block on that line");
});
