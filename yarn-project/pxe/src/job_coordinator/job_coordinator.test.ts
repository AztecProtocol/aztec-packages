import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { jest } from '@jest/globals';

import { JobCoordinator, type StagedStore } from './job_coordinator.js';

describe('JobCoordinator', () => {
  let store: AztecAsyncKVStore;
  let coordinator: JobCoordinator;

  beforeEach(async () => {
    const log = createLogger('pxe:test');
    store = await openTmpStore('job_coordinator_test', log);
    coordinator = new JobCoordinator(store, log);
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
});
