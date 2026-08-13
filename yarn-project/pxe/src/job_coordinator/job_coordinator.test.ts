import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { jest } from '@jest/globals';

import { JobCoordinator, type StagedStore } from './job_coordinator.js';

describe('JobCoordinator', () => {
  let store: AztecAsyncKVStore;
  let coordinator: JobCoordinator;

  beforeEach(async () => {
    store = await openTmpStore('job_coordinator_test');
    coordinator = new JobCoordinator(store);
  });

  describe('beginJob', () => {
    it('creates a new job id', () => {
      const jobId = coordinator.beginJob();

      expect(typeof jobId).toBe('string');
      expect(jobId.length).toBeGreaterThan(0);
    });

    // Note: we could eventually be relax this if we want more concurrency,
    // but it's good to start with this guardrail
    it('throws if job already in progress', () => {
      coordinator.beginJob();
      expect(() => coordinator.beginJob()).toThrow(/already in progress/);
    });

    it('tracks job in progress', () => {
      coordinator.beginJob();
      expect(coordinator.hasJobInProgress()).toBe(true);
    });
  });

  describe('commitJob', () => {
    it('clears job marker on commit', async () => {
      const jobId = coordinator.beginJob();
      await coordinator.commitJob(jobId);
      expect(coordinator.hasJobInProgress()).toBe(false);
    });

    it('throws if no matching job in progress', async () => {
      const jobId = coordinator.beginJob();
      await coordinator.commitJob(jobId);
      await expect(coordinator.commitJob(jobId)).rejects.toThrow(/no matching job/);
    });

    it('calls commit on registered stores', async () => {
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockStore: StagedStore = {
        storeName: 'mock_store',
        commit: commitMock,
        discardStaged: discardStagedMock,
      };

      coordinator.registerStore(mockStore);

      const jobId = coordinator.beginJob();

      await coordinator.commitJob(jobId);

      expect(commitMock).toHaveBeenCalledWith(jobId);
    });

    it('waits for stores to settle before committing any of them', async () => {
      const { promise: settling, resolve: finishSettling } = promiseWithResolvers<void>();
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      coordinator.registerStore({
        storeName: 'settling_store',
        commit: () => Promise.resolve(),
        discardStaged: () => Promise.resolve(),
        settle: () => settling,
      });
      coordinator.registerStore({
        storeName: 'other_store',
        commit: commitMock,
        discardStaged: () => Promise.resolve(),
      });

      const jobId = coordinator.beginJob();
      const commitPromise = coordinator.commitJob(jobId);
      await tick();
      expect(commitMock).not.toHaveBeenCalled();

      finishSettling();
      await commitPromise;
      expect(commitMock).toHaveBeenCalledWith(jobId);
    });

    it('propagates a settle rejection without committing any store', async () => {
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      coordinator.registerStore({
        storeName: 'failing_store',
        commit: () => Promise.resolve(),
        discardStaged: () => Promise.resolve(),
        settle: () => Promise.reject(new Error('settle failed')),
      });
      coordinator.registerStore({
        storeName: 'other_store',
        commit: commitMock,
        discardStaged: () => Promise.resolve(),
      });

      const jobId = coordinator.beginJob();
      await expect(coordinator.commitJob(jobId)).rejects.toThrow('settle failed');
      expect(commitMock).not.toHaveBeenCalled();
    });
  });

  describe('abortJob', () => {
    it('clears job marker on abort', async () => {
      const jobId = coordinator.beginJob();

      await coordinator.abortJob(jobId);

      expect(coordinator.hasJobInProgress()).toBe(false);
    });

    it('calls discardStaged on all registered stores', async () => {
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockStore: StagedStore = {
        storeName: 'mock_store',
        commit: commitMock,
        discardStaged: discardStagedMock,
      };

      coordinator.registerStore(mockStore);

      const jobId = coordinator.beginJob();

      await coordinator.abortJob(jobId);

      expect(discardStagedMock).toHaveBeenCalledWith(jobId);
    });

    it('waits for stores to settle before discarding any of them', async () => {
      const { promise: settling, resolve: finishSettling } = promiseWithResolvers<void>();
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      coordinator.registerStore({
        storeName: 'settling_store',
        commit: () => Promise.resolve(),
        discardStaged: () => Promise.resolve(),
        settle: () => settling,
      });
      coordinator.registerStore({
        storeName: 'other_store',
        commit: () => Promise.resolve(),
        discardStaged: discardStagedMock,
      });

      const jobId = coordinator.beginJob();
      const abortPromise = coordinator.abortJob(jobId);
      await tick();
      expect(discardStagedMock).not.toHaveBeenCalled();

      finishSettling();
      await abortPromise;
      expect(discardStagedMock).toHaveBeenCalledWith(jobId);
    });

    it('discards all stores even when a settle rejects', async () => {
      const failingDiscardMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const otherDiscardMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      coordinator.registerStore({
        storeName: 'failing_store',
        commit: () => Promise.resolve(),
        discardStaged: failingDiscardMock,
        settle: () => Promise.reject(new Error('settle failed')),
      });
      coordinator.registerStore({
        storeName: 'other_store',
        commit: () => Promise.resolve(),
        discardStaged: otherDiscardMock,
      });

      const jobId = coordinator.beginJob();
      await coordinator.abortJob(jobId);

      expect(failingDiscardMock).toHaveBeenCalledWith(jobId);
      expect(otherDiscardMock).toHaveBeenCalledWith(jobId);
    });
  });

  describe('registerStore', () => {
    it('throws on duplicate registration', () => {
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockStore: StagedStore = {
        storeName: 'mock_store',
        commit: commitMock,
        discardStaged: discardStagedMock,
      };

      coordinator.registerStore(mockStore);

      expect(() => coordinator.registerStore(mockStore)).toThrow(/already registered/);
    });
  });

  /** Yields to the macrotask queue, draining all pending microtasks in between. */
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
});
