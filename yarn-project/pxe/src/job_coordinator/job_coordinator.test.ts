import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { jest } from '@jest/globals';

import { JobContext } from './job_context.js';
import { JobCoordinator, type StagingDataProvider } from './job_coordinator.js';

describe('JobCoordinator', () => {
  let store: AztecAsyncKVStore;
  let coordinator: JobCoordinator;

  beforeEach(async () => {
    store = await openTmpStore('job_coordinator_test');
    coordinator = new JobCoordinator(store);
  });

  describe('beginJob', () => {
    it('creates a new job context', async () => {
      const context = await coordinator.beginJob('test_job');

      expect(context).toBeInstanceOf(JobContext);
      expect(context.jobType).toBe('test_job');
      expect(context.jobId).toBeDefined();
      expect(context.stagingPrefix).toContain('job_');
    });

    it('throws if job already in progress', async () => {
      await coordinator.beginJob('first_job');

      await expect(coordinator.beginJob('second_job')).rejects.toThrow(/already in progress/);
    });

    it('persists job marker', async () => {
      await coordinator.beginJob('test_job');

      expect(await coordinator.hasJobInProgress()).toBe(true);
    });
  });

  describe('commitJob', () => {
    it('clears job marker on commit', async () => {
      const context = await coordinator.beginJob('test_job');

      await coordinator.commitJob(context);

      expect(await coordinator.hasJobInProgress()).toBe(false);
    });

    it('throws if no matching job in progress', async () => {
      const context = await coordinator.beginJob('test_job');
      await coordinator.commitJob(context);

      await expect(coordinator.commitJob(context)).rejects.toThrow(/no matching job/);
    });

    it('calls commitStaging on affected providers', async () => {
      const commitStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagingDataProvider = {
        storeName: 'mock_store',
        commitStaging: commitStagingMock,
        discardStaging: discardStagingMock,
      };

      coordinator.registerProvider(mockProvider);

      const context = await coordinator.beginJob('test_job');
      context.registerWrite('mock_store');

      await coordinator.commitJob(context);

      expect(commitStagingMock).toHaveBeenCalledWith(context);
    });

    it('does not call commitStaging on unaffected providers', async () => {
      const commitStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagingDataProvider = {
        storeName: 'mock_store',
        commitStaging: commitStagingMock,
        discardStaging: discardStagingMock,
      };

      coordinator.registerProvider(mockProvider);

      const context = await coordinator.beginJob('test_job');
      // Don't register any writes

      await coordinator.commitJob(context);

      expect(commitStagingMock).not.toHaveBeenCalled();
    });
  });

  describe('abortJob', () => {
    it('clears job marker on abort', async () => {
      const context = await coordinator.beginJob('test_job');

      await coordinator.abortJob(context);

      expect(await coordinator.hasJobInProgress()).toBe(false);
    });

    it('calls discardStaging on affected providers', async () => {
      const commitStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagingDataProvider = {
        storeName: 'mock_store',
        commitStaging: commitStagingMock,
        discardStaging: discardStagingMock,
      };

      coordinator.registerProvider(mockProvider);

      const context = await coordinator.beginJob('test_job');
      context.registerWrite('mock_store');

      await coordinator.abortJob(context);

      expect(discardStagingMock).toHaveBeenCalledWith(context.stagingPrefix);
    });
  });

  describe('recover', () => {
    it('does nothing if no job in progress', async () => {
      await coordinator.recover();

      expect(await coordinator.hasJobInProgress()).toBe(false);
    });

    it('clears incomplete job on recovery', async () => {
      await coordinator.beginJob('test_job');

      // Simulate restart by creating new coordinator with same store
      const newCoordinator = new JobCoordinator(store);

      expect(await newCoordinator.hasJobInProgress()).toBe(true);

      await newCoordinator.recover();

      expect(await newCoordinator.hasJobInProgress()).toBe(false);
    });

    it('calls discardStaging on all registered providers', async () => {
      const commitStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagingDataProvider = {
        storeName: 'mock_store',
        commitStaging: commitStagingMock,
        discardStaging: discardStagingMock,
      };

      const context = await coordinator.beginJob('test_job');
      context.registerWrite('mock_store');

      // Simulate restart
      const newCoordinator = new JobCoordinator(store);
      newCoordinator.registerProvider(mockProvider);

      await newCoordinator.recover();

      expect(discardStagingMock).toHaveBeenCalled();
    });
  });

  describe('registerProvider', () => {
    it('registers a provider', () => {
      const commitStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagingDataProvider = {
        storeName: 'mock_store',
        commitStaging: commitStagingMock,
        discardStaging: discardStagingMock,
      };

      expect(() => coordinator.registerProvider(mockProvider)).not.toThrow();
    });

    it('throws on duplicate registration', () => {
      const commitStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagingMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagingDataProvider = {
        storeName: 'mock_store',
        commitStaging: commitStagingMock,
        discardStaging: discardStagingMock,
      };

      coordinator.registerProvider(mockProvider);

      expect(() => coordinator.registerProvider(mockProvider)).toThrow(/already registered/);
    });
  });
});

describe('JobContext', () => {
  it('generates staging keys', () => {
    const context = new JobContext('abc123', 'test');

    expect(context.stagingKey('notes')).toBe('job_abc123:notes');
    expect(context.stagingKey('data:key')).toBe('job_abc123:data:key');
  });

  it('extracts main keys from staging keys', () => {
    const context = new JobContext('abc123', 'test');

    expect(context.mainKey('job_abc123:notes')).toBe('notes');
    expect(context.mainKey('job_abc123:data:key')).toBe('data:key');
  });

  it('throws when extracting main key from non-staging key', () => {
    const context = new JobContext('abc123', 'test');

    expect(() => context.mainKey('notes')).toThrow(/does not have staging prefix/);
  });

  it('tracks affected stores', () => {
    const context = new JobContext('abc123', 'test');

    context.registerWrite('store1');
    context.registerWrite('store2');
    context.registerWrite('store1'); // Duplicate

    expect(context.getAffectedStoreNames()).toEqual(['store1', 'store2']);
    expect(context.hasWrittenTo('store1')).toBe(true);
    expect(context.hasWrittenTo('store3')).toBe(false);
  });
});
