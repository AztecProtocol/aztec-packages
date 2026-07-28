import { RECURSIVE_PROOF_LENGTH } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryFastUntil } from '@aztec/foundation/retry';
import { type ProvingJobStatus, makePublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { makeRecursiveProof } from '@aztec/stdlib/proofs';
import { makeInboxParityPrivateInputs, makeParityPublicInputs } from '@aztec/stdlib/testing';
import { VerificationKeyData } from '@aztec/stdlib/vks';

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
    const inputs = makeInboxParityPrivateInputs();
    const controller = new AbortController();

    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getInboxParityProof');
    jest.spyOn(errorProofStore, 'saveProofInput');

    await expect(facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42))).resolves.toBeDefined();

    expect(broker.enqueueProvingJob).toHaveBeenCalled();
    expect(prover.getInboxParityProof).toHaveBeenCalledWith(inputs, expect.anything(), EpochNumber(42));
    expect(errorProofStore.saveProofInput).not.toHaveBeenCalled();
  });

  it('does not retain the inputs URI for in-flight jobs when no failed-proof store is configured', async () => {
    // With no failed-proof store there is no consumer for the retained inputs URI (only
    // `backupFailedProofInputs` reads it). With the default InlineProofStore that URI embeds the full
    // circuit inputs, so the facade must not pin it in memory for the in-flight window.
    // Stop the shared facade so it doesn't drain this job's completion notification from the broker,
    // which would otherwise force this facade onto the slow full-snapshot sync path.
    await facade.stop();
    const facadeNoFailedStore = new BrokerCircuitProverFacade(broker, proofStore);
    facadeNoFailedStore.start();
    try {
      const inputs = makeInboxParityPrivateInputs();
      const controller = new AbortController();

      const resultPromise = promiseWithResolvers<any>();
      const enqueueSpy = jest.spyOn(broker, 'enqueueProvingJob');
      jest.spyOn(prover, 'getInboxParityProof').mockReturnValue(resultPromise.promise);

      const proofPromise = facadeNoFailedStore.getInboxParityProof(inputs, controller.signal, EpochNumber(42));

      // Wait until the job has been sent to the broker — past the point where the URI would be retained.
      await retryFastUntil(() => enqueueSpy.mock.calls.length > 0, 'job to be enqueued');

      // The broker still receives the inputs URI...
      const enqueued = enqueueSpy.mock.calls[0][0] as { inputsUri?: string };
      expect(enqueued.inputsUri).toBeTruthy();

      // ...but the facade does not hold onto it for the in-flight job.
      const jobs = (facadeNoFailedStore as any).jobs as Map<string, { inputsUri?: string }>;
      expect(jobs.size).toBe(1);
      expect([...jobs.values()][0].inputsUri).toBeUndefined();

      // The job still completes normally.
      const result = makePublicInputsAndRecursiveProof(
        makeParityPublicInputs(),
        makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
        VerificationKeyData.makeFakeHonk(),
      );
      resultPromise.resolve(result);
      await expect(proofPromise).resolves.toEqual(result);
    } finally {
      await facadeNoFailedStore.stop();
    }
  });

  it('handles multiple calls for the same job', async () => {
    const inputs = makeInboxParityPrivateInputs();
    const controller = new AbortController();
    const promises: Promise<any>[] = [];

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getInboxParityProof').mockReturnValue(resultPromise.promise);

    // send N identical proof requests
    const CALLS = 50;
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42)));
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

    expect(prover.getInboxParityProof).toHaveBeenCalledWith(inputs, expect.anything(), EpochNumber(42));

    // enqueue another N requests for the same jobs
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42)));
    }

    await Promise.all(promises);

    // the broker will have received one new request
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(2);
    // but no new jobs where created
    expect(prover.getInboxParityProof).toHaveBeenCalledTimes(1);

    // and all requests will have been resolved with the same result
    for (const promise of promises) {
      await expect(promise).resolves.toEqual(result);
    }
  });

  it('handles proof errors', async () => {
    const inputs = makeInboxParityPrivateInputs();
    const controller = new AbortController();
    const promises: Promise<any>[] = [];

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    const getInboxParityProofSpy = jest.spyOn(prover, 'getInboxParityProof').mockReturnValue(resultPromise.promise);
    jest.spyOn(errorProofStore, 'saveProofInput');

    // send N identical proof requests
    const CALLS = 50;
    for (let i = 0; i < CALLS; i++) {
      // wrap the error in a resolved promises so that we don't have unhandled rejections
      promises.push(facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42)).catch(err => ({ err })));
    }

    await retryFastUntil(() => getInboxParityProofSpy.mock.calls.length > 0, 'prover to be called');

    resultPromise.reject(new Error('TEST ERROR'));

    await Promise.all(promises);

    // the broker should only have been called once
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(1);

    expect(prover.getInboxParityProof).toHaveBeenCalledWith(inputs, expect.anything(), EpochNumber(42));

    // enqueue another N requests for the same jobs
    for (let i = 0; i < CALLS; i++) {
      promises.push(facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42)).catch(err => ({ err })));
    }

    // and all 2 * N requests will have been resolved with the same result
    for (const promise of promises) {
      await expect(promise).resolves.toEqual({ err: new Error('TEST ERROR') });
    }

    // the broker will have received one new request
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(2);
    // but no new jobs where created
    expect(prover.getInboxParityProof).toHaveBeenCalledTimes(1);
    // and the proof input will have been backed up
    expect(errorProofStore.saveProofInput).toHaveBeenCalled();
  });

  it('handles aborts', async () => {
    const inputs = makeInboxParityPrivateInputs();
    const controller = new AbortController();

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    const getInboxParityProofSpy = jest.spyOn(prover, 'getInboxParityProof').mockReturnValue(resultPromise.promise);
    jest.spyOn(errorProofStore, 'saveProofInput');

    const promise = facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42)).catch(err => ({ err }));

    await retryFastUntil(() => getInboxParityProofSpy.mock.calls.length > 0, 'prover to be called');

    controller.abort();

    await expect(promise).resolves.toEqual({ err: new Error('Aborted') });
    expect(errorProofStore.saveProofInput).not.toHaveBeenCalled();
  });

  it('rejects jobs when the facade is stopped', async () => {
    const inputs = makeInboxParityPrivateInputs();
    const controller = new AbortController();

    const resultPromise = promiseWithResolvers<any>();
    jest.spyOn(broker, 'enqueueProvingJob');
    jest.spyOn(prover, 'getInboxParityProof').mockReturnValue(resultPromise.promise);

    const promise = facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42)).catch(err => ({ err }));

    await facade.stop();

    await expect(promise).resolves.toEqual({ err: new Error('Broker facade stopped') });
  });

  // Regression test for #13166
  it('handles stopping while sending a proof to the broker', async () => {
    const inputs = makeInboxParityPrivateInputs();
    const controller = new AbortController();

    // make sure the job hangs on waiting for the broker
    const enqueueJobPromise = promiseWithResolvers<ProvingJobStatus>();
    const enqueueProvingJobSpy = jest.spyOn(broker, 'enqueueProvingJob').mockReturnValue(enqueueJobPromise.promise);
    const promise = facade.getInboxParityProof(inputs, controller.signal, EpochNumber(42));

    // now stop the facade after giving it time, which will trigger a rejection
    await retryFastUntil(() => enqueueProvingJobSpy.mock.calls.length > 0, 'broker to be called');
    await facade.stop();

    // and expect we don't blow up the entire node process
    enqueueJobPromise.resolve({ status: 'in-queue' });
    await expect(promise).rejects.toThrow('Broker facade stopped');
  });
});
