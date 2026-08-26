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
      const mockStore: StagedStore = {
        storeName: 'mock_store',
        beginChangeSet: changeSetId => opened.push(changeSetId),
        commitChangeSet: () => Promise.resolve(),
        discardChangeSet: () => {},
      };

      coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [mockStore] });

      const first = coordinator.begin();
      expect(opened).toEqual([first]);
      await coordinator.commit(first);

      const second = coordinator.begin();
      expect(opened).toEqual([first, second]);
      coordinator.abort(second);
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
      const mockStore: StagedStore = {
        storeName: 'mock_store',
        commitChangeSet: changeSetId => {
          committed.push({ changeSetId, inTransaction });
          return Promise.resolve();
        },
        discardChangeSet: () => {},
      };

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
      const mockStore: StagedStore = {
        storeName: 'mock_store',
        commitChangeSet: commitMock,
        discardChangeSet: discardChangeSetMock,
      };

      coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [mockStore] });

      const changeSetId = coordinator.begin();

      coordinator.abort(changeSetId);

      expect(discardChangeSetMock).toHaveBeenCalledWith(changeSetId);
    });
  });

  describe('construction', () => {
    it('throws on stores with duplicate names', () => {
      const commitMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const discardChangeSetMock = jest.fn<() => void>();
      const mockStore: StagedStore = {
        storeName: 'mock_store',
        commitChangeSet: commitMock,
        discardChangeSet: discardChangeSetMock,
      };

      expect(() => new StagedWriteCoordinator({ kvStore: store, stagedStores: [mockStore, mockStore] })).toThrow(
        /already registered/,
      );
    });
  });
});
