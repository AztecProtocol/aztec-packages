import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { jest } from '@jest/globals';

import { JobContext } from './job_context.js';
import { JobCoordinator, type StagedStore } from './job_coordinator.js';

describe('JobCoordinator', () => {
  let store: AztecAsyncKVStore;
  let coordinator: JobCoordinator;

  beforeEach(async () => {
    store = await openTmpStore('job_coordinator_test');
    coordinator = new JobCoordinator(store);
  });

  describe('beginJob', () => {
    it('creates a new job context', () => {
      const context = coordinator.beginJob();

      expect(context).toBeInstanceOf(JobContext);
      expect(context.jobId).toBeDefined();
      expect(context.stagingPrefix).toContain('job_');
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
      const context = coordinator.beginJob();
      await coordinator.commitJob(context);
      expect(coordinator.hasJobInProgress()).toBe(false);
    });

    it('throws if no matching job in progress', async () => {
      const context = coordinator.beginJob();
      await coordinator.commitJob(context);
      await expect(coordinator.commitJob(context)).rejects.toThrow(/no matching job/);
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

      const context = coordinator.beginJob();

      await coordinator.commitJob(context);

      expect(commitMock).toHaveBeenCalledWith(context);
    });
  });

  describe('abortJob', () => {
    it('clears job marker on abort', async () => {
      const context = coordinator.beginJob();

      await coordinator.abortJob(context);

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

      const context = coordinator.beginJob();

      await coordinator.abortJob(context);

      expect(discardStagedMock).toHaveBeenCalledWith(context.stagingPrefix);
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

describe('JobContext', () => {
  it('generates staging keys', () => {
    const context = new JobContext('abc123');
    expect(context.stagingKey('notes')).toBe('job_abc123:notes');
    expect(context.stagingKey('data:key')).toBe('job_abc123:data:key');
  });

  it('extracts main keys from staging keys', () => {
    const context = new JobContext('abc123');
    expect(context.mainKey('job_abc123:notes')).toBe('notes');
    expect(context.mainKey('job_abc123:data:key')).toBe('data:key');
  });

  it('throws when extracting main key from non-staging key', () => {
    const context = new JobContext('abc123');
    expect(() => context.mainKey('notes')).toThrow(/does not have staging prefix/);
  });
});
