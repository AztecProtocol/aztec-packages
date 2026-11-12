// Keeps each dev line's copies (docs/lines/<line>/) equal to main's, so a page edited in one copy only
// fails `check`. A line page is main's page with main's paths into the examples and l1-artifacts moved
// onto the line's own; everything else is byte-identical. A file that differs on purpose is listed, with
// the reason, in docs/lines/<line>/allowed-differences.txt.
//
//   node scripts/line_copies.mts [check]           list what differs; exit 1 on any
//   node scripts/line_copies.mts write [<path>...] copy main's files to the line
//
// `--line <line>` limits a command to one line. A <path> is relative to docs/ (or to the line) and may
// name a directory.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import line from "../src/preprocess/line.js";

export class LineCopyError extends Error {}

const PAGES = ["docs-developers", "docs-operate"];
// Only pages get the path moves; the rest is compared byte-exact (the examples' scripts name docs/examples
// literally in both lines).
const ROOTS = [...PAGES, "examples", "sidebars-developer.js", "sidebars-operate.js", "Nargo.toml"];

const isPage = (rel: string) => /\.mdx?$/.test(rel) && PAGES.some((root) => rel.startsWith(`${root}/`));

/** `text`, a main page, with its paths into the examples and l1-artifacts moved onto `lineName`'s copies. */
export const toLine = (text: string, lineName: string) =>
  text
    .replace(/(?<![\w.-])docs\/examples(?![\w.-])/g, `docs/lines/${lineName}/examples`)
    .replace(/(?<![\w.-])docs\/node_modules\/@aztec-foundation\/l1-artifacts(?![\w.-])/g, `docs/lines/${lineName}/.aztec-node/l1-artifacts`);

export type Finding = { path: string; kind: "differs" | "main only" | `${string} only` | "stale"; detail: string };

export const allowListFile = (docsDir: string, lineName: string) => path.join(docsDir, "lines", lineName, "allowed-differences.txt");

/** The allow-list: `<path>: <reason>` per line; `#` starts a comment line. */
function readAllowed(docsDir: string, lineName: string): Map<string, string> {
  const file = allowListFile(docsDir, lineName);
  const allowed = new Map<string, string>();
  if (!fs.existsSync(file)) return allowed;
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((row, i) => {
      if (!row.trim() || row.startsWith("#")) return;
      const m = /^(\S[^:]*): (\S.*)$/.exec(row);
      if (!m) throw new LineCopyError(`${path.relative(docsDir, file)}:${i + 1}: expected "<path>: <reason>"`);
      allowed.set(m[1], m[2]);
    });
  return allowed;
}

const gitFiles = (dir: string, ...flags: string[]) =>
  execFileSync("git", ["-C", dir, "ls-files", "-z", ...flags, "--", ...ROOTS], { encoding: "utf8" }).split("\0").filter(Boolean);

// Untracked files count, so a new page fails before it is staged; ignored build output does not.
const listFiles = (dir: string) => new Set(gitFiles(dir, "-co", "--exclude-standard").filter((rel) => fs.existsSync(path.join(dir, rel))));

type Pair = { main?: Buffer; copy?: Buffer };
type State = { allowed: Map<string, string>; main: Set<string>; copy: Set<string> };

function state(docsDir: string, lineName: string): State {
  if (!line.lineNames(path.dirname(docsDir)).includes(lineName)) throw new LineCopyError(`no line ${lineName} under docs/lines/`);
  return { allowed: readAllowed(docsDir, lineName), main: listFiles(docsDir), copy: listFiles(path.join(docsDir, "lines", lineName)) };
}

function pairOf(docsDir: string, lineName: string, s: State, rel: string): Pair {
  const main = s.main.has(rel) ? fs.readFileSync(path.join(docsDir, rel)) : undefined;
  return {
    main: main && isPage(rel) ? Buffer.from(toLine(main.toString("utf8"), lineName)) : main,
    copy: s.copy.has(rel) ? fs.readFileSync(path.join(docsDir, "lines", lineName, rel)) : undefined,
  };
}

const same = ({ main, copy }: Pair) => (main && copy ? main.equals(copy) : main === copy);

const clip = (s = "") => JSON.stringify(s.length > 100 ? `${s.slice(0, 100)}…` : s);

function firstDifference({ main, copy }: Pair, lineName: string): string {
  const a = String(main).split("\n"), b = String(copy).split("\n");
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `first at line ${i + 1}: main (with ${lineName}'s paths) ${clip(a[i])}, ${lineName} ${clip(b[i])}`;
}

/** What differs between main and `lineName`, beyond its allow-list, and allow-list entries that no longer differ. */
export function compare(docsDir: string, lineName: string): Finding[] {
  const s = state(docsDir, lineName);
  const findings: Finding[] = [];
  for (const rel of [...new Set([...s.main, ...s.copy, ...s.allowed.keys()])].sort()) {
    const pair = pairOf(docsDir, lineName, s, rel);
    if (s.allowed.has(rel)) {
      if (same(pair)) findings.push({ path: rel, kind: "stale", detail: `allowed, but the copies are ${pair.main === undefined ? "gone" : "equal"} now: remove it from the allow-list` });
    } else if (pair.copy === undefined) findings.push({ path: rel, kind: "main only", detail: `no copy in ${lineName}` });
    else if (pair.main === undefined) findings.push({ path: rel, kind: `${lineName} only`, detail: "no copy in main" });
    else if (!same(pair)) findings.push({ path: rel, kind: "differs", detail: firstDifference(pair, lineName) });
  }
  return findings;
}

// Paths come from the command line: each must name a compared file or directory inside the tree.
function selector(lineName: string, paths: string[]): (rel: string) => boolean {
  const prefixes = paths.map((p) => {
    const rel = path.posix.normalize(p.replace(/\\/g, "/")).replace(new RegExp(`^(docs/)?(lines/${lineName}/)?`), "").replace(/\/+$/, "");
    if (!ROOTS.some((root) => rel === root || rel.startsWith(`${root}/`)))
      throw new LineCopyError(`${p} is not under ${ROOTS.join(", ")} (relative to docs/)`);
    return rel;
  });
  return (rel) => prefixes.some((p) => rel === p || rel.startsWith(`${p}/`));
}

const pinCommit = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, "aztec-node.json"), "utf8")).commit;

// Why `write` may not replace or delete `dest`, or null. It only touches regular files whose content git
// holds, through directories that resolve inside the line, so it never loses unsaved work or escapes it.
function unsafe(docsDir: string, lineDir: string, rel: string, held: Set<string>): string | null {
  const dest = path.join(lineDir, rel);
  if (fs.lstatSync(path.join(docsDir, rel), { throwIfNoEntry: false })?.isSymbolicLink()) return "main's copy is a symlink";
  const stat = fs.lstatSync(dest, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) return "not a regular file";
  if (stat && !held.has(rel)) return "uncommitted changes or untracked: commit, stage or remove it first";
  let dir = path.dirname(dest);
  while (!fs.existsSync(dir)) dir = path.dirname(dir);
  if (!`${fs.realpathSync(dir)}${path.sep}`.startsWith(`${fs.realpathSync(lineDir)}${path.sep}`)) return "resolves outside the line";
  return null;
}

/**
 * Makes `lineName`'s copies of the selected files (all, by default) equal to main's: copies, rewrites
 * and deletes, leaving allowed differences alone. Changes nothing if any destination is unsafe to
 * replace. Returns one line per change.
 */
export function write(docsDir: string, lineName: string, paths: string[] = []): string[] {
  const s = state(docsDir, lineName);
  const lineDir = path.join(docsDir, "lines", lineName);
  for (const dir of [path.dirname(lineDir), lineDir])
    if (fs.lstatSync(dir).isSymbolicLink()) throw new LineCopyError(`${path.relative(docsDir, dir)} is a symlink`);
  if (!paths.length && pinCommit(docsDir) !== pinCommit(lineDir))
    throw new LineCopyError(`main and ${lineName} pin different commits, so a difference may be deliberate: name the paths to copy`);
  const selected = selector(lineName, paths.length ? paths : ROOTS);
  const modified = new Set(gitFiles(lineDir, "-m"));
  const held = new Set(gitFiles(lineDir, "-c").filter((rel) => !modified.has(rel)));
  const todo = [...new Set([...s.main, ...s.copy])]
    .sort()
    .filter((rel) => selected(rel) && !s.allowed.has(rel))
    .map((rel) => ({ rel, pair: pairOf(docsDir, lineName, s, rel) }))
    .filter(({ pair }) => !same(pair));
  const refused = todo.flatMap(({ rel }) => {
    const why = unsafe(docsDir, lineDir, rel, held);
    return why ? [`docs/lines/${lineName}/${rel}: ${why}`] : [];
  });
  if (refused.length) throw new LineCopyError(`nothing written:\n  ${refused.join("\n  ")}`);
  return todo.map(({ rel, pair }) => {
    const dest = path.join(lineDir, rel);
    if (pair.main === undefined) {
      fs.rmSync(dest);
      return `removed docs/lines/${lineName}/${rel}`;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(docsDir, rel), dest);
    if (isPage(rel)) fs.writeFileSync(dest, pair.main);
    return `copied ${rel} to docs/lines/${lineName}/${rel}`;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const usage = "usage: node scripts/line_copies.mts [check | write [<path>...]] [--line <line>]";
  const args = process.argv.slice(2);
  const docsDir = path.resolve(import.meta.dirname, "..");
  const at = args.indexOf("--line");
  const only = at < 0 ? undefined : args.splice(at, 2)[1];
  const cmd = args[0] === "check" || args[0] === "write" ? args.shift() : "check";
  if ((at >= 0 && !only) || args.some((a) => a.startsWith("-")) || (cmd === "check" && args.length)) {
    console.error(usage);
    process.exit(2);
  }
  try {
    let failed = false;
    for (const name of only ? [only] : line.lineNames(path.dirname(docsDir))) {
      if (cmd === "write") for (const change of write(docsDir, name, args)) console.log(`${name}: ${change}`);
      else
        for (const f of compare(docsDir, name)) {
          console.log(`${name}: ${f.path}: ${f.kind}: ${f.detail}`);
          failed = true;
        }
    }
    if (failed) {
      console.log("Copy main's file to the line with `write <path>`, or list a deliberate difference in docs/lines/<line>/allowed-differences.txt with its reason.");
      process.exit(1);
    }
  } catch (e) {
    if (!(e instanceof LineCopyError)) throw e;
    console.error(`line_copies: ${e.message}`);
    process.exit(1);
  }
}
