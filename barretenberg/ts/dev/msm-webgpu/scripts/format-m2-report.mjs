#!/usr/bin/env node
// Reads a JSON or JSONL bench-nt-sweep result file (from BrowserStack via
// `run-browserstack.mjs --page bench-nt-sweep --target macos`) and prints
// the markdown report (pickNTM table + speedup vs MsmV2 + crossover) to
// stdout. Pipe to a file and post via `cloxy-gist`.
//
// Usage:
//   node format-m2-report.mjs /tmp/nt-sweep-m2.jsonl > /tmp/nt-sweep-m2.md
//
// Accepts either:
//   - JSON: a single object with {rows, summary, crossover}.
//   - JSONL: one line per cell-emitted progress record; the script picks
//     the last `final`-state record (state==='done' or 'error').

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: format-m2-report.mjs <nt-sweep.{json,jsonl}>");
  process.exit(2);
}

const raw = readFileSync(path, "utf8").trim();
let result;
if (raw.startsWith("{")) {
  result = JSON.parse(raw);
} else {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    console.error("format-m2-report: empty input");
    process.exit(2);
  }
  let last = null;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const inner = obj.results ?? obj;
      if (inner?.state === "done" || inner?.state === "error") {
        last = inner;
      } else if (Array.isArray(inner?.rows)) {
        last = inner;
      }
    } catch {
      /* skip non-JSON lines */
    }
  }
  if (!last) {
    console.error(
      "format-m2-report: no parseable record with .rows in JSONL input",
    );
    process.exit(2);
  }
  result = last;
}

// Reuse the same formatter shipped to the in-browser sweep so the output
// shape matches what the dashboard renders.
const { renderM2Report } = await import("../results_format.js");
const md = renderM2Report(result);
process.stdout.write(md);
if (!md.endsWith("\n")) process.stdout.write("\n");
