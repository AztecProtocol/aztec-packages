import { type ServerCircuitProver, makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import { makeBaseParityInputs, makeParityPublicInputs } from '@aztec/circuits.js/testing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { MemoryProvingQueue } from './memory-proving-queue.js';
import { ProverAgent } from './prover-agent.js';

describe('ProverAgent', () => {
  let queue: MemoryProvingQueue;
  let agent: ProverAgent;
  let prover: MockProxy<ServerCircuitProver>;

  beforeEach(() => {
    prover = mock<ServerCircuitProver>();
    queue = new MemoryProvingQueue(getTelemetryClient());
    agent = new ProverAgent(prover);
  });

  beforeEach(() => {
    queue.start();
    agent.start(queue);
  });

  afterEach(async () => {
    await agent.stop();
    await queue.stop();
  });

  it('takes jobs from the queue', async () => {
    const publicInputs = makeParityPublicInputs();
    const proof = makeRecursiveProof<typeof RECURSIVE_PROOF_LENGTH>(RECURSIVE_PROOF_LENGTH);
    const vk = VerificationKeyData.makeFakeHonk();
    prover.getBaseParityProof.mockResolvedValue(makePublicInputsAndRecursiveProof(publicInputs, proof, vk));

    const inputs = makeBaseParityInputs();

    const promise = queue.getBaseParityProof(inputs);
    await expect(promise).resolves.toEqual(makePublicInputsAndRecursiveProof(publicInputs, proof, vk));

    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs);
  });

  it('reports errors', async () => {
    const error = new Error('test error');
    prover.getBaseParityProof.mockRejectedValue(error);

    const inputs = makeBaseParityInputs();
    const promise = queue.getBaseParityProof(inputs);

    await expect(promise).rejects.toEqual(error);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs);
  });

  it('continues to process jobs', async () => {
    const publicInputs = makeParityPublicInputs();
    const proof = makeRecursiveProof<typeof RECURSIVE_PROOF_LENGTH>(RECURSIVE_PROOF_LENGTH);
    const vk = VerificationKeyData.makeFakeHonk();
    prover.getBaseParityProof.mockResolvedValue(makePublicInputsAndRecursiveProof(publicInputs, proof, vk));

    const inputs = makeBaseParityInputs();
    const promise1 = queue.getBaseParityProof(inputs);

    await expect(promise1).resolves.toEqual(makePublicInputsAndRecursiveProof(publicInputs, proof, vk));

    const inputs2 = makeBaseParityInputs();
    const promise2 = queue.getBaseParityProof(inputs2);

    await expect(promise2).resolves.toEqual(makePublicInputsAndRecursiveProof(publicInputs, proof, vk));

    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(2);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs2);
  });
});
