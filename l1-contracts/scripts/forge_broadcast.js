#!/usr/bin/env node
// forge_broadcast.js — Run `forge script --broadcast` fast and reliably on anvil.
//
// anvil's automine mines a deploy's transactions essentially instantly, which is what we want for
// speed. But its auto-miner can race a batched broadcast: it mines a block on the first ready tx
// and may leave txs that arrived just after the trigger sitting in the pool, so forge waits forever
// for their receipts. To get both speed and reliability we keep automine ON and run a lightweight
// watchdog: every few ms we check the txpool and, if anything is still pending, `evm_mine` to flush
// it. In the common case automine has already mined everything and the watchdog is a no-op; in the
// racy case it drains the stragglers within a few ms.
//
// Only activates when anvil is in automine mode.
//
// Usage: ./scripts/forge_broadcast.js <forge script args...>
//        (without --broadcast or --batch-size — added automatically)

import { spawn } from "node:child_process";
import { writeSync } from "node:fs";

const log = (msg) => process.stderr.write(`[forge_broadcast] ${msg}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const toNumber = (v) => (typeof v === "number" ? v : Number(BigInt(v)));

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function extractArg(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i < args.length - 1 ? args[i + 1] : undefined;
}

// Keep automine on; poll the pool every `intervalMs` and mine any pending txs the auto-miner left
// behind. Returns a stop function that halts polling and drains anything still pending.
function startRaceWatchdog(rpcUrl, intervalMs = 25) {
  let stopped = false;
  let busy = false;
  const mineIfPending = async () => {
    const status = await rpc(rpcUrl, "txpool_status");
    if (toNumber(status.pending ?? 0) > 0) {
      await rpc(rpcUrl, "evm_mine");
      return true;
    }
    return false;
  };
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await mineIfPending();
    } catch (err) {
      log(`watchdog error: ${err.message}`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (busy) await sleep(2);
    for (let i = 0; i < 1000; i++) {
      try {
        if (!(await mineIfPending())) break;
      } catch (err) {
        log(`final drain error: ${err.message}`);
        break;
      }
    }
  };
}

const args = process.argv.slice(2);
const rpcUrl = extractArg(args, "--rpc-url");

const [isAnvil, isAutomine] = rpcUrl
  ? await Promise.all([
      rpc(rpcUrl, "web3_clientVersion").then((v) => v.toLowerCase().includes("anvil")).catch(() => false),
      rpc(rpcUrl, "anvil_getAutomine").catch(() => false),
    ])
  : [false, false];

// Keep automine ON for speed; the watchdog only catches what the auto-miner races on.
const stopWatchdog = isAnvil && isAutomine ? startRaceWatchdog(rpcUrl) : undefined;

const proc = spawn("forge", ["script", ...args, "--broadcast", "--batch-size", "8"], {
  stdio: ["ignore", "pipe", "inherit"],
});

const stdout = [];
proc.stdout.on("data", (chunk) => stdout.push(chunk));

const exitCode = await new Promise((resolve) => {
  proc.on("error", () => resolve(1));
  proc.on("close", (code) => resolve(code ?? 1));
});

try {
  await stopWatchdog?.();
} catch {}

log(exitCode === 0 ? "Broadcast succeeded." : `Broadcast failed (exit ${exitCode}).`);
const data = Buffer.concat(stdout);
if (data.length > 0) writeSync(1, data);
process.exit(exitCode);
