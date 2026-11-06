import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const SCRIPT = path.resolve(import.meta.dirname, "../labs_release_notes.mts");
const COMPARE = "repos/aztec-labs-eng/aztec-node/compare/";

const release = (tag_name: string, body: string | null, extra: Record<string, unknown> = {}) => ({
  tag_name,
  draft: false,
  prerelease: tag_name.includes("-"),
  published_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
  body,
  ...extra,
});

// The stub prints what `gh api` prints for the script's --jq filters: tag names, JSONL releases and
// compare statuses.
const TAGS = ["v7.0.0-rc.1", "v6.1.0", "v6.1.0-rc.2", "v6.1.0-rc.1", "v6.1.0-nightly.20261101", "v6.0.1", "v6.0.0", "v5.0.0-spartan.1"];
const NOTES = "## Breaking changes\r\n\r\n- `[CLI]` removed ([#7](https://github.com/aztec-labs-eng/aztec-node/pull/7)) ✓\n";
const RELEASES = [
  release("v7.0.0-rc.1", "next major"),
  release("v6.1.0", NOTES, { updated_at: "2026-11-06T09:00:00Z" }),
  release("v6.1.0-rc.1", null),
  release("v6.1.0-nightly.20261102", "unpublished", { draft: true }),
  release("v6.1.0-rc.1/../../escape", "crafted tag name"),
  release("v6.0.1", "hotfix on another branch"),
  release("v6.0.0", "the previous release"),
];
const STATUS: Record<string, string> = {
  "v6.1.0-rc.1...v6.1.0": "ahead",
  "v6.1.0-rc.2...v6.1.0": "ahead",
  "v6.0.1...v6.1.0": "diverged",
};

let root: string, bin: string;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "labs-release-notes-"));
  bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, "tags.txt"), TAGS.join("\n") + "\n");
  fs.writeFileSync(path.join(root, "releases.jsonl"), RELEASES.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(root, "compare.txt"), Object.entries(STATUS).map(([k, v]) => `${k} ${v}`).join("\n") + "\n");
  fs.writeFileSync(
    path.join(bin, "gh"),
    `#!/usr/bin/env bash
[ "$1" = api ] || exit 2
for a in "$@"; do case $a in repos/*) p=$a ;; esac; done
[ -n "\${GH_FAIL:-}" ] && [[ $p == *"$GH_FAIL"* ]] && { echo "gh: HTTP 502" >&2; exit 1; }
case $p in
  */tags\\?per_page=100) cat "${root}/tags.txt" ;;
  */releases\\?per_page=100) cat "${root}/releases.jsonl" ;;
  ${COMPARE}*) [ -n "\${GH_STATUS:-}" ] && { echo "$GH_STATUS"; exit 0; }
    grep -m1 "^\${p#${COMPARE}} " "${root}/compare.txt" | cut -d' ' -f2 | grep . || { echo "gh: HTTP 404" >&2; exit 1; } ;;
  *) echo "gh: HTTP 404" >&2; exit 1 ;;
esac
`,
  );
  fs.chmodSync(path.join(bin, "gh"), 0o755);
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

function run(outdir: string, args = ["v6.0.0", "v6.1.0"], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, outdir], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("fetches the notes of the release and rc tags in (from, to] on to's line, verbatim, with their status", () => {
  const out = path.join(root, "notes");
  const r = run(out);
  assert.equal(r.code, 0, r.err);
  const index = [
    "tag\tstatus\tprerelease\tpublished_at\tupdated_at\tbytes",
    "v6.1.0-rc.1\tempty\ttrue\t2026-11-01T00:00:00Z\t2026-11-02T00:00:00Z\t0",
    "v6.1.0-rc.2\tmissing\t-\t-\t-\t-",
    `v6.1.0\tok\tfalse\t2026-11-01T00:00:00Z\t2026-11-06T09:00:00Z\t${Buffer.byteLength(NOTES)}`,
  ].join("\n") + "\n";
  assert.equal(fs.readFileSync(path.join(out, "index.tsv"), "utf8"), index);
  assert.equal(r.out, index);
  assert.equal(fs.readFileSync(path.join(out, "v6.1.0.md"), "utf8"), NOTES);
  assert.deepEqual(fs.readdirSync(root).sort(), ["bin", "compare.txt", "notes", "releases.jsonl", "tags.txt"]);
  assert.deepEqual(fs.readdirSync(out).sort(), ["index.tsv", "v6.1.0.md"]);
});

test("fails closed: a gh failure, an unknown compare status or a used outdir writes nothing", () => {
  const failures: Record<string, string>[] = [
    { GH_FAIL: "/releases" },
    { GH_FAIL: "/tags" },
    { GH_FAIL: `${COMPARE}v6.1.0-rc.2` },
    { GH_STATUS: "unknown" },
  ];
  for (const [i, env] of failures.entries()) {
    const out = path.join(root, `fail-${i}`);
    const r = run(out, undefined, env);
    assert.equal(r.code, 1, `${JSON.stringify(env)}: ${r.out}`);
    assert.equal(fs.existsSync(out), false, `${JSON.stringify(env)} wrote ${out}`);
  }
  const used = path.join(root, "used");
  fs.mkdirSync(used);
  fs.writeFileSync(path.join(used, "v6.0.0.md"), "stale");
  assert.equal(run(used).code, 1);
  assert.deepEqual(fs.readdirSync(used), ["v6.0.0.md"]);
  assert.equal(run(path.join(root, "absent"), ["v6.1.0", "v6.1.0"]).code, 2);
});

test(
  "reads aztec-node's real v6.0.0 notes",
  { skip: process.env.LABS_NOTES_LIVE ? false : "set LABS_NOTES_LIVE=1 (calls the GitHub API, needs gh logged in)" },
  () => {
    const out = path.join(root, "live");
    const r = spawnSync(process.execPath, [SCRIPT, "v5.2.0", "v6.0.0", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const rows = fs.readFileSync(path.join(out, "index.tsv"), "utf8").trim().split("\n").slice(1).map((l) => l.split("\t"));
    const status = Object.fromEntries(rows.map(([tag, s]) => [tag, s]));
    assert.equal(status["v6.0.0"], "ok");
    assert.equal(status["v6.0.0-rc.1"], "ok");
    assert.ok(rows.every(([tag]) => /^v6\.0\.0(-rc\.\d+)?$/.test(tag)), JSON.stringify(rows));
    assert.match(fs.readFileSync(path.join(out, "v6.0.0.md"), "utf8"), /Breaking changes/);
  },
);
