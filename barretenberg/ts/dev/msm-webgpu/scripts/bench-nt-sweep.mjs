#!/usr/bin/env node
// Headless Playwright driver for `bench-nt-sweep.html` — the local
// exhaustive (logN, NUM_THREAD_MULS) sweep against the TrivialMsm WebGPU
// kernel stack. Loads the page, tails its `__bench` global until `state`
// reaches `done` (or `error`), then prints the final pickNTM
// recommendation + MsmV2 speedup table as JSON.
//
// Failure modes:
//   - no first /progress within 180s → exit 1 (stall)
//   - any cell records a verify mismatch (when --verify=1) → still ends
//     `done`; the JSON line surfaces the per-cell `err` field
//   - page-level FATAL → exit 1
//
// CLI:
//   node dev/msm-webgpu/scripts/bench-nt-sweep.mjs \
//       --url http://localhost:5173 \
//       --minlogn 4 --maxlogn 16 \
//       --ntmlist 1,2,3,4,6,8,12,16,24,32 \
//       --reps 15 --warmup 3 \
//       [--verify 1] [--headed]
//
//   Prints a JSON object to stdout: { params, rows, summary, crossover }.
import { chromium } from "playwright-core";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));
const baseUrl = argv.url ?? "http://localhost:5173";
const headed = !!argv.headed;
const qp = new URLSearchParams();
if (argv.minlogn) qp.set("minlogn", String(argv.minlogn));
if (argv.maxlogn) qp.set("maxlogn", String(argv.maxlogn));
if (argv.ntmlist) qp.set("ntmlist", String(argv.ntmlist));
if (argv.reps) qp.set("reps", String(argv.reps));
if (argv.warmup) qp.set("warmup", String(argv.warmup));
if (argv.verify) qp.set("verify", String(argv.verify));
qp.set("coi", "1");
const target = `${baseUrl}/dev/msm-webgpu/bench-nt-sweep.html?${qp.toString()}`;

const browser = await chromium.launch({
  channel: "chrome",
  headless: !headed,
  args: [
    "--enable-unsafe-webgpu",
    "--enable-features=WebGPU",
    "--disable-http2",
  ],
});
const page = await browser.newPage();
page.on("console", (m) => console.log(`  · ${m.text()}`));
page.on("pageerror", (e) => console.log(`  ! pageerror: ${e.message}`));

console.log(`navigating: ${target}`);
let runnerErr = null;
const STALL_MS = 180_000;
try {
  await page.goto(target, { waitUntil: "load", timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const b = window.__bench;
      return b && (b.state === "done" || b.state === "error");
    },
    { timeout: 60 * 60 * 1000, polling: 1000 },
  );

  let lastLen = 0;
  let lastChange = Date.now();
  while (true) {
    const state = await page.evaluate(() => window.__bench?.state);
    if (state === "done" || state === "error") break;
    const len = await page.evaluate(
      () =>
        (window.__bench?.rows ?? []).reduce(
          (acc, r) => acc + (r.cells?.length ?? 0),
          0,
        ),
    );
    if (len !== lastLen) {
      lastLen = len;
      lastChange = Date.now();
    } else if (Date.now() - lastChange > STALL_MS) {
      runnerErr = `stall: no new cell in ${STALL_MS / 1000}s (lastLen=${lastLen})`;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
} catch (e) {
  runnerErr = e.message;
}

const result = await page.evaluate(() => {
  const b = window.__bench;
  if (!b) return null;
  const rows = (b.rows ?? []).map((r) => ({
    logN: r.logN,
    bestNtm: r.bestNtm,
    msmV2Median: r.msmV2Median,
    msmV2Err: r.msmV2Err,
    cells: r.cells.map((c) => ({
      ntm: c.ntm,
      min: c.min,
      median: c.median,
      err: c.err,
      verifyOk: c.verifyOk,
    })),
  }));
  const summary = rows
    .filter((r) => r.bestNtm !== null)
    .reduce((acc, r) => {
      acc[r.logN] = r.bestNtm;
      return acc;
    }, {});
  let crossover = null;
  for (const r of rows) {
    if (r.msmV2Median === null) continue;
    const bestT = r.cells
      .filter((c) => !c.err)
      .reduce((m, c) => Math.min(m, c.median), Infinity);
    if (r.msmV2Median <= bestT) {
      crossover = r.logN;
      break;
    }
  }
  return { state: b.state, error: b.error, rows, summary, crossover };
});

await browser.close();

if (runnerErr) console.error(`runner: ${runnerErr}`);
if (!result) {
  console.error("no __bench state on page");
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ...result, params: argv }, null, 2));
process.stdout.write("\n");
process.exit(result.state === "done" && !runnerErr ? 0 : 1);
