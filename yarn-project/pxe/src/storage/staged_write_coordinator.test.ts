import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { jest } from '@jest/globals';

import { type ChangeSetId, type StagedStore, StagedWriteCoordinator } from './staged_write_coordinator.js';

describe('StagedWriteCoordinator', () => {
  let store: AztecAsyncKVStore;
  let coordinator: StagedWriteCoordinator;

  beforeEach(async () => {
    store = await openTmpStore('staged_write_coordinator_test');
    coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [] });
  });

  describe('begin', () => {
    it('creates a new change set id', () => {
      const changeSetId = coordinator.begin();

      expect(typeof changeSetId).toBe('string');
      expect(changeSetId.length).toBeGreaterThan(0);
    });

    it('throws if change set already active', () => {
      coordinator.begin();
      expect(() => coordinator.begin()).toThrow(/already active/);
    });

    it('notifies its stores of the change set it opened', async () => {
      const opened: ChangeSetId[] = [];
      const mockStore = makeStagedStore({
        storeName: 'mock_store',
        beginChangeSet: changeSetId => opened.push(changeSetId),
      });

      coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [mockStore] });

      const first = coordinator.begin();
      expect(opened).toEqual([first]);
      await coordinator.commit(first);

      const second = coordinator.begin();
      expect(opened).toEqual([first, second]);
      coordinator.abort(second);
    });

    it('opens no change set at all when a store fails to open one', () => {
      const opened: ChangeSetId[] = [];
      const discarded: ChangeSetId[] = [];
      const healthyStore = makeStagedStore({
        storeName: 'healthy_store',
        beginChangeSet: changeSetId => opened.push(changeSetId),
        discardChangeSet: changeSetId => discarded.push(changeSetId),
      });
      let failNextBegin = true;
      const failingStore = makeStagedStore({
        storeName: 'failing_store',
        beginChangeSet: () => {
          if (failNextBegin) {
            failNextBegin = false;
            throw new Error('cannot open');
          }
        },
      });

      coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [healthyStore, failingStore] });

      expect(() => coordinator.begin()).toThrow('cannot open');
      expect(opened).toHaveLength(1);
      expect(discarded).toEqual(opened);
      expect(() => coordinator.begin()).not.toThrow();
    });
  });

  describe('commit', () => {
    it('clears change set marker on commit', async () => {
      const changeSetId = coordinator.begin();
      await coordinator.commit(changeSetId);
      expect(() => coordinator.begin()).not.toThrow();
    });

    it('throws if no matching change set active', async () => {
      const changeSetId = coordinator.begin();
      await coordinator.commit(changeSetId);
      await expect(coordinator.commit(changeSetId)).rejects.toThrow(/no matching change set/);
    });

    it('throws if no change set was ever opened', async () => {
      await expect(coordinator.commit('deadbeef')).rejects.toThrow(/no matching change set/);
    });

    it('throws if the change set id does not match the open one', async () => {
      coordinator.begin();
      await expect(coordinator.commit('deadbeef')).rejects.toThrow(/no matching change set/);
    });

    it('calls commitChangeSet on its stores within a single kv transaction', async () => {
      const realTransactionAsync = store.transactionAsync.bind(store);
      let inTransaction = false;
      jest.spyOn(store, 'transactionAsync').mockImplementation(async callback => {
        inTransaction = true;
        try {
          return await realTransactionAsync(callback);
        } finally {
          inTransaction = false;
        }
      });

      const committed: { changeSetId: ChangeSetId; inTransaction: boolean }[] = [];
      const mockStore = makeStagedStore({
        storeName: 'mock_store',
        beginChangeSet: () => {},
        commitChangeSet: changeSetId => {
          committed.push({ changeSetId, inTransaction });
          return Promise.resolve();
        },
      });

      coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [mockStore] });

      const changeSetId = coordinator.begin();

      await coordinator.commit(changeSetId);

      expect(committed).toEqual([{ changeSetId, inTransaction: true }]);
    });
  });

  describe('abort', () => {
    it('clears change set marker on abort', () => {
      const changeSetId = coordinator.begin();

      coordinator.abort(changeSetId);

      expect(() => coordinator.begin()).not.toThrow();
    });

    it('throws if no matching change set active', () => {
      const changeSetId = coordinator.begin();
      coordinator.abort(changeSetId);

      expect(() => coordinator.abort(changeSetId)).toThrow(/no matching change set/);
    });

    it('throws if no change set was ever opened', () => {
      expect(() => coordinator.abort('deadbeef')).toThrow(/no matching change set/);
    });

    it('throws if the change set id does not match the open one', () => {
      coordinator.begin();
      expect(() => coordinator.abort('deadbeef')).toThrow(/no matching change set/);
    });

    it('calls discardChangeSet on all its stores', () => {
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardChangeSetMock = jest.fn<() => void>();
      const mockStore = makeStagedStore({
        storeName: 'mock_store',
        beginChangeSet: () => {},
        commitChangeSet: commitMock,
        discardChangeSet: discardChangeSetMock,
      });

      coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [mockStore] });

      const changeSetId = coordinator.begin();

      coordinator.abort(changeSetId);

      expect(discardChangeSetMock).toHaveBeenCalledWith(changeSetId);
    });

    it('ends the change set and discards the other stores when one store fails to discard', () => {
      const discarded: ChangeSetId[] = [];
      const failingStore = makeStagedStore({
        storeName: 'failing_store',
        discardChangeSet: () => {
          throw new Error('discard failed');
        },
      });
      const healthyStore = makeStagedStore({
        storeName: 'healthy_store',
        discardChangeSet: changeSetId => {
          discarded.push(changeSetId);
        },
      });

      coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [failingStore, healthyStore] });

      const changeSetId = coordinator.begin();

      expect(() => coordinator.abort(changeSetId)).toThrow(/failing_store/);

      // The store behind the failing one still drops its staged data, and the change set still ends.
      expect(discarded).toEqual([changeSetId]);
      expect(() => coordinator.begin()).not.toThrow();
    });

    it('reports every failed discard as one aggregate error', () => {
      const failingStore = (storeName: string) =>
        makeStagedStore({
          storeName,
          discardChangeSet: () => {
            throw new Error(`${storeName} cannot discard`);
          },
        });

      coordinator = new StagedWriteCoordinator({
        kvStore: store,
        stagedStores: [failingStore('first_store'), failingStore('second_store')],
      });

      const changeSetId = coordinator.begin();

      let abortError: AggregateError | undefined;
      try {
        coordinator.abort(changeSetId);
      } catch (err) {
        abortError = err as AggregateError;
      }

      expect(abortError).toBeInstanceOf(AggregateError);
      expect(abortError!.errors.map((err: Error) => err.message)).toEqual([
        expect.stringContaining('Store "first_store" failed to discard'),
        expect.stringContaining('Store "second_store" failed to discard'),
      ]);
      expect(abortError!.errors.map((err: Error) => err.cause)).toEqual([
        new Error('first_store cannot discard'),
        new Error('second_store cannot discard'),
      ]);
    });
  });

  describe('construction', () => {
    it('throws on stores with duplicate names', () => {
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardChangeSetMock = jest.fn<() => void>();
      const mockStore = makeStagedStore({
        storeName: 'mock_store',
        beginChangeSet: () => {},
        commitChangeSet: commitMock,
        discardChangeSet: discardChangeSetMock,
      });

      expect(() => new StagedWriteCoordinator({ kvStore: store, stagedStores: [mockStore, mockStore] })).toThrow(
        /already registered/,
      );
    });
  });

  /** A staged store that does nothing on commit and discard, so a test only spells out the part it exercises. */
  function makeStagedStore(overrides: Partial<StagedStore> & Pick<StagedStore, 'storeName'>): StagedStore {
    return {
      beginChangeSet: () => {},
      commitChangeSet: () => Promise.resolve(),
      discardChangeSet: () => {},
      ...overrides,
    };
  }
});
