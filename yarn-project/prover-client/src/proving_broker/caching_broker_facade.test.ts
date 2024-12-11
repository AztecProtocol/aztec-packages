import { type ProvingJobProducer, ProvingRequestType, makePublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeRecursiveProof } from '@aztec/circuits.js';
import { makeBaseParityInputs, makeParityPublicInputs } from '@aztec/circuits.js/testing';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CachingBrokerFacade } from './caching_broker_facade.js';
import { InlineProofStore } from './proof_store.js';
import { InMemoryProverCache } from './prover_cache/memory.js';

describe('CachingBrokerFacade', () => {
  let facade: CachingBrokerFacade;
  let cache: InMemoryProverCache;
  let proofStore: InlineProofStore;
  let broker: MockProxy<ProvingJobProducer>;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    broker = mock<ProvingJobProducer>({
      enqueueProvingJob: jest.fn<any>(),
      getProvingJobStatus: jest.fn<any>(),
      removeAndCancelProvingJob: jest.fn<any>(),
      waitForJobToSettle: jest.fn<any>(),
    });
    cache = new InMemoryProverCache();
    proofStore = new InlineProofStore();
    facade = new CachingBrokerFacade(broker, cache, proofStore);
  });

  it('marks job as in progress', async () => {
    const controller = new AbortController();
    void facade.getBaseParityProof(makeBaseParityInputs(), controller.signal);

    await jest.advanceTimersToNextTimerAsync();

    expect(broker.enqueueProvingJob).toHaveBeenCalled();
    const job = broker.enqueueProvingJob.mock.calls[0][0];

    await expect(cache.getProvingJobStatus(job.id)).resolves.toEqual({ status: 'in-queue' });
    controller.abort();
  });

  it('removes the cached value if a job fails to enqueue', async () => {
    const { promise, reject } = promiseWithResolvers<any>();
    broker.enqueueProvingJob.mockResolvedValue(promise);

    void facade.getBaseParityProof(makeBaseParityInputs()).catch(() => {});
    await jest.advanceTimersToNextTimerAsync();

    const job = broker.enqueueProvingJob.mock.calls[0][0];

    reject(new Error('Failed to enqueue job'));

    await jest.advanceTimersToNextTimerAsync();
    await expect(cache.getProvingJobStatus(job.id)).resolves.toEqual({ status: 'not-found' });
  });

  it('awaits existing job if in progress', async () => {
    const inputs = makeBaseParityInputs();
    void facade.getBaseParityProof(inputs).catch(() => {});
    await jest.advanceTimersToNextTimerAsync();
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(1);

    void facade.getBaseParityProof(inputs).catch(() => {});
    await jest.advanceTimersToNextTimerAsync();
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(1);
  });

  it('reuses already cached results', async () => {
    const { promise, resolve } = promiseWithResolvers<any>();
    broker.enqueueProvingJob.mockResolvedValue(Promise.resolve());
    broker.waitForJobToSettle.mockResolvedValue(promise);

    const inputs = makeBaseParityInputs();
    void facade.getBaseParityProof(inputs);
    await jest.advanceTimersToNextTimerAsync();

    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(1);
    const job = broker.enqueueProvingJob.mock.calls[0][0];

    const result = makePublicInputsAndRecursiveProof(
      makeParityPublicInputs(),
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );

    const outputUri = await proofStore.saveProofOutput(job.id, ProvingRequestType.BASE_PARITY, result);
    resolve({
      status: 'fulfilled',
      value: outputUri,
    });

    await jest.advanceTimersToNextTimerAsync();
    await expect(cache.getProvingJobStatus(job.id)).resolves.toEqual({ status: 'fulfilled', value: outputUri });

    await expect(facade.getBaseParityProof(inputs)).resolves.toEqual(result);
    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(1); // job was only ever enqueued once
  });
});
