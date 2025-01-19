import { makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import { makeBaseParityInputs, makeParityPublicInputs } from '@aztec/circuits.js/testing';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';

import { MockProver, TestBroker } from '../test/mock_prover.js';
import { BrokerCircuitProverFacade } from './broker_prover_facade.js';
import { InlineProofStore } from './proof_store/index.js';

describe('BrokerCircuitProverFacade', () => {
  let facade: BrokerCircuitProverFacade;
  let proofStore: InlineProofStore;
  let errorProofStore: InlineProofStore;
  let broker: TestBroker;
  let prover: MockProver;
  let agentPollInterval: number;

  beforeEach(async () => {
    proofStore = new InlineProofStore();
    errorProofStore = new InlineProofStore();
    prover = new MockProver();
    agentPollInterval = 100;
    broker = new TestBroker(2, prover, proofStore, agentPollInterval);
    facade = new BrokerCircuitProverFacade(broker, proofStore, errorProofStore);

    await broker.start();
    facade.start();
  });

  afterEach(async () => {
    await broker.stop();
    await facade.stop();
    jest.restoreAllMocks();
  });

  it('sends jobs to the broker', async () => {
    const inputs = makeBaseParityInputs();
    const controller = new AbortController();

    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getBaseParityProof');
    jest.spyOn(errorProofStore, 'saveProofInput');

    await expect(facade.getBaseParityProof(inputs, controller.signal, 42)).resolves.toBeDefined();

    expect(broker.enqueueProvingJob).toHaveBeenCalled();
    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs, expect.anything(), 42);
    expect(errorProofStore.saveProofInput).not.toHaveBeenCalled();
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

    // now we have 50 promises all waiting on the same result
    // resolve the proof
    const result = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
    resultPromise.resolve(result);

    await Promise.all(promises);

    // the broker will only have been told about one of the calls
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(1);

    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs, expect.anything(), 42);

    // enqueue another N requests for the same jobs
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getBaseParityProof(inputs, controller.signal, 42));
    }

    await Promise.all(promises);

    // the broker will have received one new request
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(2);
    // but no new jobs where created
    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(1);

    // and all requests will have been resolved with the same result
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
    jest.spyOn(errorProofStore, 'saveProofInput');

    // send N identical proof requests
    const CALLS = 50;
    for (let i = 0; i < CALLS; i++) {
      // wrap the error in a resolved promises so that we don't have unhandled rejections
      promises.push(facade.getBaseParityProof(inputs, controller.signal, 42).catch(err => ({ err })));
    }

    await sleep(agentPollInterval);

    resultPromise.reject(new Error('TEST ERROR'));

    await Promise.all(promises);

    // the broker should only have been called once
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(1);

    expect(prover.getBaseParityProof).toHaveBeenCalledWith(inputs, expect.anything(), 42);

    // enqueue another N requests for the same jobs
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getBaseParityProof(inputs, controller.signal, 42).catch(err => ({ err })));
    }

    // and all 2 * N requests will have been resolved with the same result
    for (const promise of promises) {
      await expect(promise).resolves.toEqual({ err: new Error('TEST ERROR') });
    }

    // the broker will have received one new request
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(2);
    // but no new jobs where created
    expect(prover.getBaseParityProof).toHaveBeenCalledTimes(1);
    // and the proof input will have been backed up
    expect(errorProofStore.saveProofInput).toHaveBeenCalled();
  });

  it('handles aborts', async () => {
    const inputs = makeBaseParityInputs();
    const controller = new AbortController();

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValue(resultPromise.promise);
    jest.spyOn(errorProofStore, 'saveProofInput');

    const promise = facade.getBaseParityProof(inputs, controller.signal, 42).catch(err => ({ err }));

    await sleep(agentPollInterval);
    expect(prover.getBaseParityProof).toHaveBeenCalled();

    controller.abort();

    await expect(promise).resolves.toEqual({ err: new Error('Aborted') });
    expect(errorProofStore.saveProofInput).not.toHaveBeenCalled();
  });

  it('rejects jobs when the facade is stopped', async () => {
    const inputs = makeBaseParityInputs();
    const controller = new AbortController();

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getBaseParityProof').mockReturnValue(resultPromise.promise);

    const promise = facade.getBaseParityProof(inputs, controller.signal, 42).catch(err => ({ err }));

    await facade.stop();

    await expect(promise).resolves.toEqual({ err: new Error('Broker facade stopped') });
  });
});
