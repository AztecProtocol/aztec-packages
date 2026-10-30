import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  type Options,
  type Pin,
  PinError,
  envLines,
  fetchTree,
  integrityMatches,
  noirArchiveUrl,
  pinFile,
  pinTag,
  platform,
  problems,
  provision,
  readPin,
  treeDir,
  validatePin,
  verifyNoirAttestation,
} from "../aztec_node.mts";

// A local stand-in for noir's releases: an archive per version and triple, served over HTTP, and a fake
// gh that attests the digests in `attested` and fails unless it is given the whole signer policy.
const TARGETS = ["x86_64-unknown-linux-gnu", "x86_64-apple-darwin", "aarch64-unknown-linux-gnu", "aarch64-apple-darwin"];
const CI_TARGET = "x86_64-unknown-linux-gnu";
const archivePath = (version: string, target: string) => `/v${version}/noir-${target}.tar.gz`;
const digestOf = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const archives = new Map<string, Uint8Array>();
let noirDir: string;
let server: http.Server;
let releases: string;
let routes: Map<string, Uint8Array | number>;
let attested: Map<string, { name?: string; digest?: string; raw?: string }>;

const FAKE_GH = `
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const args = process.argv.slice(2);
const policy = [["--repo", "noir-lang/noir"], ["--signer-workflow", "noir-lang/noir/.github/workflows/publish-nargo.yml"],
  ["--source-ref", "refs/heads/master"], ["--format", "json"]];
if (args[0] !== "attestation" || args[1] !== "verify" || !args.includes("--deny-self-hosted-runners") ||
    policy.some(([flag, value]) => args[args.indexOf(flag) + 1] !== value)) {
  console.error("fake gh: the signer policy is incomplete: " + args.join(" "));
  process.exit(2);
}
const hex = createHash("sha256").update(fs.readFileSync(args[2])).digest("hex");
const entry = JSON.parse(fs.readFileSync(process.env.FAKE_GH_ATTESTED, "utf8"))[hex];
if (!entry) {
  console.error("Error: no attestations found for sha256:" + hex);
  process.exit(1);
}
if (entry.raw !== undefined) process.stdout.write(entry.raw);
else console.log(JSON.stringify([{ verificationResult: { statement: { subject: [{ name: entry.name, digest: { sha256: entry.digest ?? hex } }] } } }]));
`;

before(async () => {
  noirDir = fs.mkdtempSync(path.join(os.tmpdir(), "aztec-node-noir-"));
  for (const version of ["0.9.0", "0.9.1"])
    for (const target of TARGETS) {
      const dir = path.join(noirDir, version, target);
      write(path.join(dir, "nargo"), `#!/bin/sh\n# ${target}\necho "nargo version = ${version}"\n`);
      fs.chmodSync(path.join(dir, "nargo"), 0o755);
      execFileSync("tar", ["-czf", `${dir}.tar.gz`, "-C", dir, "nargo"]);
      archives.set(archivePath(version, target), fs.readFileSync(`${dir}.tar.gz`));
    }
  write(path.join(noirDir, "bin/gh"), `#!${process.execPath}\n${FAKE_GH}`);
  fs.chmodSync(path.join(noirDir, "bin/gh"), 0o755);
  server = http.createServer((req, res) => {
    const body = routes.get(req.url ?? "");
    if (body instanceof Uint8Array) res.writeHead(200).end(body);
    else res.writeHead(body ?? 404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  releases = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(noirDir, { recursive: true, force: true });
});

function saveAttested() {
  fs.writeFileSync(path.join(f.root, "attested.json"), JSON.stringify(Object.fromEntries(attested)));
}

/** Puts the fake gh first on PATH until the test ends. */
function usingGh() {
  process.env.PATH = `${path.join(noirDir, "bin")}${path.delimiter}${process.env.PATH}`;
  process.env.FAKE_GH_ATTESTED = path.join(f.root, "attested.json");
  saveAttested();
}

const archivesOf = (version: string) =>
  Object.fromEntries(TARGETS.map((t) => [t, digestOf(archives.get(archivePath(version, t)) as Uint8Array)]));

// A local stand-in for aztec-node: commit A tagged v1.0.0 (annotated), commit B tagged
// v1.1.0-nightly.20260101 (lightweight), and a docs/ directory whose package.json pins l1-artifacts.
type Fixture = { root: string; o: Options; remote: string; a: string; b: string; pinA: Pin; pinB: Pin };

const quiet = ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t"];
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...quiet, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function makeFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aztec-node-test-"));
  const repo = path.join(root, "remote");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  write(path.join(repo, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.0.0-rc.1\n# comment\nNOIR_VERSION=0.9.0 # trailing\n");
  write(path.join(repo, "noir-projects/lib.nr"), "fn main() {}\n");
  write(path.join(repo, "docs/upstream.md"), "upstream docs\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "A");
  const a = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "-a", "-m", "release", "v1.0.0");
  write(path.join(repo, "labs-aztec-toolchain/bootstrap.sh"), "BB_VERSION=1.1.0\nNOIR_VERSION=0.9.1\n");
  git(repo, "commit", "-q", "-am", "B");
  const b = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "v1.1.0-nightly.20260101");

  const docsDir = path.join(root, "docs");
  write(path.join(docsDir, "package.json"), JSON.stringify({ devDependencies: { "@aztec-foundation/l1-artifacts": "1.0.0-rc.1" } }));
  const remote = pathToFileURL(repo).href;
  const pinA: Pin = {
    repository: remote,
    ref: "v1.0.0",
    commit: a,
    toolchain: { aztec: "1.0.0", bb: "1.0.0-rc.1", noir: "0.9.0", l1Artifacts: "1.0.0-rc.1" },
    noirArchives: archivesOf("0.9.0"),
  };
  const pinB: Pin = {
    repository: remote,
    ref: "v1.1.0-nightly.20260101",
    commit: b,
    toolchain: { aztec: "1.1.0-nightly.20260101", bb: "1.1.0", noir: "0.9.1", l1Artifacts: "1.1.0" },
    noirArchives: archivesOf("0.9.1"),
  };
  return { root, o: { docsDir, repository: remote, noirReleases: releases }, remote, a, b, pinA, pinB };
}

let f: Fixture;
let savedPath: string | undefined;
beforeEach(() => {
  delete process.env.AZTEC_NODE_DIR;
  savedPath = process.env.PATH;
  f = makeFixture();
  routes = new Map(archives);
  attested = new Map([...archives].map(([route, bytes]) => [digestOf(bytes).slice("sha256:".length), { name: path.basename(route) }]));
});
afterEach(() => {
  process.env.PATH = savedPath;
  fs.rmSync(f.root, { recursive: true, force: true });
});

const head = (o: Options) => git(treeDir(o), "rev-parse", "HEAD");

test("fetch checks out the pinned commit without aztec-node's own docs/", () => {
  fetchTree(f.o, f.pinA);
  assert.equal(head(f.o), f.a);
  assert.ok(fs.existsSync(path.join(treeDir(f.o), "noir-projects/lib.nr")));
  assert.ok(!fs.existsSync(path.join(treeDir(f.o), "docs")));
  assert.deepEqual(problems(f.o, f.pinA), []);
});

test("a checkout at the pinned commit is reused without touching the remote or taking a lock", () => {
  fetchTree(f.o, f.pinA);
  const saved = process.env.GIT_ALLOW_PROTOCOL;
  process.env.GIT_ALLOW_PROTOCOL = "https"; // a fetch from the file:// remote would now fail
  // Parallel test commands fetch the same current checkout; a write would contend for these locks.
  const locks = ["config.lock", "index.lock"].map((l) => path.join(treeDir(f.o), ".git", l));
  for (const lock of locks) fs.writeFileSync(lock, "");
  try {
    fetchTree(f.o, f.pinA);
    assert.deepEqual(problems(f.o, f.pinA), []);
  } finally {
    for (const lock of locks) fs.rmSync(lock);
    if (saved === undefined) delete process.env.GIT_ALLOW_PROTOCOL;
    else process.env.GIT_ALLOW_PROTOCOL = saved;
  }
  assert.equal(head(f.o), f.a);
});

test("a failed CLI install leaves nothing a later provision would trust", async () => {
  // A yarn that writes both manifests and then fails, as a failed native build would.
  const bin = path.join(f.root, "bin");
  write(
    path.join(bin, "yarn"),
    "#!/bin/sh\nfor p in aztec cli-wallet; do mkdir -p node_modules/@aztec-labs/$p; echo '{\"version\":\"1.0.0\"}' > node_modules/@aztec-labs/$p/package.json; done\nexit 1\n",
  );
  fs.chmodSync(path.join(bin, "yarn"), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    await assert.rejects(provision(f.o, f.pinA, ["cli"]));
  } finally {
    process.env.PATH = saved;
  }
  assert.ok(!envLines(f.o, f.pinA).some((l) => l.startsWith("export AZTEC=")));
});

test("a moved pin fetches the new commit", () => {
  fetchTree(f.o, f.pinA);
  fetchTree(f.o, f.pinB);
  assert.equal(head(f.o), f.b);
});

test("a tag that names a different commit than the pin is refused", () => {
  assert.throws(() => fetchTree(f.o, { ...f.pinA, commit: f.b }), (e) => e instanceof PinError && /names .* but the pin says/.test(e.message));
});

test("edited or untracked files fail check, and fetch restores the commit", () => {
  fetchTree(f.o, f.pinA);
  const lib = path.join(treeDir(f.o), "noir-projects/lib.nr");
  fs.writeFileSync(lib, "fn main() { edited }\n");
  assert.match(problems(f.o, f.pinA).join(), /edited or untracked/);
  fetchTree(f.o, f.pinA);
  assert.equal(fs.readFileSync(lib, "utf8"), "fn main() {}\n");

  const extra = path.join(treeDir(f.o), "noir-projects/extra.nr");
  fs.writeFileSync(extra, "fn planted() {}\n");
  assert.match(problems(f.o, f.pinA).join(), /edited or untracked/);
  fetchTree(f.o, f.pinA);
  assert.ok(!fs.existsSync(extra));
  assert.deepEqual(problems(f.o, f.pinA), []);
});

test("check names toolchain and package.json drift with the fix", () => {
  fetchTree(f.o, f.pinA);
  const drift = problems(f.o, { ...f.pinA, toolchain: { aztec: "1.0.1", bb: "1.0.0-rc.2", noir: "0.8.0", l1Artifacts: "1.0.0-rc.1" } });
  assert.match(drift.join("\n"), /BB_VERSION=1\.0\.0-rc\.1: set it to 1\.0\.0-rc\.1/);
  assert.match(drift.join("\n"), /NOIR_VERSION=0\.9\.0: set it to 0\.9\.0/);
  assert.match(drift.join("\n"), /toolchain\.aztec must be 1\.0\.0/);
  assert.match(drift.join("\n"), /l1Artifacts must equal toolchain\.bb/);

  write(path.join(f.o.docsDir, "package.json"), JSON.stringify({ devDependencies: { "@aztec-foundation/l1-artifacts": "0.1.0" } }));
  assert.match(problems(f.o, f.pinA).join(), /pins @aztec-foundation\/l1-artifacts 0\.1\.0: set it to 1\.0\.0-rc\.1/);
});

test("check fails on a missing or foreign checkout", () => {
  assert.match(problems(f.o, f.pinA).join(), /not the pinned/);
  fetchTree(f.o, f.pinB);
  assert.match(problems(f.o, f.pinA).join(), new RegExp(`at ${f.b}, not the pinned ${f.a}`));
});

test("fetch refuses a directory it did not create, and AZTEC_NODE_DIR must be absolute", () => {
  const work = path.join(f.root, "work");
  write(path.join(work, "notes.txt"), "mine\n");
  const clone = path.join(f.root, "clone");
  fs.mkdirSync(clone);
  git(clone, "init", "-q");
  write(path.join(clone, "untracked.txt"), "mine\n");
  for (const dir of [work, clone]) {
    process.env.AZTEC_NODE_DIR = dir;
    assert.throws(() => fetchTree(f.o, f.pinA), (e) => e instanceof PinError && /did not create/.test(e.message), dir);
  }
  assert.ok(fs.existsSync(path.join(work, "notes.txt")) && !fs.existsSync(path.join(work, ".git")));
  assert.ok(fs.existsSync(path.join(clone, "untracked.txt")));
  assert.equal(git(clone, "remote"), "");

  process.env.AZTEC_NODE_DIR = "relative/tree";
  assert.throws(() => treeDir(f.o), (e) => e instanceof PinError && /absolute/.test(e.message));
  process.env.AZTEC_NODE_DIR = "";
  assert.equal(treeDir(f.o), path.join(f.o.docsDir, ".aztec-node", "tree"));
});

test("malformed pin fields are refused before they reach git", () => {
  const bad: [string, Partial<Pin>][] = [
    ["repository", { repository: "https://example.com/other" }],
    ["ref", { ref: "--upload-pack=x" }],
    ["ref", { ref: "main" }],
    ["commit", { commit: "abc123" }],
    ["commit", { commit: f.a.toUpperCase() }],
    ["toolchain.bb", { toolchain: { ...f.pinA.toolchain, bb: "-x" } }],
    ["noirArchives", { noirArchives: undefined }],
    [`noirArchives must record ${CI_TARGET}`, { noirArchives: {} }],
    ["noirArchives.x86_64-pc-windows-msvc", { noirArchives: { ...f.pinA.noirArchives, "x86_64-pc-windows-msvc": f.pinA.noirArchives[CI_TARGET] } }],
    [`noirArchives.${CI_TARGET}`, { noirArchives: { [CI_TARGET]: f.pinA.noirArchives[CI_TARGET].toUpperCase() } }],
  ];
  for (const [field, change] of bad)
    assert.throws(() => validatePin({ ...f.pinA, ...change }, f.o), (e) => e instanceof PinError && e.message.includes(field), field);
  assert.throws(() => validatePin(f.pinA, { docsDir: f.o.docsDir }), /repository must be https:\/\/github\.com\/aztec-labs-eng\/aztec-node/);
});

test("pin writes the tag's commit, toolchain and attested noir archives, peeling annotated tags", async () => {
  usingGh();
  const nightly = await pinTag(f.o, "v1.1.0-nightly.20260101");
  assert.deepEqual(nightly, f.pinB);
  assert.deepEqual(readPin(f.o), f.pinB);
  assert.match(problems(f.o, nightly).join(), /set it to 1\.1\.0 and run yarn install/);

  const release = await pinTag(f.o, "v1.0.0");
  assert.equal(release.commit, f.a);
  assert.deepEqual(problems(f.o, release), []);
  assert.equal(fs.readFileSync(pinFile(f.o), "utf8"), `${JSON.stringify(f.pinA, null, 2)}\n`);
  await assert.rejects(pinTag(f.o, "v9.9.9"), /has no tag v9\.9\.9/);

  routes.delete(archivePath("0.9.0", "aarch64-apple-darwin"));
  const { "aarch64-apple-darwin": _, ...published } = f.pinA.noirArchives;
  assert.deepEqual((await pinTag(f.o, "v1.0.0")).noirArchives, published);
});

test("pin refuses a noir archive it cannot verify and keeps the previous pin", async () => {
  usingGh();
  await pinTag(f.o, "v1.0.0");
  const previous = fs.readFileSync(pinFile(f.o), "utf8");
  const darwin = archivePath("0.9.1", "x86_64-apple-darwin");
  const hex = digestOf(archives.get(darwin) as Uint8Array).slice("sha256:".length);
  const cases: [string, () => void, RegExp][] = [
    ["an unattested archive", () => attested.delete(hex), /could not verify noir-x86_64-apple-darwin\.tar\.gz[^]*no attestations found/],
    ["another platform's subject", () => attested.set(hex, { name: "noir-aarch64-apple-darwin.tar.gz" }), /none names noir-x86_64-apple-darwin/],
    ["another digest", () => attested.set(hex, { name: path.basename(darwin), digest: "0".repeat(64) }), /none names noir-x86_64-apple-darwin/],
    ["output that is not JSON", () => attested.set(hex, { raw: "verified!" }), /no JSON/],
    ["HTTP 500 on an optional platform", () => routes.set(darwin, 500), /HTTP 500/],
    ["HTTP 404 on the CI platform", () => routes.delete(archivePath("0.9.1", CI_TARGET)), /HTTP 404/],
  ];
  for (const [name, breakIt, error] of cases) {
    routes = new Map(archives);
    attested.set(hex, { name: path.basename(darwin) });
    breakIt();
    saveAttested();
    await assert.rejects(pinTag(f.o, "v1.1.0-nightly.20260101"), (e) => e instanceof PinError && error.test(e.message), name);
    assert.equal(fs.readFileSync(pinFile(f.o), "utf8"), previous, name);
  }
});

test("provision installs nargo only from an archive whose sha256 the pin records", async () => {
  const target = platform().rust;
  const route = archivePath("0.9.0", target);
  const nargo = path.join(f.o.docsDir, ".aztec-node/bin/nargo");
  // Not a gzip: only a digest check before tar runs can report the digest.
  routes.set(route, new TextEncoder().encode("tampered"));
  await assert.rejects(provision(f.o, f.pinA, ["nargo"]), (e) => e instanceof PinError && /has sha256:[0-9a-f]{64}, not/.test(e.message));
  assert.ok(!fs.existsSync(nargo));

  routes.set(route, archives.get(route) as Uint8Array);
  await provision(f.o, f.pinA, ["nargo"]);
  assert.equal(execFileSync(nargo, ["--version"], { encoding: "utf8" }).trim(), "nargo version = 0.9.0");

  // A platform without a recorded digest fails even where a pinned nargo is already installed.
  const { [target]: _, ...others } = f.pinA.noirArchives;
  await assert.rejects(provision(f.o, { ...f.pinA, noirArchives: others }, ["nargo"]), (e) => e instanceof PinError && e.message.includes(`no sha256 for ${target}`));
});

test(
  "the committed pin's CI digest is noir's attested release archive",
  { skip: process.env.NOIR_ATTESTATION_LIVE ? false : "set NOIR_ATTESTATION_LIVE=1 (downloads the archive, needs gh logged in)" },
  async () => {
    const o = { docsDir: path.resolve(import.meta.dirname, "../..") };
    const pin = readPin(o);
    const bytes = new Uint8Array(await (await fetch(noirArchiveUrl(o, pin.toolchain.noir, CI_TARGET))).arrayBuffer());
    assert.equal(digestOf(bytes), pin.noirArchives[CI_TARGET]);
    const file = path.join(f.root, `noir-${CI_TARGET}.tar.gz`);
    fs.writeFileSync(file, bytes);
    verifyNoirAttestation(file, pin.noirArchives[CI_TARGET]);
  },
);

test("env quotes every value for the shell and omits unprovisioned binaries", async () => {
  const o = { ...f.o, docsDir: path.join(f.root, "it's docs") };
  fs.cpSync(f.o.docsDir, o.docsDir, { recursive: true });
  fetchTree(o, f.pinA);
  const lines = envLines(o, f.pinA);
  assert.ok(!lines.some((l) => /^export (NARGO|BB)=/.test(l)));
  const out = execFileSync("bash", ["-c", `${lines.join("\n")}\nprintf '%s|%s' "$AZTEC_NODE_DIR" "$AZTEC_NODE_REF"`], { encoding: "utf8" });
  assert.equal(out, `${path.join(o.docsDir, ".aztec-node/tree")}|v1.0.0`);

  // A nargo whose version only starts with the pinned one is not the pinned nargo.
  const nargo = path.join(o.docsDir, ".aztec-node/bin/nargo");
  fs.mkdirSync(path.dirname(nargo), { recursive: true });
  for (const [reported, exported] of [["0.9.00", false], ["0.9.0", true]] as const) {
    fs.writeFileSync(nargo, `#!/bin/sh\necho "nargo version = ${reported}"\n`, { mode: 0o755 });
    assert.equal(envLines(o, f.pinA).some((l) => l.startsWith("export NARGO=")), exported, reported);
  }

  // The CLIs count only when both are at the pinned version, and current ones are kept without a reinstall.
  const manifest = (pkg: string) => path.join(o.docsDir, ".aztec-node/cli/node_modules/@aztec-labs", pkg, "package.json");
  const cliAt = (aztec: string, wallet: string) => {
    for (const [pkg, version] of [["aztec", aztec], ["cli-wallet", wallet]]) write(manifest(pkg), JSON.stringify({ version }));
    return envLines(o, f.pinA).some((l) => l.startsWith("export AZTEC="));
  };
  assert.equal(cliAt("1.0.1", "1.0.0"), false);
  assert.equal(cliAt("1.0.0", "1.0.1"), false);
  assert.equal(cliAt("1.0.0", "1.0.0"), true);
  await provision(o, f.pinA, ["cli"]);
  assert.ok(fs.existsSync(manifest("aztec")));
});

test("registry integrity and platform names", () => {
  const bytes = new TextEncoder().encode("tarball");
  const sri = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  assert.ok(integrityMatches(bytes, sri));
  assert.ok(!integrityMatches(new TextEncoder().encode("tampered"), sri));
  assert.ok(!integrityMatches(bytes, sri.replace("sha512", "sha1")));
  assert.deepEqual(platform("linux", "x64"), { npm: "linux-x64", rust: "x86_64-unknown-linux-gnu" });
  assert.deepEqual(platform("darwin", "arm64"), { npm: "darwin-arm64", rust: "aarch64-apple-darwin" });
  assert.throws(() => platform("win32", "x64"), PinError);
});
