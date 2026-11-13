// Writes the bash script that types a tutorial page's commands and files the way its spec in
// page_tests.mts says, from the page as the site renders it; page_transcript_test.sh runs it.
//
// Usage: page_transcript.mts script <page> <out>   <page> relative to the repository root
//        page_transcript.mts merge-toml <file>      the block on stdin (the script calls this)
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { type Bound, blocks, TRANSCRIPTS, walk } from "./page_tests.mts";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../..");

/** The page's spec key and the docs root (main's or a line's) whose examples it copies from. A release snapshot's page reads main's. */
export function locate(page: string): { root: string; key: string } {
  const snapshot = page.match(/^docs\/developer_versioned_docs\/version-[^/]+\/(docs\/.+)$/);
  if (snapshot) return { root: "docs", key: `docs-developers/${snapshot[1]}` };
  const root = page.match(/^docs\/lines\/v\d+(?=\/)/)?.[0] ?? "docs";
  return { root, key: page.slice(root.length + 1) };
}

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** The script: one shell, so a `cd` holds across blocks. It ends by writing $TRANSCRIPT_DONE, which a run that stops early never reaches. */
export function script(page: string, bound: Bound[], examples: string): string {
  const out = ["set -euo pipefail", "STEP=start", `trap '[ $? -eq 0 ] || echo "transcript failed at $STEP" >&2' EXIT`];
  let n = 0;
  const heredoc = (head: string, body: string[]) => {
    const end = `TRANSCRIPT_EOF_${++n}`;
    if (body.includes(end)) throw new Error(`${page}: a block holds the line ${end}`);
    out.push(`${head} <<'${end}'`, ...body, end);
  };
  const dir = (to: string) => out.push(`mkdir -p -- "$(dirname -- ${quote(to)})"`);
  for (const { step, block } of bound) {
    const at = `${page}:${block?.line ?? "copy"}`;
    if ("run" in step) out.push(`STEP=${quote(`${at}: ${step.run}`)}`, ...block!.body);
    else if ("write" in step) {
      out.push(`STEP=${quote(`${at}: write ${step.to}`)}`);
      dir(step.to);
      heredoc(`cat > ${quote(step.to)}`, block!.body);
    } else if ("merge" in step) {
      out.push(`STEP=${quote(`${at}: merge into ${step.into}`)}`);
      heredoc(`node ${quote(import.meta.filename)} merge-toml ${quote(step.into)}`, block!.body);
    } else {
      out.push(`STEP=${quote(`${at}: ${step.copy} to ${step.to}`)}`);
      dir(step.to);
      out.push(`cp -- ${quote(path.join(examples, step.copy))} ${quote(step.to)}`);
    }
  }
  out.push('printf done > "$TRANSCRIPT_DONE"');
  return `${out.join("\n")}\n`;
}

const KEY = /^\s*([\w-]+|"[^"]*")\s*=/;
const TABLE = /^\s*\[([^[\]]+)\]\s*(#.*)?$/;
const isContent = (row: string) => row.trim() !== "" && !row.trim().startsWith("#");

const bare = (row: string) => row.replace(/\s+/g, "");

// Each `table\0key` the rows define, with its row without whitespace, and the index after each table's
// last content row ("" is the rows before the first header).
function tables(rows: string[]) {
  const keys = new Map<string, string>();
  const end = new Map<string, number>([["", 0]]);
  let table = "";
  rows.forEach((row, i) => {
    const header = row.match(TABLE)?.[1].trim();
    if (header !== undefined) table = header;
    else if (KEY.test(row)) keys.set(`${table}\0${row.match(KEY)![1]}`, bare(row));
    if (isContent(row)) end.set(table, i + 1);
  });
  return { keys, end };
}

// The block's rows whose key the file lacks, by table. A key the file has must have the block's value:
// the page shows the reader's file, and a merge that kept another value would not test what it shows.
function missing(block: string, have: Map<string, string>): Map<string, string[]> {
  const add = new Map<string, string[]>();
  let table = "";
  for (const row of block.split("\n").filter(isContent)) {
    const header = row.match(TABLE)?.[1].trim();
    if (header !== undefined) table = header;
    else if (!KEY.test(row)) throw new Error(`merge reads one-line keys and [tables] only: ${row}`);
    else {
      const value = have.get(`${table}\0${row.match(KEY)![1]}`);
      if (value === undefined) add.set(table, [...(add.get(table) ?? []), row]);
      else if (value !== bare(row)) throw new Error(`merge: the file sets this key in [${table}] to another value: ${row}`);
    }
  }
  return add;
}

/** Adds each key of `block` that its table in `text` lacks, at the end of that table, as a reader adds a dependency under the existing ones. */
export function mergeToml(text: string, block: string): string {
  const rows = text.split("\n");
  const { keys, end } = tables(rows);
  const add = [...missing(block, keys)].sort(([a], [b]) => (end.get(b) ?? -1) - (end.get(a) ?? -1));
  for (const [table, lines] of add) {
    const at = end.get(table);
    if (at === undefined) rows.push(`[${table}]`, ...lines);
    else rows.splice(at, 0, ...lines);
  }
  return rows.join("\n");
}

async function writeScript(page: string, out: string) {
  const { root, key } = locate(page);
  const spec = TRANSCRIPTS[key];
  if (!spec || !("steps" in spec)) throw new Error(`${page}: page_tests.mts has no steps for ${key}`);
  const { preprocessIncludeVersion } = require("../src/preprocess/include_version.js") as {
    preprocessIncludeVersion(content: string, file: string, root: string): Promise<{ content: string }>;
  };
  const file = path.join(repoRoot, page);
  const { content } = await preprocessIncludeVersion(fs.readFileSync(file, "utf8"), file, repoRoot);
  const { bound, errors } = walk(blocks(content), spec.steps);
  for (const { block } of bound) {
    const macro = block?.body.join("\n").match(/#[a-z_]{4,}/)?.[0];
    if (macro) errors.push(`${block!.line}: unresolved macro ${macro}`);
  }
  if (errors.length) throw new Error(errors.map((e) => `${page}:${e}`).join("\n"));
  fs.writeFileSync(out, script(page, bound, path.join(repoRoot, root, "examples")));
}

if (import.meta.main) {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "script" && a && b) await writeScript(a, b);
  else if (mode === "merge-toml" && a) fs.writeFileSync(a, mergeToml(fs.readFileSync(a, "utf8"), fs.readFileSync(0, "utf8")));
  else {
    console.error("usage: page_transcript.mts script <page> <out> | merge-toml <file>");
    process.exit(2);
  }
}
