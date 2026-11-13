import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { TRANSCRIPTS, UNTESTED, blocks, isShell, unread } from "../page_tests.mts";

const docs = path.resolve(import.meta.dirname, "../..");
const lines = ["", ...fs.readdirSync(path.join(docs, "lines")).map((l) => `lines/${l}/`)];
const IN_SCOPE = /^docs-developers\/(docs\/tutorials\/.+|getting_started_on_[^/]+)\.mdx?$/;

// The line-relative keys of one line's in-scope pages, with their text.
function inScope(line: string): { key: string; text: string }[] {
  const dev = path.join(docs, line, "docs-developers");
  return (fs.readdirSync(dev, { recursive: true }) as string[])
    .map((f) => `docs-developers/${f.split(path.sep).join("/")}`)
    .filter((key) => IN_SCOPE.test(key))
    .map((key) => ({ key, text: fs.readFileSync(path.join(docs, line, key), "utf8") }));
}

const shellPages = (line: string) => new Set(inScope(line).flatMap(({ key, text }) => (blocks(text).some(isShell) ? [key] : [])));

test("every tutorial or getting-started page with shell commands is run by a test or listed as untested", () => {
  const hidden = lines.flatMap((line) => inScope(line).flatMap(({ key, text }) => unread(text).map((n) => `${line}${key}:${n}`)));
  assert.deepEqual(hidden, [], "the census reads only plain fenced blocks: write these as one");

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

test("a command block the census cannot read is found, and every shell info string counts", () => {
  const page = "> ```bash\n> false\n> ```\n#include_code run /x/run.sh bash\n#include_code main /x/main.rs rust\n<CodeBlock language=\"bash\">false</CodeBlock>\n```bash\ntrue\n```";
  assert.deepEqual(unread(page), [1, 3, 4, 6]);
  assert.deepEqual(unread("- #include_code run /x/run.sh bash\n#include_code run /x/run.sh\nsh\n<!-- #include_code run /x/run.sh bash -->"), [1, 2]);
  assert.deepEqual(
    blocks("```powershell\na\n```\n```terminal\nb\n```\n```text\nc\n```").map(isShell),
    [true, true, false],
  );
});
