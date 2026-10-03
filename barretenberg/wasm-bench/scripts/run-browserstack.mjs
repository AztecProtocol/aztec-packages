#!/usr/bin/env node
// Drive a BrowserStack JS Testing worker against a wasm-bench tunnel, tail the
// progress JSONL, and fail fast on stall / deadline / no-first-progress.
//
// Requires BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY in the environment
// (the agent shell does NOT have these — drive via the BrowserStack MCP tools
// from a claudebox session, or run this script from a host that has them).
//
// On success, prints a `==== headline ====` block with proveTotalMs (or, for
// paired A/B runs, per-variant medians and Δ summary).

import { stat, watch } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { Command } from 'commander';

import {
  createBenchOptions,
  createBrowserStackWorkerBody,
  getTarget,
  loadConfig,
  proveTotalMs,
  withBenchParam,
} from './lib.mjs';

const BS_API = 'https://api.browserstack.com/5';

function basicAuth(user, key) {
  return `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}`;
}

async function bsCall(path, { method = 'GET', body, user, key }) {
  const init = {
    method,
    headers: {
      Authorization: basicAuth(user, key),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  };
  if (body) init.body = JSON.stringify(body);
  const response = await fetch(`${BS_API}${path}`, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`BrowserStack ${method} ${path} → ${response.status}: ${text.slice(0, 500)}`);
  }
  return response.json();
}

async function readProgressTail(path, fromOffset) {
  try {
    const info = await stat(path);
    if (info.size <= fromOffset) return { rows: [], nextOffset: fromOffset };
    const buffer = Buffer.alloc(info.size - fromOffset);
    const { open } = await import('node:fs/promises');
    const fh = await open(path, 'r');
    try {
      await fh.read(buffer, 0, buffer.byteLength, fromOffset);
    } finally {
      await fh.close();
    }
    const rows = [];
    for (const line of buffer.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    return { rows, nextOffset: info.size };
  } catch {
    return { rows: [], nextOffset: fromOffset };
  }
}

async function deleteWorker(workerId, user, key) {
  if (!workerId) return;
  try {
    await bsCall(`/worker/${workerId}`, { method: 'DELETE', user, key });
  } catch (error) {
    console.error(`worker teardown failed: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(argv) {
  const program = new Command();
  program
    .requiredOption('--url <url>', 'Public origin where wasm-bench is served (e.g. Cloudflare Quick Tunnel)')
    .option('--target <name>', 'Hardware-target preset', 'macos')
    .option('--flow <name>', 'Chonk flow name')
    .option('--runs <count>', 'Runs per variant (single-variant mode)', value => Number.parseInt(value, 10))
    .option('--pairs <count>', 'Number of paired A/B pairs (A/B mode)', value => Number.parseInt(value, 10))
    .option('--variants <list>', 'Comma-separated variants (A/B mode), default "a,b"', 'a,b')
    .option('--warmup-pairs <count>', 'Warmup pairs to drop in A/B analysis', value => Number.parseInt(value, 10), 1)
    .option('--threads <n|auto>', 'Threads per worker')
    .option('--mem-max-pages <n>', 'WebAssembly.Memory max pages', value => Number.parseInt(value, 10))
    .option('--trace <bool>', 'Capture Perfetto trace')
    .option('--progress-jsonl <path>', 'Progress JSONL path tailed by the watchdog', '/tmp/wasm-bench-progress.jsonl')
    .option('--first-progress-ms <ms>', 'Max wait for first /progress event', value => Number.parseInt(value, 10))
    .option('--stall-ms <ms>', 'Max gap between /progress events once started', value => Number.parseInt(value, 10), 180000)
    .option('--deadline-ms <ms>', 'Total wall-clock deadline', value => Number.parseInt(value, 10), 1800000)
    .parse(argv);

  const options = program.opts();
  const user = process.env.BROWSERSTACK_USERNAME;
  const key = process.env.BROWSERSTACK_ACCESS_KEY;
  if (!user || !key) {
    throw new Error('BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY not set in environment');
  }

  const config = loadConfig();
  const target = getTarget(config, options.target);
  const firstProgressMs = options.firstProgressMs ?? target.firstProgressMs ?? 60000;

  // Build the bench options. A/B mode if --pairs is set.
  const variantList = options.variants.split(',').map(s => s.trim()).filter(Boolean);
  let benchOptions;
  if (options.pairs && options.pairs > 0) {
    benchOptions = {
      benchmark: 'chonk-ab',
      flow: options.flow ?? config.defaultFlow,
      threads: options.threads ?? config.defaultThreads,
      pairs: options.pairs,
      warmupPairs: options.warmupPairs ?? 1,
      variants: variantList,
      wasmBaseUrls: Object.fromEntries(variantList.map(v => [v, `/wasm/${v}`])),
      ...(options.memMaxPages ? { memMaxPages: options.memMaxPages } : {}),
      ...(target.benchOverrides ?? {}),
    };
  } else {
    benchOptions = createBenchOptions(config, options.target, {
      flow: options.flow,
      runs: options.runs,
      threads: options.threads,
      memMaxPages: options.memMaxPages,
    });
    if (options.trace !== undefined) {
      benchOptions.trace = options.trace === 'true' || options.trace === true;
    }
  }

  const benchUrl = withBenchParam(options.url, benchOptions);
  const workerBody = createBrowserStackWorkerBody(options.target, target, benchUrl, {
    timeout: Math.max(1800, Math.floor(options.deadlineMs / 1000)),
  });
  if (!workerBody) {
    throw new Error(`Target "${options.target}" has no browserstackWorker config`);
  }

  console.log(`bench url: ${benchUrl}`);
  console.log(`spawning BrowserStack worker (target=${options.target}, mode=${benchOptions.benchmark})`);
  const startWall = Date.now();
  const createResp = await bsCall('/worker', { method: 'POST', body: workerBody, user, key });
  const workerId = createResp.id;
  console.log(`worker id=${workerId} browser_url=${createResp.browser_url ?? 'pending'}`);

  let progressOffset = 0;
  let firstProgressSeen = false;
  let lastProgressAt = Date.now();
  let lastSummary = null;
  let abFinalRow = null;

  const cleanup = async () => {
    try { await deleteWorker(workerId, user, key); } catch {}
  };
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

  try {
    while (true) {
      const elapsed = Date.now() - startWall;
      if (elapsed > options.deadlineMs) {
        throw new Error(`deadline exceeded after ${(elapsed / 1000).toFixed(1)}s (no completion)`);
      }
      const { rows, nextOffset } = await readProgressTail(options.progressJsonl, progressOffset);
      progressOffset = nextOffset;
      if (rows.length > 0) {
        if (!firstProgressSeen) {
          firstProgressSeen = true;
          console.log(`first /progress at +${((Date.now() - startWall) / 1000).toFixed(1)}s`);
        }
        lastProgressAt = Date.now();
        for (const row of rows) {
          if (row.type === 'pair_run') {
            console.log(`pair=${row.pair} variant=${row.variant} pos=${row.position} proveTotalMs=${Math.round(row.proveTotalMs ?? 0)} setupMs=${Math.round(row.setupMs ?? 0)} proveMs=${Math.round(row.proveMs ?? 0)}`);
          } else if (row.type === 'run_complete') {
            lastSummary = row;
            console.log(`run_complete proveTotalMs=${Math.round(proveTotalMs(row.data ?? row))}`);
          } else if (row.event === 'ab_complete') {
            abFinalRow = row;
          } else if (row.type === 'error' || row.type === 'ab_error') {
            throw new Error(`browser-side error: ${row.error?.message ?? JSON.stringify(row.error)}`);
          }
        }
      }
      if (!firstProgressSeen && elapsed > firstProgressMs) {
        throw new Error(`no /progress within ${firstProgressMs}ms — BrowserStack page likely never loaded`);
      }
      if (firstProgressSeen) {
        const stalled = Date.now() - lastProgressAt;
        if (stalled > options.stallMs) {
          throw new Error(`progress stalled for ${(stalled / 1000).toFixed(1)}s (>${options.stallMs}ms)`);
        }
      }
      // Poll worker status — if it's offline (BS terminated session), bail out.
      try {
        const status = await bsCall(`/worker/${workerId}/status`, { user, key });
        if (status.status === 'offline' || status.status === 'terminated') {
          console.log(`worker reached terminal status=${status.status}`);
          break;
        }
      } catch (error) {
        console.error(`status poll error: ${error.message}`);
      }
      if (abFinalRow) {
        console.log(`ab_complete row seen — finishing`);
        break;
      }
      await sleep(3000);
    }

    console.log('==== headline ====');
    if (benchOptions.benchmark === 'chonk-ab') {
      console.log(`A/B run: pairs=${benchOptions.pairs} variants=${variantList.join(',')} flow=${benchOptions.flow}`);
      console.log('Run analyze-ab to compute medians, CI, and significance:');
      console.log(`  node scripts/analyze-ab.mjs --result <result-jsonl> --warmup ${benchOptions.warmupPairs ?? 1}`);
    } else if (lastSummary) {
      const data = lastSummary.data ?? lastSummary;
      console.log(`proveTotalMs=${Math.round(proveTotalMs(data))} setupMs=${Math.round(data.setupMs ?? 0)} proveMs=${Math.round(data.proveMs ?? 0)} flow=${benchOptions.flow}`);
    } else {
      console.log('no completion summary captured');
    }
  } finally {
    await cleanup();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
