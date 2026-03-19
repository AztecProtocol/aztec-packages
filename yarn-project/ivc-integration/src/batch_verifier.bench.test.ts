/**
 * Batch chonk verifier benchmarks.
 *
 * Measures throughput of the batch verifier service at various batch sizes and core counts,
 * using proofs generated from the testing IVC stack (no external inputs needed).
 */
import { AztecClientBackend, BackendType, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { corruptProofFields, runBatchVerifier } from './batch_verifier_test_helpers.js';
import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:bench:batch-verifier');

jest.setTimeout(600_000);

type BenchEntry = { name: string; value: number; unit: string };

describe('Batch Chonk Verifier Benchmarks', () => {
  let bb: Barretenberg;
  let validProofFields: Uint8Array[];
  let invalidProofFields: Uint8Array[];
  let vk: Uint8Array;
  const benchResults: BenchEntry[] = [];

  beforeAll(async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket });
    await bb.initSRSChonk();

    logger.info('Generating proof for benchmarks...');
    const [bytecodes, witnesses, , vks] = await generateTestingIVCStack(1, 0);
    const backend = new AztecClientBackend(bytecodes, bb);
    const [proofFields, , generatedVk] = await backend.prove(witnesses, vks);
    validProofFields = proofFields;
    invalidProofFields = corruptProofFields(validProofFields);
    vk = generatedVk;
    logger.info('Proof generated');
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
    await bb.destroy();
  });

  // -- Core count sweep --

  for (const numCores of [2, 4, 8]) {
    it(`throughput: 16 proofs, batch_size=8, ${numCores} cores`, async () => {
      const numProofs = 16;
      const batchSize = 8;
      const proofs = Array.from({ length: numProofs }, () => ({ vkIndex: 0, proofFields: validProofFields }));

      const wallStart = performance.now();
      const results = await runBatchVerifier({ vks: [vk], numCores, batchSize, proofs });
      const wallMs = performance.now() - wallStart;

      expect(results).toHaveLength(numProofs);
      expect(results.every(r => r.valid)).toBe(true);

      const avgVerifyMs = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
      const throughput = (numProofs / wallMs) * 1000;

      benchResults.push(
        { name: `BatchVerify/16_proofs/${numCores}_cores/wall_time`, value: wallMs, unit: 'ms' },
        { name: `BatchVerify/16_proofs/${numCores}_cores/avg_verify`, value: avgVerifyMs, unit: 'ms' },
        { name: `BatchVerify/16_proofs/${numCores}_cores/throughput`, value: throughput, unit: 'proofs/sec' },
      );

      logger.info(`16 proofs, ${numCores} cores`, {
        wallMs: Math.ceil(wallMs),
        avgVerifyMs: Math.ceil(avgVerifyMs),
        throughput: throughput.toFixed(2),
      });
    });
  }

  // -- Batch size sweep --

  for (const batchSize of [2, 4, 8]) {
    it(`batch_size sweep: 8 proofs, batch_size=${batchSize}, 8 cores`, async () => {
      const numProofs = 8;
      const numCores = 8;
      const proofs = Array.from({ length: numProofs }, () => ({ vkIndex: 0, proofFields: validProofFields }));

      const wallStart = performance.now();
      const results = await runBatchVerifier({ vks: [vk], numCores, batchSize, proofs });
      const wallMs = performance.now() - wallStart;

      expect(results).toHaveLength(numProofs);
      expect(results.every(r => r.valid)).toBe(true);

      const throughput = (numProofs / wallMs) * 1000;

      benchResults.push(
        { name: `BatchVerify/batch_size_${batchSize}/wall_time`, value: wallMs, unit: 'ms' },
        { name: `BatchVerify/batch_size_${batchSize}/throughput`, value: throughput, unit: 'proofs/sec' },
      );

      logger.info(`batch_size=${batchSize}`, { wallMs: Math.ceil(wallMs), throughput: throughput.toFixed(2) });
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

    const wallStart = performance.now();
    const results = await runBatchVerifier({ vks: [vk], numCores: 8, batchSize: 8, proofs });
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
  });
});
