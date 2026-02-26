#!/usr/bin/env node
// forge_broadcast.js — Run `forge script --broadcast` safely on anvil.
//
// Bug: anvil's auto-miner races with batched transactions. When a batch is sent,
// anvil mines a block for the first tx but the rest arrive after the auto-mine
// trigger fired, leaving them stranded or dropped. Temporarily switching to 1s
// interval mining for the duration of the broadcast avoids both variants.
//
// Only activates when anvil is in automine mode.
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

const [isAnvil, isAutomine] = rpcUrl
  ? await Promise.all([
      rpc(rpcUrl, "web3_clientVersion").then((v) => v.toLowerCase().includes("anvil")).catch(() => false),
      rpc(rpcUrl, "anvil_getAutomine").catch(() => false),
    ])
  : [false, false];

if (isAnvil && isAutomine) {
  await rpc(rpcUrl, "evm_setAutomine", [false]);
  await rpc(rpcUrl, "evm_setIntervalMining", [1]);
}

const proc = spawn("forge", ["script", ...args, "--broadcast", "--batch-size", "8"], {
  stdio: ["ignore", "pipe", "inherit"],
});

const stdout = [];
proc.stdout.on("data", (chunk) => stdout.push(chunk));

const exitCode = await new Promise((resolve) => {
  proc.on("error", () => resolve(1));
  proc.on("close", (code) => resolve(code ?? 1));
});

if (isAnvil && isAutomine) {
  try {
    await rpc(rpcUrl, "evm_setIntervalMining", [0]);
    await rpc(rpcUrl, "evm_setAutomine", [true]);
  } catch {}
}

log(exitCode === 0 ? "Broadcast succeeded." : `Broadcast failed (exit ${exitCode}).`);
const data = Buffer.concat(stdout);
if (data.length > 0) writeSync(1, data);
process.exit(exitCode);
