// Fetches aztec-node's GitHub release notes for the docs release skills, without parsing them: the
// notes are prose whose shape is not a contract. A tag counts when it lies in (<from>, <to>] by
// SemVer, is a published release or a vX.Y.Z / vX.Y.Z-rc.N tag, and GitHub says <to> contains it.
//
//   node scripts/labs_release_notes.mts <from> <to> <outdir>
//
// <outdir> must be absent or empty. It gets each release body verbatim as <tag>.md, and index.tsv
// (also printed): tag, status (ok | empty | missing), prerelease, published_at, updated_at, bytes,
// in version order. Every gh call runs before the first write, so a failure leaves nothing behind.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPOSITORY } from "./aztec_node.mts";

// Also the guard on file names: a release's tag_name is the API's, and only these become paths.
const TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const RELEASE_SHAPED = /^v\d+\.\d+\.\d+(-rc\.\d+)?$/;

type Version = { tag: string; core: number[]; pre: string[] };
type Release = { tag_name: string; draft: boolean; prerelease: boolean; published_at: string | null; updated_at: string | null; body: string | null };

function parse(tag: string): Version | undefined {
  const m = TAG.exec(tag);
  return m ? { tag, core: [m[1], m[2], m[3]].map(Number), pre: m[4]?.split(".") ?? [] } : undefined;
}

/** SemVer 2.0 precedence (§11): a release sorts after its prereleases, `6.1.0-nightly.1` before `6.1.0-rc.1`. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return a.pre.length - b.pre.length;
}

const gh = (...args: string[]) =>
  execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 256 << 20 });
const lines = (s: string) => s.split("\n").filter(Boolean);

function main(argv: string[]): number {
  const [from, to] = argv.slice(0, 2).map((t) => parse(t));
  const outdir = argv[2];
  if (argv.length !== 3 || !from || !to || compareVersions(from, to) >= 0) {
    console.error("usage: node scripts/labs_release_notes.mts <from> <to> <outdir>   (vX.Y.Z[-pre] tags, from < to)");
    return 2;
  }
  if (fs.existsSync(outdir) && fs.readdirSync(outdir).length) {
    console.error(`labs_release_notes: ${outdir} is not empty`);
    return 1;
  }
  const repo = new URL(REPOSITORY).pathname.slice(1);
  const tags = lines(gh("--paginate", `repos/${repo}/tags?per_page=100`, "--jq", ".[].name"));
  if (!tags.includes(to.tag)) {
    console.error(`labs_release_notes: ${to.tag} is not a tag of ${repo}`);
    return 1;
  }
  const releases = new Map<string, Release>();
  for (const line of lines(gh("--paginate", `repos/${repo}/releases?per_page=100`, "--jq", ".[] | {tag_name,draft,prerelease,published_at,updated_at,body} | @json"))) {
    const r: Release = JSON.parse(line);
    if (typeof r.tag_name !== "string" || typeof r.draft !== "boolean" || !(r.body === null || typeof r.body === "string"))
      throw new Error(`unexpected release from the API: ${line.slice(0, 200)}`);
    if (!r.draft) releases.set(r.tag_name, r);
  }
  const contains = (v: Version) => {
    if (v.tag === to.tag) return true;
    const status = gh(`repos/${repo}/compare/${v.tag}...${to.tag}`, "--jq", ".status").trim();
    if (status === "ahead" || status === "identical") return true;
    // A tag on another branch (a hotfix, the other line) diverges; anything else is not an answer.
    if (status === "behind" || status === "diverged") return false;
    throw new Error(`compare ${v.tag}...${to.tag} returned status "${status}"`);
  };
  const candidates = new Set([...releases.keys(), ...tags.filter((t) => RELEASE_SHAPED.test(t)), to.tag]);
  const versions = [...candidates]
    .map((t) => parse(t))
    .filter((v): v is Version => !!v && compareVersions(from, v) < 0 && compareVersions(v, to) <= 0)
    .filter(contains)
    .sort(compareVersions);

  const rows = versions.map(({ tag }) => {
    const r = releases.get(tag);
    if (!r) return [tag, "missing", "-", "-", "-", "-"];
    const bytes = Buffer.byteLength(r.body ?? "");
    return [tag, bytes ? "ok" : "empty", String(r.prerelease), r.published_at ?? "-", r.updated_at ?? "-", String(bytes)];
  });
  fs.mkdirSync(outdir, { recursive: true });
  for (const [tag, status] of rows) if (status === "ok") fs.writeFileSync(path.join(outdir, `${tag}.md`), releases.get(tag)!.body!);
  const index = [["tag", "status", "prerelease", "published_at", "updated_at", "bytes"], ...rows].map((r) => r.join("\t")).join("\n") + "\n";
  fs.writeFileSync(path.join(outdir, "index.tsv"), index);
  process.stdout.write(index);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`labs_release_notes: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    process.exit(1);
  }
}
