import { AztecClientBackend, BackendType, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import { corruptProofFields, runBatchVerifier } from './batch_verifier_test_helpers.js';
import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:test:batch-verifier');

jest.setTimeout(300_000);

describe('Batch Chonk Verifier workloads', () => {
  let bb: Barretenberg;
  let validProofFields: Uint8Array[];
  let invalidProofFields: Uint8Array[];
  let vk: Uint8Array;
  let validProofFields2: Uint8Array[];
  let vk2: Uint8Array;

  beforeAll(async () => {
    bb = await Barretenberg.new({ backend: BackendType.NativeUnixSocket });
    await bb.initSRSChonk();

    logger.info('Generating simple proof...');
    const [bytecodes1, witnesses1, , vks1, circuitKinds1] = await generateTestingIVCStack(1, 0);
    const backend1 = new AztecClientBackend(bytecodes1, bb, [], circuitKinds1);
    const { proofFields: proofFields1, vk: generatedVk1 } = await backend1.prove(witnesses1, vks1);
    validProofFields = proofFields1;
    invalidProofFields = corruptProofFields(validProofFields);
    vk = generatedVk1;

    logger.info('Generating complex proof...');
    const [bytecodes2, witnesses2, , vks2, circuitKinds2] = await generateTestingIVCStack(1, 1);
    const backend2 = new AztecClientBackend(bytecodes2, bb, [], circuitKinds2);
    const { proofFields: proofFields2, vk: generatedVk2 } = await backend2.prove(witnesses2, vks2);
    validProofFields2 = proofFields2;
    vk2 = generatedVk2;

    logger.info('Proofs generated, ready for batch tests');
  });

  afterAll(async () => {
    await bb.destroy();
  });

  it('should flush a single proof without waiting for a full batch', async () => {
    const results = await runBatchVerifier({
      vks: [vk],
      numCores: 0,
      batchSize: 4,
      proofs: [{ vkIndex: 0, proofFields: validProofFields }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].valid).toBe(true);
  });

  it('should verify multiple proofs in parallel', async () => {
    const results = await runBatchVerifier({
      vks: [vk],
      numCores: 0,
      batchSize: 8,
      proofs: Array.from({ length: 4 }, () => ({ vkIndex: 0, proofFields: validProofFields })),
    });
    expect(results).toHaveLength(4);
    expect(results.every(r => r.valid)).toBe(true);
  });

  it('should handle mixed valid and invalid proofs in one batch', async () => {
    const results = await runBatchVerifier({
      vks: [vk],
      numCores: 0,
      batchSize: 8,
      proofs: [
        { vkIndex: 0, proofFields: validProofFields },
        { vkIndex: 0, proofFields: invalidProofFields },
        { vkIndex: 0, proofFields: validProofFields },
        { vkIndex: 0, proofFields: invalidProofFields },
        { vkIndex: 0, proofFields: validProofFields },
      ],
    });
    expect(results).toHaveLength(5);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[2].valid).toBe(true);
    expect(results[3].valid).toBe(false);
    expect(results[4].valid).toBe(true);
  });

  it('should verify proofs with multiple VKs', async () => {
    const results = await runBatchVerifier({
      vks: [vk, vk2],
      numCores: 0,
      batchSize: 8,
      proofs: [
        { vkIndex: 0, proofFields: validProofFields },
        { vkIndex: 1, proofFields: validProofFields2 },
        { vkIndex: 0, proofFields: validProofFields },
        { vkIndex: 1, proofFields: validProofFields2 },
      ],
    });
    expect(results).toHaveLength(4);
    expect(results.every(r => r.valid)).toBe(true);
  });
});
