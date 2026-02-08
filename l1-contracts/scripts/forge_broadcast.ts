#!/usr/bin/env -S node --experimental-strip-types

// forge_broadcast.ts - Reliable forge script broadcast with retry and timeout.
//
// Wraps `forge script` with:
//   1. --batch-size 8 to prevent forge broadcast hangs (forge bug with large RPC batches)
//   2. External timeout (forge's --timeout is unreliable for broadcast hangs)
//   3. Retry with --resume on real chains, or full retry from scratch on anvil
//
// Anvil's auto-miner has a race condition where batched transactions can get stranded
// in the mempool — they arrive after the auto-miner already triggered for the batch,
// and sit waiting for the next trigger that never comes. Neither evm_mine nor --resume
// can recover these stuck transactions. The anvil team recommends using interval mining
// (--block-time) instead of automine for reliable transaction inclusion:
//   https://github.com/foundry-rs/foundry/issues/8919#issuecomment-2789655937
//
// On anvil, we work around this by clearing broadcast artifacts and retrying from scratch.
// On real chains (where this anvil-specific bug doesn't apply), we use --resume.
//
// Usage:
//   ./scripts/forge_broadcast.ts <forge script args...>
//
//   Pass the same args you'd pass to `forge script`, WITHOUT --broadcast or --batch-size.
//   The wrapper adds those automatically.
//
// Example:
//   ./scripts/forge_broadcast.ts script/deploy/Deploy.s.sol:Deploy \
//     --rpc-url "$RPC_URL" --private-key "$KEY" -vvv
//
// Environment variables:
//   FORGE_BROADCAST_TIMEOUT       - Timeout per attempt in seconds (default: 300)
//   FORGE_BROADCAST_MAX_RETRIES   - Max retries after initial attempt (default: 3)
//
// Uses only Node.js built-ins (no external dependencies).

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';

const TIMEOUT = parseInt(process.env.FORGE_BROADCAST_TIMEOUT ?? '300', 10);
const MAX_RETRIES = parseInt(process.env.FORGE_BROADCAST_MAX_RETRIES ?? '3', 10);

// Batch size of 8 prevents forge from hanging during broadcast.
// See: https://github.com/foundry-rs/foundry/issues/6796
const BATCH_SIZE = 8;
const KILL_GRACE = 15_000;
// Delay before retry to let pending transactions settle in the mempool.
const RETRY_DELAY = 10_000;

function log(msg: string): void {
  process.stderr.write(`[forge_broadcast] ${msg}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Find the most recently modified run-latest.json in broadcast/. */
function findLatestBroadcastArtifact(): string | undefined {
  try {
    let latestFile = '';
    let latestMtime = 0;

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name === 'run-latest.json') {
          const mtime = statSync(fullPath).mtimeMs;
          if (mtime > latestMtime) {
            latestMtime = mtime;
            latestFile = fullPath;
          }
        }
      }
    };

    walk('broadcast');
    return latestFile || undefined;
  } catch {
    return undefined;
  }
}

/** Extract --rpc-url value from forge args. */
function extractRpcUrl(args: string[]): string | undefined {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '--rpc-url') return args[i + 1];
  }
  return undefined;
}

/** JSON-RPC call using Node.js built-ins. */
function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(rpcUrl);
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const reqFn = url.protocol === 'https:' ? httpsRequest : httpRequest;

    const req = reqFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.result);
        } catch {
          reject(new Error(`Bad RPC response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Detect if the RPC endpoint is an anvil dev node via web3_clientVersion. */
async function detectAnvil(rpcUrl: string): Promise<boolean> {
  try {
    const version = (await rpcCall(rpcUrl, 'web3_clientVersion', [])) as string;
    return version.toLowerCase().includes('anvil');
  } catch {
    return false;
  }
}

/**
 * Verify that all transactions in the broadcast artifacts were mined successfully.
 * Checks the deployer's on-chain nonce against the highest nonce in the artifacts.
 * If on-chain nonce > max artifact nonce, all transactions have been confirmed.
 */
async function verifyBroadcastOnChain(rpcUrl: string): Promise<boolean> {
  try {
    const artifactPath = findLatestBroadcastArtifact();
    if (!artifactPath) return false;

    const data = JSON.parse(readFileSync(artifactPath, 'utf-8'));
    const transactions: { transaction: { from: string; nonce: string } }[] = data.transactions ?? [];

    if (transactions.length === 0) return false;

    const maxNonceByAddress = new Map<string, number>();
    for (const tx of transactions) {
      const from = tx.transaction.from.toLowerCase();
      const nonce = parseInt(tx.transaction.nonce, 16);
      const current = maxNonceByAddress.get(from) ?? -1;
      if (nonce > current) maxNonceByAddress.set(from, nonce);
    }

    log(`Checking on-chain nonces for ${transactions.length} transactions from ${artifactPath}...`);

    for (const [address, maxNonce] of maxNonceByAddress) {
      const onChainNonce = parseInt(
        (await rpcCall(rpcUrl, 'eth_getTransactionCount', [address, 'latest'])) as string,
        16,
      );
      if (onChainNonce <= maxNonce) {
        log(`Address ${address}: on-chain nonce ${onChainNonce}, need > ${maxNonce}. Not all transactions confirmed.`);
        return false;
      }
    }

    log(`All ${transactions.length} transactions confirmed on-chain (nonce check).`);
    return true;
  } catch (e) {
    log(`verifyBroadcastOnChain error: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

interface ForgeResult {
  exitCode: number;
  stdout: Buffer[];
}

function runForge(args: string[], timeoutSecs: number): Promise<ForgeResult> {
  return new Promise(resolve => {
    const proc = spawn('forge', ['script', ...args, '--broadcast', '--batch-size', String(BATCH_SIZE)], {
      stdio: ['ignore', 'pipe', 'inherit'], // buffer stdout, pass stderr through
    });

    const stdout: Buffer[] = [];
    proc.stdout!.on('data', (chunk: Buffer) => stdout.push(chunk));

    let timedOut = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => proc.kill('SIGKILL'), KILL_GRACE);
    }, timeoutSecs * 1000);

    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({ exitCode: timedOut ? 124 : code, stdout });
    };

    proc.on('error', () => finish(1));
    proc.on('close', code => finish(code ?? 1));
  });
}

// Main
log(`timeout=${TIMEOUT}s, max_retries=${MAX_RETRIES}, batch_size=${BATCH_SIZE}`);
const forgeArgs = process.argv.slice(2);
const rpcUrl = extractRpcUrl(forgeArgs);

// Detect anvil once at startup. On anvil, retries reset the chain and start from scratch
// instead of using --resume, because anvil's auto-miner can strand transactions in the
// mempool in an unrecoverable state (neither evm_mine nor --resume can flush them).
const isAnvil = rpcUrl ? await detectAnvil(rpcUrl) : false;
if (isAnvil) {
  log('Detected anvil — retries will reset chain instead of using --resume.');
}

/** Write buffered stdout to process.stdout and exit. Returns a never-resolving promise so
 *  `await emitAndExit(...)` blocks execution until process.exit() fires. */
function emitAndExit(result: ForgeResult, code: number): Promise<never> {
  return new Promise(() => {
    const data = Buffer.concat(result.stdout);
    if (data.length === 0) {
      process.exit(code);
      return;
    }
    // Wait for write to drain before exiting to avoid truncation on pipes >64KB.
    process.stdout.write(data, () => process.exit(code));
    // If stdout is already destroyed/closed, the callback may never fire.
    process.stdout.on('error', () => process.exit(code));
  });
}

// Attempt 1: initial broadcast
log(`Attempt 1/${MAX_RETRIES + 1}: broadcasting...`);
let result = await runForge(forgeArgs, TIMEOUT);

if (result.exitCode === 0) {
  log('Broadcast succeeded on first attempt.');
  await emitAndExit(result, 0);
}

log(`Attempt 1 ${result.exitCode === 124 ? `timed out after ${TIMEOUT}s` : `failed (exit ${result.exitCode})`}.`);

// Forge sometimes exits non-zero even though all transactions were mined.
if (rpcUrl && (await verifyBroadcastOnChain(rpcUrl))) {
  log('All transactions confirmed on-chain despite non-zero exit — treating as success.');
  await emitAndExit(result, 0);
}

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
    //
    // The anvil team recommends interval mining (--block-time) over automine for
    // reliable transaction inclusion. See:
    //   https://github.com/foundry-rs/foundry/issues/8919#issuecomment-2789655937
    try {
      rmSync('broadcast', { recursive: true, force: true });
    } catch { /* broadcast dir may not exist */ }

    log(`Attempt ${attempt + 1}/${MAX_RETRIES + 1}: retrying from scratch (anvil)...`);
    result = await runForge(forgeArgs, TIMEOUT);
  } else {
    // On real chains: use --resume to pick up unmined transactions.
    // --resume re-reads broadcast artifacts and resubmits unmined transactions.
    // NOTE: --resume skips simulation, so console.log output (e.g. JSON deploy results)
    // is only produced on the first attempt. We keep the first attempt's stdout (`result`)
    // and only check the exit code from the --resume attempt.
    if (rpcUrl && (await verifyBroadcastOnChain(rpcUrl))) {
      log('All transactions confirmed on-chain after delay — treating as success.');
      await emitAndExit(result, 0);
    }

    log(`Attempt ${attempt + 1}/${MAX_RETRIES + 1}: --resume`);
    const resumeResult = await runForge([...forgeArgs, '--resume'], TIMEOUT);

    if (resumeResult.exitCode === 0) {
      log(`Broadcast succeeded on attempt ${attempt + 1}.`);
      // Emit the first attempt's stdout which has the JSON simulation output.
      await emitAndExit(result, 0);
    }
    log(
      `Attempt ${attempt + 1} ${resumeResult.exitCode === 124 ? `timed out after ${TIMEOUT}s` : `failed (exit ${resumeResult.exitCode})`}.`,
    );
    continue;
  }

  if (result.exitCode === 0) {
    log(`Broadcast succeeded on attempt ${attempt + 1}.`);
    await emitAndExit(result, 0);
  }
  log(
    `Attempt ${attempt + 1} ${result.exitCode === 124 ? `timed out after ${TIMEOUT}s` : `failed (exit ${result.exitCode})`}.`,
  );
}

// Final on-chain check after all retries exhausted.
if (rpcUrl && (await verifyBroadcastOnChain(rpcUrl))) {
  log('All transactions confirmed on-chain after retries — treating as success.');
  await emitAndExit(result, 0);
}

log(`All ${MAX_RETRIES + 1} attempts failed.`);
await emitAndExit(result, result.exitCode);
