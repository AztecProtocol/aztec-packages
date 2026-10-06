#!/usr/bin/env node
// forge_broadcast.js — Run `forge script --broadcast` fast and reliably on anvil.
//
// anvil's automine mines each deploy transaction essentially instantly, which is what we want for
// speed. But a batched broadcast (forge's default sends many txs at once) can race the auto-miner:
// it mines a block on the first ready tx and may leave txs that arrived just after the trigger
// sitting in the pool, so forge waits forever for their receipts. We avoid the race without touching
// anvil's mining mode by broadcasting one tx at a time (`--slow`) only when anvil has automine ON:
// with a single tx in flight there is nothing for the auto-miner to strand.
//
// When anvil is in interval (or no) mining mode the race does not exist — the miner drains the whole
// pool on each block — and serializing to one tx per block would stall the deploy for a full block
// interval per transaction, blowing past the broadcast timeout. There (and on real chains) we keep
// forge's default batched sending. A hard timeout guards against a broadcast hanging indefinitely.
//
// A deploy that queues INITIAL_VALIDATORS does not activate them itself: once the deploy broadcast
// has landed, this script runs FlushEntryQueue.s.sol against the deployed Rollup as a second,
// `--skip-simulation` broadcast. `Rollup.flushEntryQueue` requires a fixed amount of gas to be
// *left* before every deposit (StakingLib.getFlushDepositGasFloor, about 1.1M at the default
// proof-of-possession cap). forge's on-chain simulation sizes each transaction at the gas it
// *used* times a multiplier, which is too little for a flush of a few entries, and it cannot be
// overridden per transaction. With the simulation skipped forge takes each limit from
// eth_estimateGas, which searches for the smallest limit at which the call succeeds and so includes
// the floor. Skipping the simulation also makes forge send one transaction per block, so it is
// confined to the one or two flush transactions; the deploy itself keeps forge's batched,
// simulated broadcast. On anvil, an empty block is mined after the flush so the flush is never in
// the head block that callers estimate gas against (see the comment at the evm_mine call).
//
// Usage: ./scripts/forge_broadcast.js <forge script args...>
//        (without --broadcast or --slow — added automatically)

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

// INITIAL_VALIDATORS is the JSON array the deploy script reads; unset, empty or "[]" means no validators. Anything
// that is not valid JSON is treated as validators present, so a malformed value still gets its flush.
function hasInitialValidators(value) {
  if (value === undefined || value.trim() === "") return false;
  try {
    const parsed = JSON.parse(value);
    return !Array.isArray(parsed) || parsed.length > 0;
  } catch {
    return true;
  }
}

// The deploy scripts print `JSON DEPLOY RESULT: {...,"rollupAddress":"0x..",...}`; with --json the line sits inside
// forge's JSON output with escaped quotes, so the match tolerates a backslash before each quote.
function extractRollupAddress(stdout) {
  const m = /rollupAddress\\?"\s*:\s*\\?"(0x[0-9a-fA-F]{40})/.exec(stdout);
  return m ? m[1] : undefined;
}

const FLUSH_SCRIPT = "script/deploy/FlushEntryQueue.s.sol:FlushEntryQueue";

const args = process.argv.slice(2);
const rpcUrl = extractArg(args, "--rpc-url");

// Broadcast one tx at a time only on an automining anvil, where batching races the auto-miner.
// Interval-mining anvil and real chains keep forge's default batching: there is no race there, and
// serializing would stall the deploy one block interval per tx.
const [isAnvil, isAutomine] = rpcUrl
  ? await Promise.all([
      rpc(rpcUrl, "web3_clientVersion")
        .then((v) => v.toLowerCase().includes("anvil"))
        .catch(() => false),
      rpc(rpcUrl, "anvil_getAutomine").catch(() => false),
    ])
  : [false, false];

const serializeTxs = isAnvil && isAutomine;
const timeoutMs =
  Number(process.env.FORGE_BROADCAST_TIMEOUT_MS) ||
  (isAnvil ? 120_000 : 1_200_000);

// Runs one `forge script ... --broadcast`, bounded by the timeout. Resolves to the exit code and stdout.
function runForge(forgeArgs) {
  const proc = spawn(process.env.FORGE_BIN || "forge", ["script", ...forgeArgs, "--broadcast"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const chunks = [];
  proc.stdout.on("data", (chunk) => chunks.push(chunk));
  return new Promise((resolve) => {
    let timedOut = false;
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
      resolve({ code: 1, stdout: Buffer.concat(chunks) });
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: timedOut ? 1 : code ?? 1, stdout: Buffer.concat(chunks) });
    });
  });
}

const deploy = await runForge([...args, ...(serializeTxs ? ["--slow"] : [])]);
let exitCode = deploy.code;
let output = deploy.stdout;

if (exitCode === 0 && hasInitialValidators(process.env.INITIAL_VALIDATORS)) {
  const rollup = extractRollupAddress(output.toString());
  const privateKey = extractArg(args, "--private-key");
  if (!rollup || !rpcUrl || !privateKey) {
    log("INITIAL_VALIDATORS set but no rollup address, --rpc-url or --private-key to flush with.");
    exitCode = 1;
  } else {
    log(`Flushing the entry queue of ${rollup} (gas limits from eth_estimateGas).`);
    const flush = await runForge([
      FLUSH_SCRIPT,
      "--sig",
      "run(address)",
      rollup,
      "--rpc-url",
      rpcUrl,
      "--private-key",
      privateKey,
      "--skip-simulation",
      "--slow",
      ...(args.includes("--json") ? ["--json"] : []),
    ]);
    exitCode = flush.code;
    output = Buffer.concat([output, flush.stdout]);
    if (exitCode === 0 && isAnvil) {
      // Leave the flush out of the head block. anvil's eth_estimateGas against `latest` runs at the head
      // block's timestamp, where a follow-up staking call (e.g. an attester exit) overwrites the
      // timestamp-keyed GSE checkpoints the flush just pushed instead of pushing new ones. Its estimate
      // then comes out ~25% below what it costs once mined, more than the 20% gas limit buffer that
      // L1TxUtils adds.
      try {
        await rpc(rpcUrl, "evm_mine");
      } catch (err) {
        log(`Failed to mine a block after the flush: ${err.message}`);
        exitCode = 1;
      }
    }
  }
}

log(exitCode === 0 ? "Broadcast succeeded." : `Broadcast failed (exit ${exitCode}).`);
if (output.length > 0) writeSync(1, output);
process.exit(exitCode);
