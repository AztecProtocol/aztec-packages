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

    it('calls commitStaged on affected providers', async () => {
      const commitStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagedStore = {
        storeName: 'mock_store',
        commitStaged: commitStagedMock,
        discardStaged: discardStagedMock,
      };

      coordinator.registerProvider(mockProvider);

      const context = await coordinator.beginJob('test_job');
      context.registerWrite('mock_store');

      await coordinator.commitJob(context);

      expect(commitStagedMock).toHaveBeenCalledWith(context);
    });

    it('does not call commitStaged on unaffected providers', async () => {
      const commitStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagedStore = {
        storeName: 'mock_store',
        commitStaged: commitStagedMock,
        discardStaged: discardStagedMock,
      };

      coordinator.registerProvider(mockProvider);

      const context = await coordinator.beginJob('test_job');
      // Don't register any writes

      await coordinator.commitJob(context);

      expect(commitStagedMock).not.toHaveBeenCalled();
    });
  });

  describe('abortJob', () => {
    it('clears job marker on abort', async () => {
      const context = await coordinator.beginJob('test_job');

      await coordinator.abortJob(context);

      expect(await coordinator.hasJobInProgress()).toBe(false);
    });

    it('calls discardStaged on affected providers', async () => {
      const commitStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagedStore = {
        storeName: 'mock_store',
        commitStaged: commitStagedMock,
        discardStaged: discardStagedMock,
      };

      coordinator.registerProvider(mockProvider);

      const context = await coordinator.beginJob('test_job');
      context.registerWrite('mock_store');

      await coordinator.abortJob(context);

      expect(discardStagedMock).toHaveBeenCalledWith(context.stagingPrefix);
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

    it('calls discardStaged on all registered providers', async () => {
      const commitStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagedStore = {
        storeName: 'mock_store',
        commitStaged: commitStagedMock,
        discardStaged: discardStagedMock,
      };

      const context = await coordinator.beginJob('test_job');
      context.registerWrite('mock_store');

      // Simulate restart
      const newCoordinator = new JobCoordinator(store);
      newCoordinator.registerProvider(mockProvider);

      await newCoordinator.recover();

      expect(discardStagedMock).toHaveBeenCalled();
    });
  });

  describe('registerProvider', () => {
    it('registers a provider', () => {
      const commitStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagedStore = {
        storeName: 'mock_store',
        commitStaged: commitStagedMock,
        discardStaged: discardStagedMock,
      };

      expect(() => coordinator.registerProvider(mockProvider)).not.toThrow();
    });

    it('throws on duplicate registration', () => {
      const commitStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardStagedMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockProvider: StagedStore = {
        storeName: 'mock_store',
        commitStaged: commitStagedMock,
        discardStaged: discardStagedMock,
      };

      coordinator.registerProvider(mockProvider);

      expect(() => coordinator.registerProvider(mockProvider)).toThrow(/already registered/);
    });
  });
});

describe('JobCoordinator with Uint8Array storage (IndexedDB simulation)', () => {
  // This tests the cross-platform compatibility fix where IndexedDB returns Uint8Array
  // instead of Buffer, and Uint8Array.toString() returns "1,2,3,4" instead of UTF-8 string

  it('correctly reads job marker stored as Uint8Array', async () => {
    // Create a mock store that returns Uint8Array instead of Buffer (like IndexedDB does)
    let storedValue: Uint8Array | undefined;

    const mockSingleton = {
      getAsync: jest.fn<() => Promise<Uint8Array | undefined>>().mockImplementation(() => Promise.resolve(storedValue)),
      set: jest.fn<(val: Buffer) => Promise<boolean>>().mockImplementation((val: Buffer) => {
        // Convert Buffer to pure Uint8Array (simulating IndexedDB behavior)
        storedValue = new Uint8Array(val);
        return Promise.resolve(true);
      }),
      delete: jest.fn<() => Promise<boolean>>().mockImplementation(() => {
        storedValue = undefined;
        return Promise.resolve(true);
      }),
    };

    const mockStore = {
      openSingleton: jest.fn().mockReturnValue(mockSingleton),
    } as unknown as AztecAsyncKVStore;

    const coordinator = new JobCoordinator(mockStore);

    // Begin a job - this stores the job marker
    const context = await coordinator.beginJob('test_job');
    expect(context.jobType).toBe('test_job');

    // Verify job is in progress - this reads back the Uint8Array
    expect(await coordinator.hasJobInProgress()).toBe(true);

    // Commit should work with Uint8Array storage
    await coordinator.commitJob(context);

    // Job should be cleared
    expect(await coordinator.hasJobInProgress()).toBe(false);
  });

  it('handles Uint8Array correctly after simulated restart', async () => {
    let storedValue: Uint8Array | undefined;

    const mockSingleton = {
      getAsync: jest.fn<() => Promise<Uint8Array | undefined>>().mockImplementation(() => Promise.resolve(storedValue)),
      set: jest.fn<(val: Buffer) => Promise<boolean>>().mockImplementation((val: Buffer) => {
        storedValue = new Uint8Array(val);
        return Promise.resolve(true);
      }),
      delete: jest.fn<() => Promise<boolean>>().mockImplementation(() => {
        storedValue = undefined;
        return Promise.resolve(true);
      }),
    };

    const mockStore = {
      openSingleton: jest.fn().mockReturnValue(mockSingleton),
    } as unknown as AztecAsyncKVStore;

    // First coordinator starts a job
    const coordinator1 = new JobCoordinator(mockStore);
    await coordinator1.beginJob('test_job');

    // Simulate restart - new coordinator reads the Uint8Array marker
    const coordinator2 = new JobCoordinator(mockStore);
    expect(await coordinator2.hasJobInProgress()).toBe(true);

    // Recovery should work with Uint8Array storage
    await coordinator2.recover();
    expect(await coordinator2.hasJobInProgress()).toBe(false);
  });

  it('TextDecoder correctly decodes job marker JSON from Uint8Array', () => {
    // Direct test of the encoding/decoding logic
    const testData = { jobId: 'abc123', jobType: 'test', startedAt: Date.now(), affectedStoreNames: ['store1'] };
    const jsonString = JSON.stringify(testData);

    // Encode as we do in setCurrentJob
    const encoded = new TextEncoder().encode(jsonString);

    // Store as Uint8Array (simulating IndexedDB)
    const storedAsUint8Array = new Uint8Array(encoded);

    // Decode as we do in getCurrentJob
    const decoded = new TextDecoder().decode(storedAsUint8Array);

    expect(JSON.parse(decoded)).toEqual(testData);
  });

  it('verifies Uint8Array.toString() does NOT produce valid JSON', () => {
    // This test documents the bug that was fixed
    const testData = { jobId: 'abc123' };
    const jsonString = JSON.stringify(testData);
    const encoded = new TextEncoder().encode(jsonString);
    const storedAsUint8Array = new Uint8Array(encoded);

    // This is what was happening before the fix - Uint8Array.toString() produces garbage
    const badDecode = storedAsUint8Array.toString();

    // It produces something like "123,34,106,111,98,73,100,34..." not JSON
    expect(() => JSON.parse(badDecode)).toThrow();

    // TextDecoder is the correct way
    const goodDecode = new TextDecoder().decode(storedAsUint8Array);
    expect(JSON.parse(goodDecode)).toEqual(testData);
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
