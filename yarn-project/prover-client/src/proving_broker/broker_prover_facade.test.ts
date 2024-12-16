import { makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import { makeBaseParityInputs, makeParityPublicInputs } from '@aztec/circuits.js/testing';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';

import { MockProver, TestBroker } from '../test/mock_prover.js';
import { BrokerCircuitProverFacade } from './broker_prover_facade.js';
import { InlineProofStore } from './proof_store.js';

describe('BrokerCircuitProverFacade', () => {
  let facade: BrokerCircuitProverFacade;
  let proofStore: InlineProofStore;
  let broker: TestBroker;
  let prover: MockProver;
  let agentPollInterval: number;

  beforeEach(async () => {
    proofStore = new InlineProofStore();
    prover = new MockProver();
    agentPollInterval = 100;
    broker = new TestBroker(2, prover, proofStore, agentPollInterval);
    facade = new BrokerCircuitProverFacade(broker, proofStore);

    await broker.start();
  });

  it('sends jobs to the broker', async () => {
    const inputs = makeBaseParityInputs();
    const controller = new AbortController();

    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getBaseParityProof');

    await expect(facade.getBaseParityProof(inputs, controller.signal, 42)).resolves.toBeDefined();

    expect(broker.enqueueProvingJob).toHaveBeenCalled();
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs, expect.anything(), 42);
  });

  it('handles multiple calls for the same job', async () => {
    const inputs = makeBaseParityInputs();
    const controller = new AbortController();
    const promises: Promise<any>[] = [];

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValue(resultPromise.promise);

    // send N identical proof requests
    const CALLS = 50;
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getBaseParityProof(inputs, controller.signal, 42));
    }

    await sleep(agentPollInterval);
    // the broker should have received all of them
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(CALLS);

    // but really, it should have only enqueued just one
    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(1);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs, expect.anything(), 42);

    // now we have 50 promises all waiting on the same result
    // resolve the proof
    const result = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
    resultPromise.resolve(result);

    // enqueue another N requests for the same jobs
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getBaseParityProof(inputs, controller.signal, 42));
    }

    await sleep(agentPollInterval);
    // the broker will have received the new requests
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(2 * CALLS);
    // but no new jobs where created
    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(1);

    // and all 2 * N requests will have been resolved with the same result
    for (const promise of promises) {
      await expect(promise).resolves.toEqual(result);
    }
  });

  it('handles proof errors', async () => {
    const inputs = makeBaseParityInputs();
    const controller = new AbortController();
    const promises: Promise<any>[] = [];

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValue(resultPromise.promise);

    // send N identical proof requests
    const CALLS = 50;
    for (let i = 0; i < CALLS; i++) {
      // wrap the error in a resolved promises so that we don't have unhandled rejections
      promises.push(facade.getBaseParityProof(inputs, controller.signal, 42).catch(err => ({ err })));
    }

    await sleep(agentPollInterval);
    // the broker should have received all of them
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(CALLS);

    // but really, it should have only enqueued just one
    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(1);
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs, expect.anything(), 42);

    resultPromise.reject(new Error('TEST ERROR'));

    // enqueue another N requests for the same jobs
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getBaseParityProof(inputs, controller.signal, 42).catch(err => ({ err })));
    }

    await sleep(agentPollInterval);
    // the broker will have received the new requests
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(2 * CALLS);
    // but no new jobs where created
    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(1);

    // and all 2 * N requests will have been resolved with the same result
    for (const promise of promises) {
      await expect(promise).resolves.toEqual({ err: new Error('TEST ERROR') });
    }
  });

  it('handles aborts', async () => {
    const inputs = makeBaseParityInputs();
    const controller = new AbortController();

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValue(resultPromise.promise);

    const promise = facade.getBaseParityProof(inputs, controller.signal, 42).catch(err => ({ err }));

    await sleep(agentPollInterval);
    expect(prover.getBaseParityProof).toHaveBeenCalled();

    controller.abort();

    await expect(promise).resolves.toEqual({ err: new Error('Aborted') });
  });
});
