// The aztec-node code the docs quote, pinned in docs/aztec-node.json: snippets, reference checks and
// generators read a checkout of the pinned commit, never the labs/ submodule, so the foundation's
// labs gitlink can move without touching the docs.
//
//   node scripts/aztec_node.mts fetch            check out the pinned commit (no network when current)
//   node scripts/aztec_node.mts check            fail on any drift between the pin, the checkout and docs
//   node scripts/aztec_node.mts pin <tag>        move the pin to an aztec-node release or nightly tag
//   node scripts/aztec_node.mts provision <nargo|bb|cli>...   install the pinned published toolchain
//   node scripts/aztec_node.mts env              print the pin as shell exports, for eval
//
// .mts because docs/package.json declares no module type: a .ts file with ESM syntax makes every run
// print MODULE_TYPELESS_PACKAGE_JSON.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY = "https://github.com/aztec-labs-eng/aztec-node";
const NPM_REGISTRY = "https://registry.npmjs.org";
const NOIR_RELEASES = "https://github.com/noir-lang/noir/releases/download";
const TOOLCHAIN_FILE = "labs-aztec-toolchain/bootstrap.sh";
const L1_ARTIFACTS = "@aztec-foundation/l1-artifacts";

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const TAG = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const COMMIT = /^[0-9a-f]{40}$/;

export type Pin = {
  repository: string;
  ref: string;
  commit: string;
  toolchain: { aztec: string; bb: string; noir: string; l1Artifacts: string };
};

export type Options = {
  docsDir: string;
  // Only tests point this elsewhere; the CLI always requires the canonical repository.
  repository?: string;
};

export class PinError extends Error {}

const docsDirOf = (o: Options) => path.resolve(o.docsDir);
export const pinFile = (o: Options) => path.join(docsDirOf(o), "aztec-node.json");
export const stateDir = (o: Options) => path.join(docsDirOf(o), ".aztec-node");
// Readers run from different directories, so a relative override would name different trees.
export function treeDir(o: Options): string {
  const dir = process.env.AZTEC_NODE_DIR;
  if (!dir) return path.join(stateDir(o), "tree");
  if (!path.isAbsolute(dir)) throw new PinError(`AZTEC_NODE_DIR must be an absolute path, not ${dir}`);
  return dir;
}
const binDir = (o: Options) => path.join(stateDir(o), "bin");
const cliDir = (o: Options) => path.join(stateDir(o), "cli");
// The CLIs the docs run and document, published at the pin's aztec version.
const CLI_PACKAGES = ["@aztec-labs/aztec", "@aztec-labs/cli-wallet"];
const cliManifest = (o: Options, pkg: string) => path.join(cliDir(o), "node_modules", pkg, "package.json");

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(cwd: string, args: string[]): string | undefined {
  try {
    return git(cwd, args);
  } catch {
    return undefined;
  }
}

/** Throws a PinError naming every malformed field; the fields reach git as arguments. */
export function validatePin(pin: unknown, o: Options): Pin {
  const p = pin as Partial<Pin> | undefined;
  const problems: string[] = [];
  const repository = o.repository ?? REPOSITORY;
  if (p?.repository !== repository) problems.push(`repository must be ${repository}`);
  if (typeof p?.ref !== "string" || !TAG.test(p.ref)) problems.push("ref must be a tag like v6.0.0 or v6.1.0-nightly.20261029");
  if (typeof p?.commit !== "string" || !COMMIT.test(p.commit)) problems.push("commit must be 40 lowercase hex characters");
  for (const key of ["aztec", "bb", "noir", "l1Artifacts"] as const) {
    const v = p?.toolchain?.[key];
    if (typeof v !== "string" || !VERSION.test(v)) problems.push(`toolchain.${key} must be a version like 6.0.0-rc.7`);
  }
  if (problems.length) throw new PinError(`${pinFile(o)} is malformed:\n  ${problems.join("\n  ")}`);
  return p as Pin;
}

export function readPin(o: Options): Pin {
  return validatePin(JSON.parse(fs.readFileSync(pinFile(o), "utf8")), o);
}

/** The commit a tag names on the remote (the peeled commit for an annotated tag). */
export function remoteTagCommit(repository: string, tag: string): string {
  if (!TAG.test(tag)) throw new PinError(`not a release or nightly tag: ${tag}`);
  const out = withRetries(() =>
    execFileSync("git", ["ls-remote", "--tags", "--end-of-options", repository, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const refs = new Map(out.trim().split("\n").filter(Boolean).map((l) => l.split("\t").reverse() as [string, string]));
  const commit = refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
  if (!commit) throw new PinError(`${repository} has no tag ${tag}`);
  return commit;
}

function headOf(tree: string): string | undefined {
  return tryGit(tree, ["rev-parse", "--verify", "-q", "--end-of-options", "HEAD^{commit}"]);
}

/** Network git calls get three tries: a transient GitHub error would otherwise fail fast CI. */
function withRetries<T>(call: () => T): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return call();
    } catch (e) {
      if (attempt === 3) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * attempt);
    }
  }
}

const SPARSE = ["/*", "!/docs/"];

/**
 * Checks the pinned commit out into the tree directory: a shallow clone whose sparse rule leaves out
 * aztec-node's own docs/, which the docs never read. A checkout already at the commit is restored if
 * edited, without any network access.
 */
export function fetchTree(o: Options, pin: Pin, log: (s: string) => void = () => {}): void {
  const tree = treeDir(o);
  // Everything below force-checks out and cleans the tree, so it only ever touches a directory this
  // tool created: new or empty, or a repository with its sparse rule.
  const notOurs = `${tree} is a directory this tool did not create: point AZTEC_NODE_DIR at a new one`;
  if (!fs.existsSync(path.join(tree, ".git"))) {
    if (fs.existsSync(tree) && fs.readdirSync(tree).length) throw new PinError(notOurs);
    fs.mkdirSync(tree, { recursive: true });
    git(tree, ["init", "-q"]);
    git(tree, ["sparse-checkout", "set", "--no-cone", ...SPARSE]);
  } else if (tryGit(tree, ["sparse-checkout", "list"]) !== SPARSE.join("\n")) {
    throw new PinError(notOurs);
  }
  // A current checkout is only read: parallel test commands fetch it at once, and a write takes a git lock.
  const origin = tryGit(tree, ["remote", "get-url", "origin"]);
  if (origin === undefined) git(tree, ["remote", "add", "origin", pin.repository]);
  else if (origin !== pin.repository) git(tree, ["remote", "set-url", "origin", pin.repository]);

  if (headOf(tree) !== pin.commit) {
    const tagged = remoteTagCommit(pin.repository, pin.ref);
    if (tagged !== pin.commit) throw new PinError(`${pin.ref} names ${tagged} on ${pin.repository}, but the pin says ${pin.commit}`);
    log(`fetching ${pin.ref} (${pin.commit.slice(0, 10)})`);
    withRetries(() => git(tree, ["fetch", "-q", "--depth", "1", "--no-tags", "origin", "--end-of-options", pin.commit]));
    git(tree, ["checkout", "-q", "--force", "--detach", pin.commit, "--"]);
    git(tree, ["clean", "-fdq"]);
  } else if (git(tree, ["--no-optional-locks", "status", "--porcelain"]) !== "") {
    log(`restoring edited files in ${tree}`);
    git(tree, ["checkout", "-q", "--force", "--detach", pin.commit, "--"]);
    git(tree, ["clean", "-fdq"]);
  }
}

/** Reads `NAME=value` assignments from aztec-node's toolchain script. */
function toolchainVersions(tree: string): { bb?: string; noir?: string } {
  const text = fs.readFileSync(path.join(tree, TOOLCHAIN_FILE), "utf8");
  const read = (name: string) => text.match(new RegExp(`^${name}=([^\\s#]+)`, "m"))?.[1];
  return { bb: read("BB_VERSION"), noir: read("NOIR_VERSION") };
}

/** Every disagreement between the pin, its checkout and the docs, each with its fix; empty when consistent. */
export function problems(o: Options, pin: Pin): string[] {
  const tree = treeDir(o);
  const fetchFix = "run `node scripts/aztec_node.mts fetch` in docs/";
  const head = fs.existsSync(path.join(tree, ".git")) ? headOf(tree) : undefined;
  if (head !== pin.commit) return [`${tree} is at ${head ?? "nothing"}, not the pinned ${pin.commit}: ${fetchFix}`];
  if (git(tree, ["--no-optional-locks", "status", "--porcelain"]) !== "") return [`${tree} has edited or untracked files: ${fetchFix}`];

  const out: string[] = [];
  const { bb, noir } = toolchainVersions(tree);
  if (bb !== pin.toolchain.bb) out.push(`toolchain.bb is ${pin.toolchain.bb}, but ${pin.ref} pins BB_VERSION=${bb}: set it to ${bb}`);
  if (noir !== pin.toolchain.noir) out.push(`toolchain.noir is ${pin.toolchain.noir}, but ${pin.ref} pins NOIR_VERSION=${noir}: set it to ${noir}`);
  if (pin.toolchain.aztec !== pin.ref.slice(1)) out.push(`toolchain.aztec must be ${pin.ref.slice(1)}, the version ${pin.ref} publishes`);
  if (pin.toolchain.l1Artifacts !== pin.toolchain.bb) out.push(`toolchain.l1Artifacts must equal toolchain.bb (${pin.toolchain.bb}): aztec-node pins both to BB_VERSION`);
  const pkg = JSON.parse(fs.readFileSync(path.join(docsDirOf(o), "package.json"), "utf8"));
  const installed = pkg.devDependencies?.[L1_ARTIFACTS] ?? pkg.dependencies?.[L1_ARTIFACTS];
  if (installed !== pin.toolchain.l1Artifacts)
    out.push(`docs/package.json pins ${L1_ARTIFACTS} ${installed}: set it to ${pin.toolchain.l1Artifacts} and run yarn install`);
  return out;
}

/** Moves the pin to <tag>, taking the toolchain versions from the tag's own toolchain script. */
export function pinTag(o: Options, tag: string, log: (s: string) => void = () => {}): Pin {
  const repository = o.repository ?? REPOSITORY;
  const commit = remoteTagCommit(repository, tag);
  const draft = { repository, ref: tag, commit, toolchain: { aztec: tag.slice(1), bb: "0.0.0", noir: "0.0.0", l1Artifacts: "0.0.0" } };
  fetchTree(o, validatePin(draft, o), log);
  const { bb, noir } = toolchainVersions(treeDir(o));
  const pin = validatePin({ ...draft, toolchain: { aztec: tag.slice(1), bb, noir, l1Artifacts: bb } }, o);
  fs.writeFileSync(pinFile(o), `${JSON.stringify(pin, null, 2)}\n`);
  return pin;
}

/** True when `integrity` (an npm `sha512-<base64>` string) matches the bytes. */
export function integrityMatches(bytes: Uint8Array, integrity: string): boolean {
  const [algorithm, expected] = integrity.split("-", 2);
  if (algorithm !== "sha512" || !expected) return false;
  return createHash("sha512").update(bytes).digest("base64") === expected;
}

/** The npm platform tag and rust target triple of this machine, as the release artifacts name them. */
export function platform(p: string = process.platform, arch: string = process.arch): { npm: string; rust: string } {
  const os = { linux: ["linux", "unknown-linux-gnu"], darwin: ["darwin", "apple-darwin"] }[p];
  const cpu = { x64: ["x64", "x86_64"], arm64: ["arm64", "aarch64"] }[arch];
  if (!os || !cpu) throw new PinError(`no published nargo or bb for ${p}/${arch}`);
  return { npm: `${os[0]}-${cpu[0]}`, rust: `${cpu[1]}-${os[1]}` };
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new PinError(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const versionOf = (binary: string) => execFileSync(binary, ["--version"], { encoding: "utf8" });
const reportsVersion = { nargo: (out: string, v: string) => out.split("\n").includes(`nargo version = ${v}`), bb: (out: string, v: string) => out.trim() === v };

function cliIsAt(o: Options, version: string): boolean {
  return CLI_PACKAGES.every((pkg) => {
    try {
      return JSON.parse(fs.readFileSync(cliManifest(o, pkg), "utf8")).version === version;
    } catch {
      return false;
    }
  });
}

/** Installs the CLIs at the pinned version into .aztec-node/cli, under docs' yarn settings (age gate, preapproved scopes). */
function provisionCli(o: Options, pin: Pin, log: (s: string) => void): void {
  const version = pin.toolchain.aztec;
  if (cliIsAt(o, version)) return;
  const dir = cliDir(o);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { packageManager } = JSON.parse(fs.readFileSync(path.join(docsDirOf(o), "package.json"), "utf8"));
  const dependencies = Object.fromEntries(CLI_PACKAGES.map((pkg) => [pkg, version]));
  const manifest = { name: "aztec-node-cli", private: true, packageManager, dependencies };
  fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // An empty lockfile makes the directory its own project; without one, yarn takes it for an unlisted docs workspace.
  fs.writeFileSync(path.join(dir, "yarn.lock"), "");
  log(`installing ${CLI_PACKAGES.join(", ")} ${version}`);
  try {
    execFileSync("yarn", ["install"], { cwd: dir, stdio: ["ignore", 2, 2], env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: "false" } });
  } catch (e) {
    // A failed native build can leave both manifests in place, which the next run would take for an install.
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  if (!cliIsAt(o, version)) throw new PinError(`${dir} does not hold ${CLI_PACKAGES.join(" and ")} at ${version}`);
}

/** Installs each tool at the pinned version into .aztec-node/bin (or cli/), skipping those already there. */
export async function provision(o: Options, pin: Pin, tools: string[], log: (s: string) => void = () => {}): Promise<void> {
  const bin = binDir(o);
  fs.mkdirSync(bin, { recursive: true });
  for (const tool of tools) {
    if (tool === "cli") {
      provisionCli(o, pin, log);
      continue;
    }
    if (tool !== "nargo" && tool !== "bb") throw new PinError(`cannot provision ${tool}: only nargo, bb and cli`);
    const version = tool === "nargo" ? pin.toolchain.noir : pin.toolchain.bb;
    const binary = path.join(bin, tool);
    if (fs.existsSync(binary) && reportsVersion[tool](versionOf(binary), version)) continue;

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aztec-node-provision-"));
    try {
      const archive = path.join(tmp, "archive.tgz");
      if (tool === "bb") {
        const name = `@aztec-foundation/bb-${platform().npm}`;
        const meta = JSON.parse(new TextDecoder().decode(await download(`${NPM_REGISTRY}/${name}/${version}`)));
        log(`installing bb ${version} from ${name}`);
        const bytes = await download(meta.dist.tarball);
        if (!integrityMatches(bytes, meta.dist.integrity)) throw new PinError(`${meta.dist.tarball} does not match its registry integrity`);
        fs.writeFileSync(archive, bytes);
        execFileSync("tar", ["-xzf", archive, "-C", tmp, "package/bin/bb"]);
        fs.copyFileSync(path.join(tmp, "package/bin/bb"), binary);
      } else {
        // noir publishes no checksum for its release archives; HTTPS is the only check.
        const url = `${NOIR_RELEASES}/v${version}/noir-${platform().rust}.tar.gz`;
        log(`installing nargo ${version} from ${url}`);
        fs.writeFileSync(archive, await download(url));
        execFileSync("tar", ["-xzf", archive, "-C", tmp]);
        fs.copyFileSync(path.join(tmp, "nargo"), binary);
      }
      fs.chmodSync(binary, 0o755);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    const reported = versionOf(binary);
    if (!reportsVersion[tool](reported, version)) throw new PinError(`${binary} reports ${reported.trim()}, not ${version}`);
  }
}

const shellQuote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** The pin as shell exports; NARGO, BB and AZTEC (the CLI) only once provisioned at the pinned version. */
export function envLines(o: Options, pin: Pin): string[] {
  const vars: [string, string][] = [
    ["AZTEC_NODE_DIR", path.resolve(treeDir(o))],
    ["AZTEC_NODE_REF", pin.ref],
    ["AZTEC_NODE_COMMIT", pin.commit],
    ["AZTEC_VERSION", pin.toolchain.aztec],
    ["BB_VERSION", pin.toolchain.bb],
    ["NOIR_VERSION", pin.toolchain.noir],
    ["L1_ARTIFACTS_VERSION", pin.toolchain.l1Artifacts],
  ];
  for (const [name, tool, version] of [["NARGO", "nargo", pin.toolchain.noir], ["BB", "bb", pin.toolchain.bb]] as const) {
    const binary = path.join(binDir(o), tool);
    if (fs.existsSync(binary) && reportsVersion[tool](versionOf(binary), version)) vars.push([name, binary]);
  }
  if (cliIsAt(o, pin.toolchain.aztec)) vars.push(["AZTEC", path.join(cliDir(o), "node_modules/.bin/aztec")]);
  return vars.map(([k, v]) => `export ${k}=${shellQuote(v)}`);
}

async function main(argv: string[]): Promise<number> {
  const o: Options = { docsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "..") };
  const log = (s: string) => console.error(s);
  const [cmd, ...args] = argv;
  const report = (pin: Pin) => {
    const found = problems(o, pin);
    for (const p of found) console.error(`aztec-node pin: ${p}`);
    return found.length ? 1 : 0;
  };
  switch (cmd) {
    case "fetch": {
      const pin = readPin(o);
      fetchTree(o, pin, log);
      return report(pin);
    }
    case "check":
      return report(readPin(o));
    case "pin": {
      if (args.length !== 1) break;
      const pin = pinTag(o, args[0], log);
      log(`pinned ${pin.ref} (${pin.commit}): aztec ${pin.toolchain.aztec}, bb ${pin.toolchain.bb}, noir ${pin.toolchain.noir}`);
      return report(pin);
    }
    case "provision": {
      if (!args.length) break;
      await provision(o, readPin(o), args, log);
      return 0;
    }
    case "env": {
      const pin = readPin(o);
      if (report(pin)) return 1;
      console.log(envLines(o, pin).join("\n"));
      return 0;
    }
  }
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(4, 9).map((l) => l.slice(3)).join("\n"));
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof PinError ? `aztec-node pin: ${e.message}` : e);
      process.exit(1);
    },
  );
}
