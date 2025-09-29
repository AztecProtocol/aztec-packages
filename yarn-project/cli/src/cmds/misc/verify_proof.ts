import { BBCircuitVerifier, QueuedIVCVerifier } from '@aztec/bb-prover';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import { Tx } from '@aztec/stdlib/tx';

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';

export async function verifyProof(
  rate: number,
  duration: number,
  proofType: 'public' | 'private',
  numConcurrentVerifiers: number,
  bbConcurrency: number,
  log: LogFn,
) {
  log(`Starting proof verification`);
  log(`Proof type: ${proofType}`);
  log(`Rate: ${rate} proofs/second`);
  log(`Duration: ${duration} seconds`);
  log(`Concurrent verifiers: ${numConcurrentVerifiers}`);
  log(`BB concurrency: ${bbConcurrency}`);

  // Load the proof from the default location
  const proofFileName = proofType === 'public' ? 'public_proven_tx.bin' : 'private_proven_tx.bin';

  // Determine proof file path based on environment
  let proofPath: string;

  // First, try Docker container location
  const dockerProofPath = join('/usr/src/proofs', proofFileName);

  // Check if we're in Docker (BB_BINARY_PATH is set in Dockerfile)
  if (process.env.BB_BINARY_PATH) {
    log(`Running in Docker environment`);

    if (existsSync(dockerProofPath)) {
      proofPath = dockerProofPath;
      log(`Found proof at: ${dockerProofPath}`);
    } else {
      // Try fallback locations
      const fallbackPaths = [
        join('/usr/src/yarn-project/cli/proofs', proofFileName),
        join('/usr/src/yarn-project/cli/dest/proofs', proofFileName),
      ];

      for (const fallbackPath of fallbackPaths) {
        if (existsSync(fallbackPath)) {
          proofPath = fallbackPath;
          log(`Found proof at fallback location: ${fallbackPath}`);
          break;
        }
      }

      if (!proofPath) {
        throw new Error(
          `Proof file not found in Docker. Checked:\n` +
            `  - ${dockerProofPath}\n` +
            fallbackPaths.map(p => `  - ${p}`).join('\n') +
            '\n' +
            `Please ensure proof files exist in yarn-project/cli/proofs/ before building the Docker image.`,
        );
      }
    }
  } else {
    // Local development - find the yarn-project root directory and look for proofs in cli/proofs
    let currentDir = process.cwd();
    while (currentDir !== '/' && !currentDir.endsWith('yarn-project')) {
      currentDir = resolve(currentDir, '..');
    }
    proofPath = resolve(currentDir, 'cli/proofs', proofFileName);

    if (!existsSync(proofPath)) {
      throw new Error(
        `Proof file not found at ${proofPath}. Please run the tx_stats benchmark first to generate the proof files.`,
      );
    }
  }

  const proofBuffer = await readFile(proofPath);
  const tx = Tx.fromBuffer(proofBuffer);

  log(`Loaded proof from ${proofPath}`);
  log(`Transaction hash: ${tx.getTxHash().toString()}`);
  log(`Transaction type: ${tx.data.forPublic ? 'Public' : 'Private'}`);

  // Use environment variables from Dockerfile, with fallbacks for local development
  const bbConfig = {
    bbBinaryPath: process.env.BB_BINARY_PATH || 'bb', // Fall back to 'bb' in PATH
    bbWorkingDirectory: process.env.BB_WORKING_DIRECTORY || '/tmp/bb-verify',
    bbSkipCleanup: false,
    numConcurrentIVCVerifiers: numConcurrentVerifiers,
    bbIVCConcurrency: bbConcurrency,
  };

  log(`BB binary path: ${bbConfig.bbBinaryPath}`);
  log(`BB working directory: ${bbConfig.bbWorkingDirectory}`);

  const logger = createLogger('cli:verify-proof');
  const circuitVerifier = await BBCircuitVerifier.new(bbConfig, logger);
  const queuedVerifier = new QueuedIVCVerifier(bbConfig, circuitVerifier);

  const totalProofs = Math.floor(rate * duration);
  const delayMs = 1000 / rate;

  log(`Will verify ${totalProofs} proofs over ${duration} seconds`);

  const results: Promise<IVCProofVerificationResult>[] = [];
  const overallTimer = new Timer();

  // Start verification loop
  for (let i = 0; i < totalProofs; i++) {
    const startTime = Date.now();

    // Queue the verification
    const verificationPromise = queuedVerifier.verifyProof(tx);
    results.push(verificationPromise);

    // Calculate how long to wait before queuing the next proof
    const elapsed = Date.now() - startTime;
    const waitTime = Math.max(0, delayMs - elapsed);

    if (waitTime > 0 && i < totalProofs - 1) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Log progress periodically
    if ((i + 1) % 10 === 0) {
      log(`Queued ${i + 1}/${totalProofs} verifications`);
    }
  }

  log('All proofs queued, waiting for completions...');

  // Wait for all verifications to complete
  const verificationResults = await Promise.all(results);
  const totalTime = overallTimer.ms();

  // Analyze results
  const validCount = verificationResults.filter(r => r.valid).length;
  const durations = verificationResults.map(r => r.durationMs);
  const totalDurations = verificationResults.map(r => r.totalDurationMs);

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  const avgTotalDuration = totalDurations.reduce((a, b) => a + b, 0) / totalDurations.length;
  const minTotalDuration = Math.min(...totalDurations);
  const maxTotalDuration = Math.max(...totalDurations);

  // Sort for percentiles
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)];
  const p90 = sortedDurations[Math.floor(sortedDurations.length * 0.9)];
  const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)];

  const sortedTotalDurations = [...totalDurations].sort((a, b) => a - b);
  const totalP50 = sortedTotalDurations[Math.floor(sortedTotalDurations.length * 0.5)];
  const totalP90 = sortedTotalDurations[Math.floor(sortedTotalDurations.length * 0.9)];
  const totalP99 = sortedTotalDurations[Math.floor(sortedTotalDurations.length * 0.99)];

  // Print results
  log(`\n=== Verification Results ===`);
  log(`Total proofs verified: ${totalProofs}`);
  log(`Valid proofs: ${validCount}/${totalProofs}`);
  log(`Total time: ${totalTime}ms`);
  log(`Actual TPS: ${(totalProofs / (totalTime / 1000)).toFixed(2)}`);

  log(`\nIVC Verification Times (ms):`);
  log(`  Average: ${avgDuration.toFixed(2)}`);
  log(`  Min: ${minDuration.toFixed(2)}`);
  log(`  Max: ${maxDuration.toFixed(2)}`);
  log(`  P50: ${p50.toFixed(2)}`);
  log(`  P90: ${p90.toFixed(2)}`);
  log(`  P99: ${p99.toFixed(2)}`);

  log(`\nTotal Verification Times including serde (ms):`);
  log(`  Average: ${avgTotalDuration.toFixed(2)}`);
  log(`  Min: ${minTotalDuration.toFixed(2)}`);
  log(`  Max: ${maxTotalDuration.toFixed(2)}`);
  log(`  P50: ${totalP50.toFixed(2)}`);
  log(`  P90: ${totalP90.toFixed(2)}`);
  log(`  P99: ${totalP99.toFixed(2)}`);

  // Cleanup
  await queuedVerifier.stop();
  circuitVerifier.stop();
}
