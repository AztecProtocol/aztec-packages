#!/usr/bin/env node
// forge_broadcast.js — Run `forge script --broadcast` fast and reliably on anvil.
//
// anvil's automine mines each deploy transaction essentially instantly, which is what we want for
// speed. But a batched broadcast (forge's default sends many txs at once) can race the auto-miner:
// it mines a block on the first ready tx and may leave txs that arrived just after the trigger
// sitting in the pool, so forge waits forever for their receipts. We avoid the race without touching
// anvil's mining mode by broadcasting one tx at a time on anvil (`--batch-size 1`): with only a
// single tx in flight there is nothing for the auto-miner to strand. A hard timeout guards against
// a broadcast hanging indefinitely; real chains keep forge's faster default batch size.
//
// Usage: ./scripts/forge_broadcast.js <forge script args...>
//        (without --broadcast or --batch-size — added automatically)

import { spawn } from "node:child_process";
import { writeSync } from "node:fs";

const log = (msg) => process.stderr.write(`[forge_broadcast] ${msg}\n`);

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

const args = process.argv.slice(2);
const rpcUrl = extractArg(args, "--rpc-url");

// Detect anvil so we broadcast one tx at a time there (avoiding the automine batch race) while
// leaving real chains on forge's faster default batch size.
const isAnvil = rpcUrl
  ? await rpc(rpcUrl, "web3_clientVersion")
      .then((v) => v.toLowerCase().includes("anvil"))
      .catch(() => false)
  : false;

const batchSize = isAnvil ? "1" : "8";
const timeoutMs =
  Number(process.env.FORGE_BROADCAST_TIMEOUT_MS) ||
  (isAnvil ? 120_000 : 1_200_000);

const proc = spawn(
  "forge",
  ["script", ...args, "--broadcast", "--batch-size", batchSize],
  {
    stdio: ["ignore", "pipe", "inherit"],
  },
);

const stdout = [];
proc.stdout.on("data", (chunk) => stdout.push(chunk));

let timedOut = false;
const exitCode = await new Promise((resolve) => {
  const timeout = setTimeout(() => {
    timedOut = true;
    log(`Broadcast timed out after ${timeoutMs}ms; killing forge.`);
    proc.kill("SIGTERM");
    const sigkill = setTimeout(() => proc.kill("SIGKILL"), 5_000);
    sigkill.unref?.();
  }, timeoutMs);
  timeout.unref?.();
  proc.on("error", () => {
    clearTimeout(timeout);
    resolve(1);
  });
  proc.on("close", (code) => {
    clearTimeout(timeout);
    resolve(timedOut ? 1 : (code ?? 1));
  });
});

log(
  exitCode === 0
    ? "Broadcast succeeded."
    : `Broadcast failed (exit ${exitCode}).`,
);
const data = Buffer.concat(stdout);
if (data.length > 0) writeSync(1, data);
process.exit(exitCode);
