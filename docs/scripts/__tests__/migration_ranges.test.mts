import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";
import { compareVersions, parseVersion, renderRange, selectRange } from "../../src/migration_ranges.mjs";
import serveRange from "../../netlify/edge-functions/migration-notes-range.mjs";
import { indexMigrationNotes, splitSections } from "../index_migration_notes.mjs";

const docs = path.join(import.meta.dirname, "../..");
const page = "docs/resources/migration_notes.md";
const copies = {
  main: `docs-developers/${page}`,
  "v6 line": `lines/v6/docs-developers/${page}`,
  "v6.0.0 snapshot": `developer_versioned_docs/version-v6.0.0/${page}`,
};
const read = (file: string) => fs.readFileSync(path.join(docs, file), "utf8");
const main = splitSections(read(copies.main));
const versions = (sections: { version: string }[]) => sections.map((s) => s.version);

test("every copy splits into strictly descending version sections that rebuild the page", () => {
  for (const [name, file] of Object.entries(copies)) {
    const text = read(file);
    const { preamble, sections } = splitSections(text);
    assert.equal(preamble + sections.map((s) => s.markdown).join(""), text, name);
    assert.ok(sections.length >= 60, `${name}: ${sections.length} sections`);
    assert.equal(versions(sections).at(-1), "0.17.0", name);
  }
  assert.equal(versions(main.sections)[0], "TBD");
  assert.equal(versions(splitSections(read(copies["v6.0.0 snapshot"])).sections)[0], "6.0.0");
});

test("headings that are not versions stay inside the version above them", () => {
  const holder = (heading: string) => main.sections.find((s) => s.markdown.includes(`\n${heading}\n`))?.version;
  assert.equal(holder("## [aztec.js] Removal of barrel export"), "3.0.0-devnet.4");
  assert.equal(holder("# [Aztec sandbox] TXE deployment changes"), "0.47.0");
  assert.equal(holder("## Public execution migrated to the Aztec Virtual Machine"), "0.42.0");
  const fenced = splitSections("intro\n## 2.0.0\n```md\n## 9.9.9\n```\n## \\[Aztec.nr] x\n## 1.0.0\n");
  assert.deepEqual(versions(fenced.sections), ["2.0.0", "1.0.0"]);
});

test("a page out of order, or with no version heading, does not split", () => {
  assert.throws(() => splitSections("## 1.0.0\n## 2.0.0\n"), /2\.0\.0 .*after 1\.0\.0/);
  assert.throws(() => splitSections("## 1.0.0\n## 1.0\n"), /after/);
  assert.throws(() => splitSections("# Notes\n## [Aztec.nr] x\n"), /no version heading/);
});

test("versions order by semver precedence", () => {
  const lt = (a: string, b: string) => assert.ok(compareVersions(parseVersion(a)!, parseVersion(b)!) < 0, `${a} < ${b}`);
  lt("4.2.0-aztecnr-rc.2", "4.2.0");
  lt("3.0.0-devnet.4", "3.0.0-devnet.20251212");
  lt("4.0.0-devnet.2-patch.0", "4.1.0-rc.2");
  lt("6.0.0", "TBD");
  lt("9007199254740992.0.0", "9007199254740993.0.0");
  lt("1.0.0-9007199254740992", "1.0.0-9007199254740993");
  assert.equal(compareVersions(parseVersion("0.66")!, parseVersion("v0.66.0")!), 0);
  for (const bad of ["", "6", "6.0.0.0", "01.2.3", "6.0.0-01", "6.0.0+build", "x6.0.0", "6.0.0-", "6.0.0-rc..1", "6." + "1".repeat(63)]) {
    assert.equal(parseVersion(bad), null, bad);
  }
});

test("a range holds the versions after from up to to, oldest first", () => {
  const snapshot = splitSections(read(copies["v6.0.0 snapshot"])).sections;
  const cases: [typeof main.sections, Record<string, string>, string[]][] = [
    [main.sections, { from: "6.0.0-rc.1", to: "6.0.0" }, ["6.0.0-rc.3", "6.0.0"]],
    [main.sections, { from: "6.0.0-rc.2", to: "v6.0.0" }, ["6.0.0-rc.3", "6.0.0"]],
    [main.sections, { from: "5.1.0" }, ["5.2.0", "6.0.0-rc.1", "6.0.0-rc.3", "6.0.0"]],
    [main.sections, { from: "5.1.0", to: "" }, ["5.2.0", "6.0.0-rc.1", "6.0.0-rc.3", "6.0.0"]],
    [main.sections, { from: "6.0.0", to: "unreleased" }, ["TBD"]],
    [snapshot, { from: "6.0.0-rc.3", to: "unreleased" }, ["6.0.0"]],
    [main.sections, { from: "6.0.0" }, []],
    [main.sections, { from: "0.1.0", to: "0.2.0" }, []],
    [main.sections, { from: "v0.65", to: "0.67.0" }, ["0.66", "0.67.0"]],
  ];
  for (const [sections, query, expected] of cases) {
    assert.deepEqual(versions(selectRange(sections, query).included), expected, JSON.stringify(query));
  }
});

test("a bad range names its problem", () => {
  const fails = (query: Record<string, string>, message: RegExp) =>
    assert.throws(() => selectRange(main.sections, query), (e: Error) => e instanceof RangeError && message.test(e.message));
  fails({ to: "6.0.0" }, /from is required/);
  fails({ from: "six" }, /from is not a version/);
  fails({ from: "5.0.0", to: "latest" }, /to is not a version/);
  fails({ from: "7.0.0" }, /from \(7\.0\.0\) is newer than to \(6\.0\.0\)/);
});

test("the rendered range names its versions above the sections", () => {
  const selection = selectRange(main.sections, { from: "6.0.0-rc.1", to: "6.0.0" });
  const text = renderRange(selection, "https://docs.example/developers/docs/resources/migration_notes");
  const [title, source, included] = text.split("\n");
  assert.equal(title, "# Aztec migration notes: 6.0.0-rc.1 to 6.0.0");
  assert.equal(source, "Source: https://docs.example/developers/docs/resources/migration_notes");
  assert.equal(included, "Included versions: 6.0.0-rc.3, 6.0.0");
  assert.ok(text.indexOf("\n## 6.0.0-rc.3\n") < text.indexOf("\n## 6.0.0\n"));
  const none = renderRange(selectRange(main.sections, { from: "6.0.0" }), "https://x");
  assert.match(none, /^Included versions: none$/m);
});

test("the index step writes a JSON index beside every migration notes twin", () => {
  const build = fs.mkdtempSync(path.join(os.tmpdir(), "migration-index-"));
  try {
    assert.throws(() => indexMigrationNotes(build), /no migration_notes\.md/);
    const dir = path.join(build, "developers/docs/resources");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "migration_notes.md"), "> index\n\n# Migration notes\n\n## 2.0.0\nb\n## 1.0.0\na\n");
    assert.deepEqual(indexMigrationNotes(build), ["developers/docs/resources/migration_notes.json"]);
    const index = JSON.parse(fs.readFileSync(path.join(dir, "migration_notes.json"), "utf8"));
    assert.deepEqual(index, { sections: [{ version: "2.0.0", markdown: "## 2.0.0\nb\n" }, { version: "1.0.0", markdown: "## 1.0.0\na\n" }] });
    fs.writeFileSync(path.join(dir, "migration_notes.md"), "# Migration notes\n");
    assert.throws(() => indexMigrationNotes(build), /developers\/docs\/resources\/migration_notes\.md: no version heading/);
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
});

test("the edge function serves a range, refuses a bad one, and otherwise steps aside", async (t: TestContext) => {
  const page = "https://docs.example/developers/docs/resources/migration_notes";
  const fetched: string[] = [];
  let index: Response | null = null;
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    fetched.push(String(url));
    return index ?? new Response("Not Found", { status: 404 });
  });
  const serve = async (query: string, json: unknown = { sections: main.sections }) => {
    fetched.length = 0;
    index = json === null ? null : new Response(JSON.stringify(json));
    return serveRange(new Request(`${page}.md${query}`));
  };

  assert.equal(await serve(""), undefined);
  assert.deepEqual(fetched, []);

  const ok = (await serve("?from=6.0.0-rc.1&to=6.0.0"))!;
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(fetched, [`${page}.json`]);
  assert.deepEqual((await ok.text()).split("\n").slice(0, 3), [
    "# Aztec migration notes: 6.0.0-rc.1 to 6.0.0",
    `Source: ${page}`,
    "Included versions: 6.0.0-rc.3, 6.0.0",
  ]);

  for (const query of ["?to=6.0.0", "?from=six", `?from=${"1".repeat(70)}`]) {
    const bad = (await serve(query))!;
    assert.equal(bad.status, 400, query);
    assert.deepEqual(fetched, [], query);
  }
  const reversed = (await serve("?from=7.0.0"))!;
  assert.equal(reversed.status, 400);
  assert.match(await reversed.text(), /from \(7\.0\.0\) is newer than to \(6\.0\.0\)[\s\S]*TBD, 6\.0\.0, 6\.0\.0-rc\.3/);

  assert.equal(await serve("?from=5.2.0", null), undefined);

  fetched.length = 0;
  await serveRange(new Request("https://docs.example//elsewhere.example/x/migration_notes.md?from=5.2.0"));
  assert.deepEqual(fetched.map((u) => new URL(u).origin), ["https://docs.example"]);
});
