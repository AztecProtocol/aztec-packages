import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Yarn's age gate (npmMinimalAgeGate) skips a package that npmPreapprovedPackages matches, and an
// entry without a range matches every version. The docs exempt the first-party scopes so a reader can
// install a release on its publication day; each entry names the versions the reader installs, so a
// newer publication still waits out the gate.
const docs = path.resolve(import.meta.dirname, "../..");
const SCOPES = /^@aztec-(labs|foundation)\/\*(?:@(.*))?$/;
const UNREAD = "<unread>";
const lines = ["", ...fs.readdirSync(path.join(docs, "lines")).map((l) => `lines/${l}/`)];

// The entries of each npmPreapprovedPackages in a page's YAML blocks or a .yarnrc.yml: a one-line
// list, or the `- …` items under the key, without YAML comments. A list in another form reads as one
// UNREAD entry, which fails the check rather than escaping it.
function preapprovals(text: string): string[] {
  const scalar = (raw: string) => {
    const quoted = raw.trim().match(/^(["'])(.*?)\1\s*(#.*)?$/);
    return quoted ? quoted[2] : raw.replace(/\s+#.*$/, "").trim();
  };
  const entries: string[] = [];
  const rows = text.split("\n");
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].match(/^\s*npmPreapprovedPackages:(.*)$/);
    if (!m) continue;
    const rest = m[1].replace(/\s+#.*$/, "").trim();
    if (/^\[.*\]$/.test(rest)) entries.push(...rest.slice(1, -1).split(",").filter((e) => e.trim()).map(scalar));
    else if (rest) entries.push(UNREAD);
    else
      for (let j = i + 1; j < rows.length; j++) {
        if (/^\s*(#.*)?$/.test(rows[j])) continue;
        const item = rows[j].match(/^\s*-\s+(.+)$/);
        if (!item) break;
        entries.push(scalar(item[1]));
      }
  }
  return entries;
}

const files = (dir: string, keep: (f: string) => boolean) =>
  fs.existsSync(dir)
    ? (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => !f.split(path.sep).includes("node_modules") && keep(f)).map((f) => path.join(dir, f))
    : [];

const FIRST_PARTY = /@aztec-(labs|foundation)\//;

// Each npmPreapprovedPackages key with the lines after it, up to a fence or the next key at its indent
// or less: wherever a list's entries sit, they sit in here.
function lists(text: string): string[] {
  const rows = text.split("\n");
  const out: string[] = [];
  rows.forEach((row, i) => {
    const key = row.match(/^(\s*)npmPreapprovedPackages:/);
    if (!key) return;
    let j = i + 1;
    for (; j < rows.length; j++) {
      const next = rows[j].match(/^(\s*)([A-Za-z_][\w-]*:(\s|$)|```|~~~)/);
      if (next && next[1].length <= key[1].length) break;
    }
    out.push(rows.slice(i, j).join("\n"));
  });
  return out;
}

// The scope and version of each first-party entry in a file's pre-approvals, and an "unread" one for an
// entry the reader cannot place or a first-party name in a list that no entry it read accounts for.
function firstPartyEntries(text: string) {
  const out: { scope: string; version: string | undefined }[] = [];
  const entries = preapprovals(text);
  for (const entry of entries) {
    const m = entry.match(SCOPES);
    if (m) out.push({ scope: `@aztec-${m[1]}`, version: m[2] });
    else if (entry === UNREAD || FIRST_PARTY.test(entry)) out.push({ scope: "unread", version: entry });
  }
  const named = lists(text).join("\n").match(new RegExp(FIRST_PARTY, "g"))?.length ?? 0;
  const read = entries.filter((e) => FIRST_PARTY.test(e)).length;
  if (named !== read) out.push({ scope: "unread", version: `${named} first-party names in the lists, ${read} read` });
  return out;
}

// By file: pages and the webapp tutorial's .yarnrc.yml in each line, and each released snapshot's pages.
function firstParty() {
  const pages = (f: string) => /\.mdx?$/.test(f);
  const sources = lines.flatMap((l) => [
    ...files(path.join(docs, l, "docs-developers"), pages),
    path.join(docs, l, "examples/webapp-tutorial/.yarnrc.yml"),
  ]);
  return [...sources, ...files(path.join(docs, "developer_versioned_docs"), pages)].flatMap((file) =>
    firstPartyEntries(fs.readFileSync(file, "utf8")).map((e) => ({ file: path.relative(docs, file), ...e })),
  );
}

test("the reader takes every form of the list and flags one it cannot read", () => {
  const read = (yaml: string) => firstPartyEntries(yaml).map((e) => (e.scope === "unread" ? "unread" : `${e.scope}/*@${e.version}`));
  assert.deepEqual(read(`npmPreapprovedPackages:\n  - "@aztec-labs/*@1" # day one\n\n  # and\n  - @aztec-foundation/*@2 # x\nnext: 1`), ["@aztec-labs/*@1", "@aztec-foundation/*@2"]);
  assert.deepEqual(read(`npmPreapprovedPackages: ['@aztec/*', "@aztec-labs/*@#v"] # x`), ["@aztec-labs/*@#v"]);
  assert.deepEqual(read(`npmPreapprovedPackages:\n  - "@aztec-labs/*" # day one`), ["@aztec-labs/*@undefined"]);
  for (const escape of [`: [\n  "@aztec-labs/*",\n]`, `:\n  [\n    "@aztec-labs/*"\n  ]`, `:\n  - >-\n    @aztec-labs/*`])
    assert.ok(read(`npmPreapprovedPackages${escape}\nnext: 1`).includes("unread"), escape);
});

test("every page and the webapp tutorial pre-approve the first-party scopes only at the versions they install", () => {
  const found = firstParty();
  assert.ok(found.some((f) => f.file.endsWith("webapp-tutorial/.yarnrc.yml")), "the webapp tutorial's .yarnrc.yml has no first-party entry");
  const want = (file: string, scope: string) => {
    const snapshot = file.match(/^developer_versioned_docs\/version-v([^/]+)\//)?.[1];
    if (file.endsWith(".yarnrc.yml")) return scope === "@aztec-labs" ? "#include_aztec_version" : "#include_foundation_version";
    if (!snapshot) return scope === "@aztec-labs" ? "#include_version_without_prefix" : "#include_foundation_version_without_prefix";
    // A release renders both macros to versions; the Labs one is the snapshot's own.
    return scope === "@aztec-labs" ? snapshot : /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
  };
  const wrong = found.filter(({ file, scope, version }) => {
    if (scope === "unread") return true;
    const w = want(file, scope);
    return typeof w === "string" ? version !== w : !w.test(version ?? "");
  });
  assert.deepEqual(wrong, []);
});

test("setup.sh writes the versions it installs into the webapp tutorial's pre-approvals, and needs both", () => {
  for (const line of lines) {
    const src = path.join(docs, line, "examples/webapp-tutorial");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-setup-"));
    try {
      for (const f of ["setup.sh", "package.json", ".yarnrc.yml"]) fs.copyFileSync(path.join(src, f), path.join(dir, f));
      fs.mkdirSync(path.join(dir, "bin"));
      fs.writeFileSync(path.join(dir, "bin/yarn"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      const setup = (...args: string[]) =>
        spawnSync("bash", [path.join(dir, "setup.sh"), ...args], { encoding: "utf8", env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` } });

      const usage = setup("6.1.0-nightly.1");
      assert.notEqual(usage.status, 0, `${line}setup.sh ran with one version`);
      const r = setup("6.1.0-nightly.1", "6.0.0-rc.1");
      assert.equal(r.status, 0, r.stderr);
      const entries = preapprovals(fs.readFileSync(path.join(dir, ".yarnrc.yml"), "utf8")).filter((e) => SCOPES.test(e));
      assert.deepEqual(entries.sort(), ["@aztec-foundation/*@6.0.0-rc.1", "@aztec-labs/*@6.1.0-nightly.1"], line);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).dependencies["@aztec-labs/aztec.js"], "6.1.0-nightly.1");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
