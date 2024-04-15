import { makeBaseParityInputs, makeParityPublicInputs, makeProof } from '@aztec/circuits.js/testing';
import { promiseWithCallback } from '@aztec/foundation/promise';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type CircuitProver } from '../prover/interface.js';
import { LocalProvingAgent } from './local-proving-agent.js';
import { MemoryProvingQueue } from './memory-proving-queue.js';
import { type ProvingAgent } from './prover-agent.js';
import { type ProvingQueue } from './proving-queue.js';
import { ProvingRequestType } from './proving-request.js';

describe('LocalProvingAgent', () => {
  let queue: ProvingQueue;
  let agent: ProvingAgent;
  let prover: MockProxy<CircuitProver>;

  beforeEach(() => {
    prover = mock<CircuitProver>();
    queue = new MemoryProvingQueue();
    agent = new LocalProvingAgent(prover);
  });

  beforeEach(() => {
    agent.start(queue);
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('takes jobs from the queue', async () => {
    const publicInputs = makeParityPublicInputs();
    const proof = makeProof();
    prover.getBaseParityProof.mockResolvedValue([publicInputs, proof]);

    const inputs = makeBaseParityInputs();
    const [promise, cb] = promiseWithCallback();
    queue.submitProvingRequest(
      {
        type: ProvingRequestType.BASE_PARITY,
        inputs,
      },
      cb,
    );

    await expect(promise).resolves.toEqual([publicInputs, proof]);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs);
  });

  it('reports errors', async () => {
    const error = new Error('test error');
    prover.getBaseParityProof.mockRejectedValue(error);

    const inputs = makeBaseParityInputs();
    const [promise, cb] = promiseWithCallback();
    queue.submitProvingRequest(
      {
        type: ProvingRequestType.BASE_PARITY,
        inputs,
      },
      cb,
    );

    await expect(promise).rejects.toEqual(error);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs);
  });

  it('continues to process jobs', async () => {
    const publicInputs = makeParityPublicInputs();
    const proof = makeProof();
    prover.getBaseParityProof.mockResolvedValue([publicInputs, proof]);

    const inputs = makeBaseParityInputs();
    const [promise1, cb1] = promiseWithCallback();
    queue.submitProvingRequest(
      {
        type: ProvingRequestType.BASE_PARITY,
        inputs,
      },
      cb1,
    );

    await expect(promise1).resolves.toEqual([publicInputs, proof]);

    const inputs2 = makeBaseParityInputs();
    const [promise2, cb2] = promiseWithCallback();
    queue.submitProvingRequest(
      {
        type: ProvingRequestType.BASE_PARITY,
        inputs: inputs2,
      },
      cb2,
    );

    await expect(promise2).resolves.toEqual([publicInputs, proof]);

    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(2);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs2);
  });
});
