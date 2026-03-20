/**
 * Batch chonk verifier benchmarks using real protocol proofs.
 *
 * Downloads pinned IVC inputs from S3, proves a representative transaction,
 * then benchmarks batch verification throughput at various configurations.
 */
import { BatchChonkVerifier } from '@aztec/bb-prover';
import { createLogger } from '@aztec/foundation/log';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';

import { jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { corruptProofFields } from './batch_verifier_test_helpers.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('ivc-integration:bench:batch-verifier');

const PINNED_HASH = 'b99f5b94';
const PINNED_URL = `https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-${PINNED_HASH}.tar.gz`;
const BB_PATH = process.env.BB_BINARY_PATH ?? resolve('../../barretenberg/cpp/build/bin/bb');

jest.setTimeout(1_200_000); // 20 min — proving is slow

type BenchEntry = { name: string; value: number; unit: string };

/** Split a binary proof file into 32-byte field element buffers. */
function proofToFields(proofBuf: Buffer): Uint8Array[] {
  const fields: Uint8Array[] = [];
  for (let i = 0; i < proofBuf.length; i += 32) {
    fields.push(Uint8Array.from(proofBuf.subarray(i, i + 32)));
  }
  return fields;
}

describe('Batch Chonk Verifier Benchmarks (Real Proofs)', () => {
  let validProofFields: Uint8Array[];
  let invalidProofFields: Uint8Array[];
  let vk: Uint8Array;
  let inputsDir: string;
  const benchResults: BenchEntry[] = [];

  beforeAll(async () => {
    // Download pinned IVC inputs
    inputsDir = resolve(tmpdir(), `bb-bench-inputs-${Date.now()}`);
    await mkdir(inputsDir, { recursive: true });
    logger.info(`Downloading pinned IVC inputs from ${PINNED_URL}...`);
    await execFileAsync('curl', ['-sf', PINNED_URL, '-o', `${inputsDir}/inputs.tar.gz`]);
    await execFileAsync('tar', ['-xzf', `${inputsDir}/inputs.tar.gz`, '-C', inputsDir]);

    // Pick the largest flow for a realistic proof
    const flows = await readdir(inputsDir, { withFileTypes: true });
    const flowDirs = flows.filter(f => f.isDirectory()).map(f => f.name);
    logger.info(`Available flows: ${flowDirs.join(', ')}`);

    // Use a transfer flow (representative of typical txs)
    const flow = flowDirs.find(f => f.includes('transfer_0_recursions+sponsored')) ?? flowDirs[0];
    const ivcInputsPath = resolve(inputsDir, flow, 'ivc-inputs.msgpack');
    const proofDir = resolve(inputsDir, 'proof-out');
    await mkdir(proofDir, { recursive: true });

    // Prove the flow
    logger.info(`Proving flow: ${flow}...`);
    const proveStart = performance.now();
    await execFileAsync(BB_PATH, ['prove', '--scheme', 'chonk', '--ivc_inputs_path', ivcInputsPath, '-o', proofDir], {
      timeout: 600_000,
    });
    const proveMs = performance.now() - proveStart;
    logger.info(`Proof generated in ${Math.ceil(proveMs)}ms`);

    // Read the proof and convert to field elements
    const proofBuf = await readFile(resolve(proofDir, 'proof'));
    validProofFields = proofToFields(proofBuf);
    invalidProofFields = corruptProofFields(validProofFields);

    // Get the protocol VK (HidingKernelToRollup — matches most flows)
    vk = ProtocolCircuitVks['HidingKernelToRollup'].keyAsBytes;

    logger.info(`Proof: ${proofBuf.length} bytes, ${validProofFields.length} fields`);
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      await mkdir(dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(benchResults, null, 2));
    } else {
      logger.info('Benchmark results:');
      for (const r of benchResults) {
        logger.info(`  ${r.name}: ${r.value.toFixed(1)} ${r.unit}`);
      }
    }
    await rm(inputsDir, { recursive: true, force: true }).catch(() => {});
  });

  // -- Core count sweep --

  for (const numCores of [2, 4, 8]) {
    it(`throughput: 16 proofs, batch_size=8, ${numCores} cores`, async () => {
      const numProofs = 16;
      const batchSize = 8;
      const proofs = Array.from({ length: numProofs }, () => ({ vkIndex: 0, proofFields: validProofFields }));

      const verifier = await BatchChonkVerifier.newForTesting({ bbChonkVerifyConcurrency: numCores }, [vk], batchSize);

      try {
        const wallStart = performance.now();
        const results = await Promise.all(proofs.map(p => verifier.enqueueProof(p.vkIndex, p.proofFields)));
        const wallMs = performance.now() - wallStart;

        expect(results).toHaveLength(numProofs);
        expect(results.every(r => r.valid)).toBe(true);

        const avgVerifyMs = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
        const throughput = (numProofs / wallMs) * 1000;

        benchResults.push(
          { name: `BatchVerify/16_real_proofs/${numCores}_cores/wall_time`, value: wallMs, unit: 'ms' },
          { name: `BatchVerify/16_real_proofs/${numCores}_cores/avg_verify`, value: avgVerifyMs, unit: 'ms' },
          { name: `BatchVerify/16_real_proofs/${numCores}_cores/throughput`, value: throughput, unit: 'proofs/sec' },
        );

        logger.info(`16 proofs, ${numCores} cores`, {
          wallMs: Math.ceil(wallMs),
          avgVerifyMs: Math.ceil(avgVerifyMs),
          throughput: throughput.toFixed(2),
        });
      } finally {
        await verifier.stop();
      }
    });
  }

  // -- Batch size sweep --

  for (const batchSize of [2, 4, 8]) {
    it(`batch_size sweep: 8 proofs, batch_size=${batchSize}, 8 cores`, async () => {
      const numProofs = 8;
      const proofs = Array.from({ length: numProofs }, () => ({ vkIndex: 0, proofFields: validProofFields }));

      const verifier = await BatchChonkVerifier.newForTesting({ bbChonkVerifyConcurrency: 8 }, [vk], batchSize);

      try {
        const wallStart = performance.now();
        const results = await Promise.all(proofs.map(p => verifier.enqueueProof(p.vkIndex, p.proofFields)));
        const wallMs = performance.now() - wallStart;

        expect(results).toHaveLength(numProofs);
        expect(results.every(r => r.valid)).toBe(true);

        const throughput = (numProofs / wallMs) * 1000;

        benchResults.push(
          { name: `BatchVerify/batch_size_${batchSize}/wall_time`, value: wallMs, unit: 'ms' },
          { name: `BatchVerify/batch_size_${batchSize}/throughput`, value: throughput, unit: 'proofs/sec' },
        );

        logger.info(`batch_size=${batchSize}`, { wallMs: Math.ceil(wallMs), throughput: throughput.toFixed(2) });
      } finally {
        await verifier.stop();
      }
    });
  }

  // -- Bisection overhead --

  it('bisection overhead: 8 proofs with 2 bad, batch_size=8, 8 cores', async () => {
    const numProofs = 8;
    const numBad = 2;
    const proofs = Array.from({ length: numProofs }, (_, i) => ({
      vkIndex: 0,
      proofFields: i < numBad ? invalidProofFields : validProofFields,
    }));

    const verifier = await BatchChonkVerifier.newForTesting({ bbChonkVerifyConcurrency: 8 }, [vk], 8);

    try {
      const wallStart = performance.now();
      const results = await Promise.all(proofs.map(p => verifier.enqueueProof(p.vkIndex, p.proofFields)));
      const wallMs = performance.now() - wallStart;

      expect(results).toHaveLength(numProofs);
      expect(results.filter(r => r.valid)).toHaveLength(numProofs - numBad);
      expect(results.filter(r => !r.valid)).toHaveLength(numBad);

      benchResults.push({
        name: `BatchVerify/mixed_${numBad}_bad_of_${numProofs}/wall_time`,
        value: wallMs,
        unit: 'ms',
      });
      logger.info(`mixed ${numBad} bad of ${numProofs}`, { wallMs: Math.ceil(wallMs) });
    } finally {
      await verifier.stop();
    }
  });
});
