/**
 * Batch chonk verifier queue robustness tests.
 *
 * Exercises edge cases: sub-batch flush, single proof, degenerate batch sizes,
 * all-invalid, mixed valid/invalid with bisection, sequential start/stop cycles,
 * and core count extremes.
 *
 * All tests exercise the full BatchChonkVerifier TS class (not raw bb.js).
 */
import { BatchChonkVerifier } from '@aztec/bb-prover';
import { AztecClientBackend, BackendType, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import { corruptProofFields, runBatchVerifier } from './batch_verifier_test_helpers.js';
import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:test:batch-verifier-queue');

jest.setTimeout(600_000);

describe('Batch Chonk Verifier Queue', () => {
  let bb: Barretenberg;
  let validProofFields: Uint8Array[];
  let invalidProofFields: Uint8Array[];
  let vk: Uint8Array;

  beforeAll(async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket });
    await bb.initSRSChonk();

    logger.info('Generating proof for tests...');
    const [bytecodes, witnesses, , vks] = await generateTestingIVCStack(1, 0);
    const backend = new AztecClientBackend(bytecodes, bb);
    const { proofFields, vk: generatedVk } = await backend.prove(witnesses, vks);
    validProofFields = proofFields;
    invalidProofFields = corruptProofFields(validProofFields);
    vk = generatedVk;
    logger.info('Proof generated');
  });

  afterAll(async () => {
    await bb.destroy();
  });

  /** Shorthand for runBatchVerifier with common config. */
  function run(opts: {
    numCores?: number;
    batchSize?: number;
    proofs: { vkIndex: number; proofFields: Uint8Array[] }[];
  }) {
    return runBatchVerifier({
      vks: [vk],
      numCores: opts.numCores ?? 4,
      batchSize: opts.batchSize ?? 8,
      proofs: opts.proofs,
    });
  }

  // -- Basic cases --

  it('single valid proof', async () => {
    const results = await run({
      proofs: [{ vkIndex: 0, proofFields: validProofFields }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].valid).toBe(true);
  });

  it('single invalid proof', async () => {
    const results = await run({
      proofs: [{ vkIndex: 0, proofFields: invalidProofFields }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].valid).toBe(false);
  });

  // -- Sub-batch flush: N < batch_size --

  for (const n of [1, 2, 3, 5, 7]) {
    it(`flushes ${n} proof(s) with batch_size=8`, async () => {
      const proofs = Array.from({ length: n }, () => ({ vkIndex: 0, proofFields: validProofFields }));
      const results = await run({ proofs });
      expect(results).toHaveLength(n);
      expect(results.every(r => r.valid)).toBe(true);
    });
  }

  // -- Exact batch boundary --

  it('N exactly equals batch_size', async () => {
    const results = await run({
      batchSize: 4,
      proofs: Array.from({ length: 4 }, () => ({ vkIndex: 0, proofFields: validProofFields })),
    });
    expect(results).toHaveLength(4);
    expect(results.every(r => r.valid)).toBe(true);
  });

  it('N is one more than batch_size', async () => {
    const results = await run({
      batchSize: 4,
      proofs: Array.from({ length: 5 }, () => ({ vkIndex: 0, proofFields: validProofFields })),
    });
    expect(results).toHaveLength(5);
    expect(results.every(r => r.valid)).toBe(true);
  });

  // -- Degenerate batch_size=1 (every proof is its own batch) --

  it('batch_size=1 verifies each proof individually', async () => {
    const results = await run({
      batchSize: 1,
      proofs: [
        { vkIndex: 0, proofFields: validProofFields },
        { vkIndex: 0, proofFields: invalidProofFields },
        { vkIndex: 0, proofFields: validProofFields },
        { vkIndex: 0, proofFields: invalidProofFields },
      ],
    });
    expect(results).toHaveLength(4);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[2].valid).toBe(true);
    expect(results[3].valid).toBe(false);
  });

  // -- All invalid --

  it('all proofs invalid', async () => {
    const proofs = Array.from({ length: 8 }, () => ({ vkIndex: 0, proofFields: invalidProofFields }));
    const results = await run({ batchSize: 4, proofs });
    expect(results).toHaveLength(8);
    expect(results.every(r => !r.valid)).toBe(true);
  });

  // -- Mixed valid/invalid with bisection --

  it('1 bad out of 8 (bisection identifies it)', async () => {
    const proofs = Array.from({ length: 8 }, (_, i) => ({
      vkIndex: 0,
      proofFields: i === 3 ? invalidProofFields : validProofFields,
    }));
    const results = await run({ batchSize: 8, proofs });
    expect(results).toHaveLength(8);
    expect(results[3].valid).toBe(false);
    expect(results.filter(r => r.valid)).toHaveLength(7);
  });

  it('bad proofs at batch boundaries', async () => {
    const proofs = Array.from({ length: 8 }, (_, i) => ({
      vkIndex: 0,
      proofFields: i === 0 || i === 4 ? invalidProofFields : validProofFields,
    }));
    const results = await run({ batchSize: 4, proofs });
    expect(results).toHaveLength(8);
    expect(results[0].valid).toBe(false);
    expect(results[4].valid).toBe(false);
    expect(results.filter(r => r.valid)).toHaveLength(6);
  });

  it('half bad proofs', async () => {
    const proofs = Array.from({ length: 16 }, (_, i) => ({
      vkIndex: 0,
      proofFields: i % 2 === 0 ? invalidProofFields : validProofFields,
    }));
    const results = await run({ numCores: 8, batchSize: 8, proofs });
    expect(results).toHaveLength(16);
    expect(results.filter(r => r.valid)).toHaveLength(8);
    expect(results.filter(r => !r.valid)).toHaveLength(8);
  });

  // -- Core count extremes --

  it('works with numCores=1', async () => {
    const proofs = Array.from({ length: 4 }, () => ({ vkIndex: 0, proofFields: validProofFields }));
    const results = await run({ numCores: 1, batchSize: 4, proofs });
    expect(results).toHaveLength(4);
    expect(results.every(r => r.valid)).toBe(true);
  });

  it('16 cores, batch_size=16, 32 proofs', async () => {
    const proofs = Array.from({ length: 32 }, () => ({ vkIndex: 0, proofFields: validProofFields }));
    const results = await run({ numCores: 16, batchSize: 16, proofs });
    expect(results).toHaveLength(32);
    expect(results.every(r => r.valid)).toBe(true);
  });

  // -- Sequential start/stop cycles --

  it('can start, verify, stop, then start again', async () => {
    const results1 = await run({
      batchSize: 4,
      proofs: Array.from({ length: 4 }, () => ({ vkIndex: 0, proofFields: validProofFields })),
    });
    expect(results1).toHaveLength(4);
    expect(results1.every(r => r.valid)).toBe(true);

    const results2 = await run({
      numCores: 8,
      batchSize: 2,
      proofs: [
        { vkIndex: 0, proofFields: validProofFields },
        { vkIndex: 0, proofFields: invalidProofFields },
        { vkIndex: 0, proofFields: validProofFields },
      ],
    });
    expect(results2).toHaveLength(3);
    expect(results2[0].valid).toBe(true);
    expect(results2[1].valid).toBe(false);
    expect(results2[2].valid).toBe(true);
  });

  it('stop drains proof requests accepted before shutdown', async () => {
    const verifier = await BatchChonkVerifier.newForTesting({ bbChonkVerifyConcurrency: 1 }, [vk], 8);
    const promises = Array.from({ length: 4 }, () => verifier.enqueueProof(0, validProofFields));

    const stopPromise = verifier.stop();
    const results = await Promise.all(promises);
    await stopPromise;

    expect(results).toHaveLength(4);
    expect(results.every(r => r.valid)).toBe(true);
  });

  // -- Random bisection patterns --

  /** Simple seeded PRNG for deterministic randomness in tests. */
  function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  for (const { totalProofs, batchSize, numBad, seed } of [
    { totalProofs: 8, batchSize: 8, numBad: 1, seed: 42 },
    { totalProofs: 8, batchSize: 8, numBad: 3, seed: 123 },
    { totalProofs: 8, batchSize: 4, numBad: 2, seed: 999 },
    { totalProofs: 12, batchSize: 4, numBad: 4, seed: 7 },
    { totalProofs: 16, batchSize: 8, numBad: 5, seed: 314 },
    { totalProofs: 6, batchSize: 3, numBad: 3, seed: 271 },
    { totalProofs: 10, batchSize: 10, numBad: 1, seed: 555 },
    { totalProofs: 4, batchSize: 2, numBad: 4, seed: 0 },
  ]) {
    it(`random pattern: ${numBad} bad in ${totalProofs}, batchSize=${batchSize}, seed=${seed}`, async () => {
      const rng = seededRandom(seed);
      const indices = Array.from({ length: totalProofs }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const badIndices = new Set(indices.slice(0, numBad));

      const proofs = Array.from({ length: totalProofs }, (_, i) => ({
        vkIndex: 0,
        proofFields: badIndices.has(i) ? invalidProofFields : validProofFields,
      }));

      const results = await run({ batchSize, proofs });
      expect(results).toHaveLength(totalProofs);

      for (let i = 0; i < totalProofs; i++) {
        expect(results[i].valid).toBe(!badIndices.has(i));
      }
    });
  }
});
