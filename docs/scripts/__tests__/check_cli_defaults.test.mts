import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const scripts = path.resolve(import.meta.dirname, "..");
const quiet = ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t"];

// A throwaway repository with the check and its helper at docs/scripts/, as in this repository.
// The key is generated per run so no key-shaped value is ever committed, even as a fixture.
let root: string;
let key: string;
const git = (...args: string[]) => execFileSync("git", ["-C", root, ...quiet, ...args], { encoding: "utf8" });
const page = (file: string) => path.join(root, "docs", file);
const check = (...args: string[]) => spawnSync("bash", [page("scripts/check_cli_defaults.sh"), ...args], { encoding: "utf8" });
const scrub = (file: string) =>
  execFileSync("bash", ["-c", `source "$0" && scrub_key_defaults "$1"`, page("scripts/lib/key_defaults.sh"), file]);
const inFile = (file: string) =>
  execFileSync("bash", ["-c", `source "$0" && key_defaults_in_file "$1" help`, page("scripts/lib/key_defaults.sh"), file], {
    encoding: "utf8",
  });

const zero = `0x${"0".repeat(64)}`;
const salt = `0x${"0".repeat(63)}1`;
const leakyPage = () =>
  [
    `- \`--l1-private-key <string>\` - The private key to the eth account bridging (default: "${key}")`,
    `    --bot.privateKey <value>    (default: ${key})($BOT_PRIVATE_KEY)`,
    `    --bot.tokenSalt <value>     (default: ${salt})($BOT_TOKEN_SALT)`,
    `- \`--secret <string>\` - unset (default: "${zero}")`,
    `An example key in prose: ${key}`,
    "",
  ].join("\n");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "check-cli-defaults-"));
  key = `0x${randomBytes(32).toString("hex")}`;
  fs.mkdirSync(page("scripts/lib"), { recursive: true });
  fs.copyFileSync(path.join(scripts, "check_cli_defaults.sh"), page("scripts/check_cli_defaults.sh"));
  fs.copyFileSync(path.join(scripts, "lib/key_defaults.sh"), page("scripts/lib/key_defaults.sh"));
  fs.writeFileSync(page("cli.md"), "clean\n");
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "clean");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test("a key-shaped default fails the check, naming its line and only 4 hex characters", () => {
  assert.equal(check().status, 0);
  fs.writeFileSync(page("cli.md"), leakyPage());
  const r = check();
  assert.equal(r.status, 1);
  const out = r.stdout + r.stderr;
  assert.match(out, new RegExp(`docs/cli\\.md:1 0x${key.slice(2, 6)}…`));
  assert.match(out, new RegExp(`docs/cli\\.md:2 0x${key.slice(2, 6)}…`));
  assert.doesNotMatch(out, /cli\.md:[345]\b/);
  assert.ok(!out.includes(key.slice(2, 7)), "prints more than 4 hex characters of the key");

  // The generators' check of a captured help file, outside git.
  const found = inFile(page("cli.md"));
  assert.equal(found, `help:1 0x${key.slice(2, 6)}…\nhelp:2 0x${key.slice(2, 6)}…\n`);
  fs.writeFileSync(page("cli.md"), "clean\n");
  assert.equal(inFile(page("cli.md")), "");
});

test("--cached and <rev> read the index and that commit, not the working tree", () => {
  // Exit 1 only with the leaked line named; any other failure is not a finding.
  const flagged = (...args: string[]) => {
    const r = check(...args);
    assert.ok(r.status === 0 || (r.status === 1 && r.stderr.includes("docs/cli.md:1 ")), `${args}: ${r.status} ${r.stderr}`);
    return r.status === 1;
  };
  fs.writeFileSync(page("cli.md"), leakyPage());
  git("add", "docs/cli.md");
  fs.writeFileSync(page("cli.md"), "clean\n");
  assert.equal(flagged(), false);
  assert.equal(flagged("--cached"), true);
  assert.equal(flagged("HEAD"), false);
  git("commit", "-q", "-m", "leak");
  assert.equal(flagged("HEAD"), true);
  assert.equal(flagged("HEAD~1"), false);
  assert.equal(check("--end-of-options").status, 2);
  assert.equal(check("no-such-rev").status, 2);
});

test("scrub drops key-shaped defaults and leaves salts and plain values", () => {
  fs.writeFileSync(page("cli.md"), leakyPage());
  scrub(page("cli.md"));
  assert.deepEqual(fs.readFileSync(page("cli.md"), "utf8").split("\n"), [
    "- `--l1-private-key <string>` - The private key to the eth account bridging",
    "    --bot.privateKey <value>($BOT_PRIVATE_KEY)",
    `    --bot.tokenSalt <value>     (default: ${salt})($BOT_TOKEN_SALT)`,
    `- \`--secret <string>\` - unset (default: "${zero}")`,
    `An example key in prose: ${key}`,
    "",
  ]);
  assert.equal(check().status, 0);
});
