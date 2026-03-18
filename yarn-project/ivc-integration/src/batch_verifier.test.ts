import { AztecClientBackend, BackendType, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import { corruptProofFields, createFifo, readFifoResults } from './batch_verifier_test_helpers.js';
import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:test:batch-verifier');

jest.setTimeout(300_000);

describe('Batch Chonk Verifier workloads', () => {
  let bb: Barretenberg;
  // Cache a proof + VK so we don't re-prove for every test
  let validProofFields: Uint8Array[];
  let invalidProofFields: Uint8Array[];
  let vk: Uint8Array;
  // Second proof from a different circuit stack (complex tx with reader app)
  let validProofFields2: Uint8Array[];
  let vk2: Uint8Array;

  beforeAll(async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket });
    await bb.initSRSChonk();

    // Generate proof from simple tx (1 creator, 0 readers)
    logger.info('Generating simple proof...');
    const [bytecodes1, witnesses1, , vks1] = await generateTestingIVCStack(1, 0);
    const backend1 = new AztecClientBackend(bytecodes1, bb);
    const [proofFields1, , generatedVk1] = await backend1.prove(witnesses1, vks1);
    validProofFields = proofFields1;
    invalidProofFields = corruptProofFields(validProofFields);
    vk = generatedVk1;

    // Generate proof from complex tx (1 creator, 1 reader) — different circuit stack, same VK type
    logger.info('Generating complex proof...');
    const [bytecodes2, witnesses2, , vks2] = await generateTestingIVCStack(1, 1);
    const backend2 = new AztecClientBackend(bytecodes2, bb);
    const [proofFields2, , generatedVk2] = await backend2.prove(witnesses2, vks2);
    validProofFields2 = proofFields2;
    vk2 = generatedVk2;

    logger.info('Proofs generated, ready for batch tests');
  });

  afterAll(async () => {
    await bb.destroy();
  });

  it('should flush a single proof without waiting for a full batch', async () => {
    const { fifoPath, cleanup } = await createFifo('single');

    try {
      // batch_size=4 but we only queue 1 proof — must not hang
      await bb.chonkBatchVerifierStart({
        vks: [vk],
        numCores: 0,
        batchSize: 4,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, 1);

      await bb.chonkBatchVerifierQueue({
        requestId: 7,
        vkIndex: 0,
        proofFields: validProofFields,
      });

      // Don't call stop — the coordinator processes immediately when idle
      const results = await resultPromise;

      expect(results).toHaveLength(1);
      expect(results[0].request_id).toBe(7);
      expect(results[0].status).toBe(0);

      logger.info('Single-proof flush test passed', {
        verifyMs: Math.ceil(results[0].time_in_verify_ms),
      });

      await bb.chonkBatchVerifierStop({});
    } finally {
      await cleanup();
    }
  });

  it('should verify multiple proofs in parallel', async () => {
    const numProofs = 4;
    const { fifoPath, cleanup } = await createFifo('parallel');

    try {
      await bb.chonkBatchVerifierStart({
        vks: [vk],
        numCores: 0,
        batchSize: 8,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, numProofs);

      // Queue all proofs
      for (let i = 0; i < numProofs; i++) {
        await bb.chonkBatchVerifierQueue({
          requestId: i,
          vkIndex: 0,
          proofFields: validProofFields,
        });
      }

      await bb.chonkBatchVerifierStop({});
      const results = await resultPromise;

      expect(results).toHaveLength(numProofs);
      const resultsByRequestId = new Map(results.map(r => [r.request_id, r]));
      for (let i = 0; i < numProofs; i++) {
        const r = resultsByRequestId.get(i);
        expect(r).toBeDefined();
        expect(r!.status).toBe(0);
      }

      logger.info(`Parallel test: ${numProofs} proofs verified`, {
        verifyTimes: results.map(r => Math.ceil(r.time_in_verify_ms)),
      });
    } finally {
      await cleanup();
    }
  });

  it('should handle mixed valid and invalid proofs in one batch', async () => {
    const { fifoPath, cleanup } = await createFifo('mixed');

    // Interleave valid and invalid proofs
    const proofs: { id: number; proofFields: Uint8Array[]; expectedStatus: number }[] = [
      { id: 0, proofFields: validProofFields, expectedStatus: 0 },
      { id: 1, proofFields: invalidProofFields, expectedStatus: 1 },
      { id: 2, proofFields: validProofFields, expectedStatus: 0 },
      { id: 3, proofFields: invalidProofFields, expectedStatus: 1 },
      { id: 4, proofFields: validProofFields, expectedStatus: 0 },
    ];

    try {
      await bb.chonkBatchVerifierStart({
        vks: [vk],
        numCores: 0,
        batchSize: 8,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, proofs.length);

      for (const p of proofs) {
        await bb.chonkBatchVerifierQueue({
          requestId: p.id,
          vkIndex: 0,
          proofFields: p.proofFields,
        });
      }

      await bb.chonkBatchVerifierStop({});
      const results = await resultPromise;

      expect(results).toHaveLength(proofs.length);
      const resultsByRequestId = new Map(results.map(r => [r.request_id, r]));

      for (const p of proofs) {
        const r = resultsByRequestId.get(p.id);
        expect(r).toBeDefined();
        expect(r!.status).toBe(p.expectedStatus);
      }

      const numValid = results.filter(r => r.status === 0).length;
      const numInvalid = results.filter(r => r.status === 1).length;
      logger.info(`Mixed test: ${numValid} valid, ${numInvalid} invalid`);
    } finally {
      await cleanup();
    }
  });

  it('should verify proofs with multiple VKs', async () => {
    const { fifoPath, cleanup } = await createFifo('multi-vk');

    try {
      // Register both VKs
      await bb.chonkBatchVerifierStart({
        vks: [vk, vk2],
        numCores: 0,
        batchSize: 8,
        fifoPath,
      });

      const resultPromise = readFifoResults(fifoPath, 4);

      // Queue proofs against their respective VKs
      await bb.chonkBatchVerifierQueue({ requestId: 0, vkIndex: 0, proofFields: validProofFields });
      await bb.chonkBatchVerifierQueue({ requestId: 1, vkIndex: 1, proofFields: validProofFields2 });
      await bb.chonkBatchVerifierQueue({ requestId: 2, vkIndex: 0, proofFields: validProofFields });
      await bb.chonkBatchVerifierQueue({ requestId: 3, vkIndex: 1, proofFields: validProofFields2 });

      await bb.chonkBatchVerifierStop({});
      const results = await resultPromise;

      expect(results).toHaveLength(4);
      const resultsByRequestId = new Map(results.map(r => [r.request_id, r]));
      for (let i = 0; i < 4; i++) {
        const r = resultsByRequestId.get(i);
        expect(r).toBeDefined();
        expect(r!.status).toBe(0);
      }

      logger.info('Multi-VK test: all 4 proofs verified with correct VKs');
    } finally {
      await cleanup();
    }
  });
});
