#!/usr/bin/env node
// Note: this would be .ts but Node.js refuses to load .ts from node_modules.

// forge_broadcast.js - Reliable forge script broadcast with retry and timeout.
//
// Wraps `forge script` with:
//   1. --batch-size 8 to prevent forge broadcast hangs (forge bug with large RPC batches)
//   2. External timeout (forge's --timeout is unreliable for broadcast hangs)
//   3. Retry with --resume on real chains, or full retry from scratch on anvil
//
// Anvil's auto-miner has a race condition where batched transactions can get stranded
// in the mempool — they arrive after the auto-miner already triggered for the batch,
// and sit waiting for the next trigger that never comes. Neither evm_mine nor --resume
// can recover these stuck transactions. Interval mining (--block-time) avoids this issue.
//
// On anvil, we work around this by clearing broadcast artifacts and retrying from scratch.
// On real chains (where this anvil-specific bug doesn't apply), we use --resume.
//
// Usage:
//   ./scripts/forge_broadcast.js <forge script args...>
//
//   Pass the same args you'd pass to `forge script`, WITHOUT --broadcast or --batch-size.
//   The wrapper adds those automatically.
//
// Example:
//   ./scripts/forge_broadcast.js script/deploy/Deploy.s.sol:Deploy \
//     --rpc-url "$RPC_URL" --private-key "$KEY" -vvv
//
// Environment variables:
//   FORGE_BROADCAST_TIMEOUT       - Override timeout per attempt in seconds (auto-detected from chain ID)
//   FORGE_BROADCAST_MAX_RETRIES   - Max retries after initial attempt (default: 3)
//
// Uses only Node.js built-ins (no external dependencies).

import { spawn } from "node:child_process";
import { rmSync, writeSync } from "node:fs";

// Chain IDs for timeout selection.
const MAINNET_CHAIN_ID = 1;
const SEPOLIA_CHAIN_ID = 11155111;

// Timeout per attempt: 300s for mainnet/sepolia (real chains are slow), 50s for everything else.
// FORGE_BROADCAST_TIMEOUT env var overrides the auto-detected value.
function getDefaultTimeout(chainId) {
  if (chainId === MAINNET_CHAIN_ID || chainId === SEPOLIA_CHAIN_ID) return 300;
  return 50;
}

const MAX_RETRIES = parseInt(
  process.env.FORGE_BROADCAST_MAX_RETRIES ?? "3",
  10,
);

if (!Number.isSafeInteger(MAX_RETRIES)) {
  process.stderr.write(`MAX_RETRIES is not a valid integer.\n`);
  process.exit(1);
}

// Batch size of 8 prevents forge from hanging during broadcast.
// See: https://github.com/foundry-rs/foundry/issues/6796
const BATCH_SIZE = 8;
const KILL_GRACE = 15_000;
// Exit code indicating a timeout, matching the `timeout` coreutil convention.
const EXIT_TIMEOUT = 124;
// Delay before retry to let pending transactions settle in the mempool.
const RETRY_DELAY = 10_000;

function log(msg) {
  process.stderr.write(`[forge_broadcast] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract --rpc-url value from forge args. */
function extractRpcUrl(args) {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === "--rpc-url") return args[i + 1];
  }
  return undefined;
}

/** Strip --verify from args, returning the filtered args and whether --verify was present. */
function extractVerifyFlag(args) {
  const filtered = args.filter((a) => a !== "--verify");
  return { args: filtered, verify: filtered.length !== args.length };
}

const RPC_TIMEOUT = 10_000;

/** JSON-RPC call using fetch. Rejects on JSON-RPC errors and timeouts. */
async function rpcCall(rpcUrl, method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(RPC_TIMEOUT),
  });
  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status} for ${method}`);
  }
  const data = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error(`Bad RPC response for ${method}: ${data.slice(0, 200)}`);
  }
  if (parsed.error) {
    throw new Error(`RPC error for ${method}: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.result;
}

/** Detect if the RPC endpoint is an anvil dev node via web3_clientVersion. */
async function detectAnvil(rpcUrl) {
  try {
    const version = await rpcCall(rpcUrl, "web3_clientVersion", []);
    return version.toLowerCase().includes("anvil");
  } catch {
    return false;
  }
}

/** Get the chain ID from the RPC endpoint. */
async function getChainId(rpcUrl) {
  try {
    const result = await rpcCall(rpcUrl, "eth_chainId", []);
    return parseInt(result, 16);
  } catch {
    return undefined;
  }
}

function runForge(args, timeoutSecs) {
  return new Promise((resolve) => {
    const proc = spawn(
      "forge",
      ["script", ...args, "--broadcast", "--batch-size", String(BATCH_SIZE)],
      {
        stdio: ["ignore", "pipe", "inherit"], // buffer stdout, pass stderr through
      },
    );

    const stdout = [];
    proc.stdout.on("data", (chunk) => stdout.push(chunk));

    let timedOut = false;
    let settled = false;
    let killTimer;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      killTimer = setTimeout(() => proc.kill("SIGKILL"), KILL_GRACE);
    }, timeoutSecs * 1000);

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({ exitCode: timedOut ? EXIT_TIMEOUT : code, stdout });
    };

    proc.on("error", () => finish(1));
    proc.on("close", (code) => finish(code ?? 1));
  });
}

// Main

// Strip --verify from args so it doesn't run during broadcast attempts. Verification
// happens after all receipts are collected (foundry-rs/foundry crates/script/src/lib.rs:333-338)
// and forge exits non-zero if ANY verification fails (crates/script/src/verify.rs), even when
// all transactions landed. We run verification as a separate step after broadcast succeeds.
const { args: forgeArgs, verify: wantsVerify } = extractVerifyFlag(
  process.argv.slice(2),
);
const rpcUrl = extractRpcUrl(forgeArgs);

// Query chain info from RPC at startup.
const chainId = rpcUrl ? await getChainId(rpcUrl) : undefined;
const TIMEOUT = process.env.FORGE_BROADCAST_TIMEOUT
  ? parseInt(process.env.FORGE_BROADCAST_TIMEOUT, 10)
  : getDefaultTimeout(chainId);

if (!Number.isSafeInteger(TIMEOUT)) {
  process.stderr.write(`FORGE_BROADCAST_TIMEOUT is not a valid integer.\n`);
  process.exit(1);
}

log(
  `chain_id=${chainId ?? "unknown"}, timeout=${TIMEOUT}s, max_retries=${MAX_RETRIES}, batch_size=${BATCH_SIZE}${wantsVerify ? ", verify=true (after broadcast)" : ""}`,
);

// Detect anvil once at startup. On anvil, retries reset the chain and start from scratch
// instead of using --resume, because anvil's auto-miner can strand transactions in the
// mempool in an unrecoverable state (neither evm_mine nor --resume can flush them).
const isAnvil = rpcUrl ? await detectAnvil(rpcUrl) : false;
if (isAnvil) {
  log("Detected anvil — retries will reset chain instead of using --resume.");
}

/**
 * Run contract verification via `forge script --resume --verify --broadcast` (no timeout).
 * Verification uses broadcast artifacts + re-compilation — it doesn't need simulation data.
 * See: foundry-rs/foundry crates/script/src/build.rs (CompiledState::resume) and
 *      crates/script/src/verify.rs (verify_contracts).
 * Failure is logged but doesn't affect the exit code — transactions already landed.
 */
async function runVerification(args) {
  log("Running contract verification (no timeout)...");
  const verifyResult = await new Promise((resolve) => {
    const proc = spawn(
      "forge",
      ["script", ...args, "--broadcast", "--resume", "--verify"],
      {
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    let settled = false;
    proc.on("error", () => {
      if (!settled) {
        settled = true;
        resolve(1);
      }
    });
    proc.on("close", (code) => {
      if (!settled) {
        settled = true;
        resolve(code ?? 1);
      }
    });
  });
  if (verifyResult === 0) {
    log("Contract verification succeeded.");
  } else {
    log(
      `Contract verification failed (exit ${verifyResult}). Transactions are on-chain; verify manually if needed.`,
    );
  }
}

/** Write buffered stdout to fd 1 (synchronous) and exit. */
function emitAndExit(result, code) {
  const data = Buffer.concat(result.stdout);
  if (data.length > 0) {
    writeSync(1, data);
  }
  process.exit(code);
}

/** Run verification if requested, then emit stdout and exit. */
async function verifyAndExit(result) {
  if (wantsVerify) {
    await runVerification(forgeArgs);
  }
  emitAndExit(result, 0);
}

// Attempt 1: initial broadcast
log(`Attempt 1/${MAX_RETRIES + 1}: broadcasting...`);
let result = await runForge(forgeArgs, TIMEOUT);

if (result.exitCode === 0) {
  log("Broadcast succeeded on first attempt.");
  await verifyAndExit(result);
}

log(
  `Attempt 1 ${result.exitCode === EXIT_TIMEOUT ? `timed out after ${TIMEOUT}s` : `failed (exit ${result.exitCode})`}.`,
);

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  log(`Waiting ${RETRY_DELAY / 1000}s before retry...`);
  await sleep(RETRY_DELAY);

  if (isAnvil) {
    // On anvil: retry from scratch instead of --resume.
    //
    // Anvil's auto-miner has a race condition where batched transactions can arrive
    // after the auto-miner already triggered, stranding them in the mempool. --resume
    // just waits for these same stuck transactions and hangs again. A fresh retry
    // re-simulates from current chain state and re-sends, which works because:
    //   - Forge computes new nonces from on-chain state
    //   - New transactions replace any stuck ones with the same nonce
    //   - The race condition is intermittent (~0.04%), so retries almost always succeed
    rmSync("broadcast", { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });

    log(
      `Attempt ${attempt + 1}/${MAX_RETRIES + 1}: retrying from scratch (anvil)...`,
    );
    result = await runForge(forgeArgs, TIMEOUT);
  } else {
    // On real chains: use --resume to pick up unmined transactions.
    // --resume re-reads broadcast artifacts and resubmits unmined transactions.
    // NOTE: --resume skips simulation, so console.log output (e.g. JSON deploy results)
    // is only produced on the first attempt. We keep the first attempt's stdout (`result`)
    // and only check the exit code from the --resume attempt.
    log(`Attempt ${attempt + 1}/${MAX_RETRIES + 1}: --resume`);
    const resumeResult = await runForge([...forgeArgs, "--resume"], TIMEOUT);

    if (resumeResult.exitCode === 0) {
      log(`Broadcast succeeded on attempt ${attempt + 1}.`);
      // Emit the first attempt's stdout which has the JSON simulation output.
      await verifyAndExit(result);
    }
    log(
      `Attempt ${attempt + 1} ${resumeResult.exitCode === EXIT_TIMEOUT ? `timed out after ${TIMEOUT}s` : `failed (exit ${resumeResult.exitCode})`}.`,
    );
    continue;
  }

  if (result.exitCode === 0) {
    log(`Broadcast succeeded on attempt ${attempt + 1}.`);
    await verifyAndExit(result);
  }
  log(
    `Attempt ${attempt + 1} ${result.exitCode === EXIT_TIMEOUT ? `timed out after ${TIMEOUT}s` : `failed (exit ${result.exitCode})`}.`,
  );
}

log(`All ${MAX_RETRIES + 1} attempts failed.`);
emitAndExit(result, result.exitCode);
