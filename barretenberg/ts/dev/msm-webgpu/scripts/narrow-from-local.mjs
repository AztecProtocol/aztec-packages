#!/usr/bin/env node
// Reads the JSON written by `bench-nt-sweep.mjs` (the local exhaustive
// sweep) and emits a comma-separated narrowed `ntmlist` for the
// BrowserStack M2 confirmation run.
//
// Narrowing rule: union of {bestNtm - step, bestNtm, bestNtm + step} for
// each logN row (with step = 1 in the default set neighbour topology),
// projected back onto the entries that exist in the default
// `[1,2,3,4,6,8,12,16,24,32]` set. This keeps the BS run under the 1800s
// session watchdog while preserving the ability to confirm the local
// minimum survives M2.
//
// Usage:
//   node narrow-from-local.mjs /tmp/nt-sweep-local.json
// stdout: e.g. `1,2,4,6,8,16,24`

import { readFileSync } from "node:fs";

const DEFAULT_LIST = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

function neighbours(k) {
  const idx = DEFAULT_LIST.indexOf(k);
  if (idx === -1) return [k];
  const out = new Set([k]);
  if (idx - 1 >= 0) out.add(DEFAULT_LIST[idx - 1]);
  if (idx + 1 < DEFAULT_LIST.length) out.add(DEFAULT_LIST[idx + 1]);
  return [...out];
}

const path = process.argv[2];
if (!path) {
  console.error("usage: narrow-from-local.mjs <nt-sweep-local.json>");
  process.exit(2);
}
const json = JSON.parse(readFileSync(path, "utf8"));
const rows = json.rows ?? [];
const union = new Set();
for (const r of rows) {
  if (r.bestNtm == null) continue;
  for (const n of neighbours(r.bestNtm)) union.add(n);
}
const narrowed = [...union]
  .filter((n) => DEFAULT_LIST.includes(n))
  .sort((a, b) => a - b);
if (narrowed.length === 0) {
  console.error("narrow-from-local: no bestNtm in input — emitting default list");
  process.stdout.write(DEFAULT_LIST.join(","));
  process.stdout.write("\n");
  process.exit(0);
}
process.stdout.write(narrowed.join(","));
process.stdout.write("\n");
