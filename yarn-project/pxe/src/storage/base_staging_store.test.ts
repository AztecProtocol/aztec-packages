import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { tick } from '../test_utils.js';
import { BaseStagingStore } from './base_staging_store.js';
import type { ChangeSetId } from './staged_write_coordinator.js';

describe('BaseStagingStore', () => {
  let kv: AztecAsyncKVStore;
  let store: TestStore;

  beforeEach(async () => {
    kv = await openTmpStore('base_staging_store_test');
    store = new TestStore(kv);
  });

  describe('withChangeSetAndDb', () => {
    it('accepts operations between beginChangeSet and the end of the change set', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      await expect(store.readStaged('key', 'cs1')).resolves.toBe(1);
    });

    it('rejects operations for a change set that was never opened', async () => {
      let operationRan = false;
      await expect(
        store.op(() => {
          operationRan = true;
          return Promise.resolve();
        }, 'never-opened'),
      ).rejects.toThrow('Store "test": change set "never-opened" is not open');
      expect(operationRan).toBe(false);
    });

    it('rejects operations for a change set that was committed', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      await store.commitChangeSet('cs1');
      await expect(store.write('key', 2, 'cs1')).rejects.toThrow('Store "test": change set "cs1" is not open');
      await expect(store.readStaged('key', 'cs1')).rejects.toThrow('Store "test": change set "cs1" is not open');
    });

    it('rejects operations for a change set that was discarded', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      store.discardChangeSet('cs1');
      await expect(store.write('key', 2, 'cs1')).rejects.toThrow('Store "test": change set "cs1" is not open');
    });

    it('serializes operations of the same change set', async () => {
      store.beginChangeSet('cs1');
      const gate = promiseWithResolvers<void>();
      const order: string[] = [];

      const first = store.op(async () => {
        order.push('first-start');
        await gate.promise;
        order.push('first-end');
      }, 'cs1');
      const second = store.op(() => {
        order.push('second');
        return Promise.resolve();
      }, 'cs1');

      await tick();
      expect(order).toEqual(['first-start']);

      gate.resolve();
      await first;
      await second;
      expect(order).toEqual(['first-start', 'first-end', 'second']);
    });

    it('releases the lock when the operation throws', async () => {
      store.beginChangeSet('cs1');
      await expect(store.op(() => Promise.reject(new Error('boom')), 'cs1')).rejects.toThrow('boom');
      await expect(store.op(() => Promise.resolve('ok'), 'cs1')).resolves.toBe('ok');
    });

    it('rejects an operation whose change set ended while it waited for the lock', async () => {
      store.beginChangeSet('cs1');
      const entered = promiseWithResolvers<void>();
      const gate = promiseWithResolvers<void>();

      const holding = store.op(() => {
        entered.resolve();
        return gate.promise;
      }, 'cs1');
      const queuedWrite = store.write('key', 1, 'cs1');

      // Only end the change set once the first operation is inside its body, so it is the queued write that finds it
      // closed.
      await entered.promise;
      store.discardChangeSet('cs1');
      gate.resolve();

      await holding;
      await expect(queuedWrite).rejects.toThrow('Store "test": change set "cs1" is not open');
    });

    it('rejects an operation whose change set ended while it waited in the transaction queue', async () => {
      store.beginChangeSet('cs1');
      const gate = promiseWithResolvers<void>();

      // Hold the kv store's writer queue so the write's transaction is in flight but not yet executed, then end the
      // change set before releasing.
      const holdTx = kv.transactionAsync(() => gate.promise);
      const queuedWrite = store.write('key', 1, 'cs1');

      store.discardChangeSet('cs1');
      gate.resolve();
      await holdTx;

      await expect(queuedWrite).rejects.toThrow('Store "test": change set "cs1" is not open');

      // The rejected write staged nothing: the change set is closed, so rollback runs and nothing reached the db.
      await expect(store.rollbackToBlock(0)).resolves.not.toThrow();
      await expect(store.committed('key')).resolves.toBeUndefined();
    });
  });

  describe('withChangeSet', () => {
    it('accepts operations between beginChangeSet and the end of the change set', async () => {
      store.beginChangeSet('cs1');
      await store.stage('key', 1, 'cs1');
      await expect(store.staged('key', 'cs1')).resolves.toBe(1);
    });

    it('rejects staging for a change set that is not open', async () => {
      await expect(store.stage('key', 1, 'cs1')).rejects.toThrow('Store "test": change set "cs1" is not open');
    });

    it('takes the same lock as withChangeSetAndDb, so it cannot interleave with an operation in flight', async () => {
      store.beginChangeSet('cs1');
      const gate = promiseWithResolvers<void>();
      const order: string[] = [];

      const inFlight = store.op(async changeSet => {
        order.push('op-start');
        await gate.promise;
        changeSet.set('key', 1);
        order.push('op-end');
      }, 'cs1');
      await tick();

      const staged = store.stage('key', 2, 'cs1').then(() => order.push('stage-end'));
      await tick();
      expect(order).toEqual(['op-start']);

      gate.resolve();
      await Promise.all([inFlight, staged]);
      expect(order).toEqual(['op-start', 'op-end', 'stage-end']);
      await expect(store.readStaged('key', 'cs1')).resolves.toBe(2);
    });
  });

  describe('beginChangeSet', () => {
    it('rejects opening a change set while another is open', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      expect(() => store.beginChangeSet('cs2')).toThrow(
        'Store "test": cannot open change set "cs2" because change set "cs1" is already open',
      );
      await expect(store.readStaged('key', 'cs1')).resolves.toBe(1);
    });

    it('accepts a new change set once the previous one ended', async () => {
      store.beginChangeSet('cs1');
      await store.commitChangeSet('cs1');
      expect(() => store.beginChangeSet('cs2')).not.toThrow();
    });
  });

  describe('commitChangeSet', () => {
    it('flushes staged data to the db', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      await store.commitChangeSet('cs1');
      await expect(store.committed('key')).resolves.toBe(1);
    });

    it('rejects while an operation is in flight', async () => {
      store.beginChangeSet('cs1');
      const entered = promiseWithResolvers<void>();
      const gate = promiseWithResolvers<void>();

      const inFlight = store.op(async changeSet => {
        entered.resolve();
        await gate.promise;
        changeSet.set('key', 1);
      }, 'cs1');

      await entered.promise;
      await expect(store.commitChangeSet('cs1')).rejects.toThrow(
        'Store "test": cannot commit change set "cs1" while 1 of its operations are in flight',
      );

      gate.resolve();
      await inFlight;
      await store.commitChangeSet('cs1');
      await expect(store.committed('key')).resolves.toBe(1);
    });

    it('ends the change set even when nothing was staged', async () => {
      store.beginChangeSet('cs1');
      await store.commitChangeSet('cs1');
      await expect(store.write('key', 1, 'cs1')).rejects.toThrow('Store "test": change set "cs1" is not open');
    });

    it('rejects a change set that was never opened', async () => {
      await expect(store.commitChangeSet('never-opened')).rejects.toThrow(
        'Store "test": change set "never-opened" is not open',
      );
    });
  });

  describe('discardChangeSet', () => {
    it('drops the staged writes without touching committed state', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      await store.commitChangeSet('cs1');

      store.beginChangeSet('cs2');
      await store.write('key', 2, 'cs2');
      store.discardChangeSet('cs2');

      // Commit the next change set: a discarded change set's staged write must not ride along on it.
      store.beginChangeSet('cs3');
      await store.commitChangeSet('cs3');
      await expect(store.committed('key')).resolves.toBe(1);
    });

    it('leaves the open change set alone when discarding a different one', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');

      store.discardChangeSet('never-opened');

      await expect(store.readStaged('key', 'cs1')).resolves.toBe(1);
    });

    it('tolerates a repeated discard', () => {
      store.beginChangeSet('cs1');
      store.discardChangeSet('cs1');

      expect(() => store.discardChangeSet('cs1')).not.toThrow();
    });
  });

  describe('rollbackToBlock', () => {
    it('rolls back when no change set is open', async () => {
      await store.rollbackToBlock(7);
      expect(store.rollbacks).toEqual([7]);
    });

    it('throws once a change set opens, even before it stages anything', async () => {
      store.beginChangeSet('cs1');
      await expect(store.rollbackToBlock(7)).rejects.toThrow(
        'Store "test": cannot roll back while change set "cs1" is open',
      );
      expect(store.rollbacks).toEqual([]);
    });

    it('rolls back again once the change set is discarded', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      store.discardChangeSet('cs1');
      await store.rollbackToBlock(7);
      expect(store.rollbacks).toEqual([7]);
    });

    it('rolls back again once the change set is committed', async () => {
      store.beginChangeSet('cs1');
      await store.write('key', 1, 'cs1');
      await store.commitChangeSet('cs1');
      await store.rollbackToBlock(7);
      expect(store.rollbacks).toEqual([7]);
    });
  });
});

const VALUES_MAP = 'values';

type TestDb = { values: AztecAsyncMap<string, number> };

class TestStore extends BaseStagingStore<Map<string, number>, TestDb> {
  /** Blocks passed to {@link applyRollback}, in order, so tests can tell a delegated rollback from a rejected one. */
  readonly rollbacks: number[] = [];

  /** Second handle on the same map, so assertions can read committed state without going through the store. */
  readonly #committedValues: AztecAsyncMap<string, number>;

  constructor(store: AztecAsyncKVStore) {
    super({
      storeName: 'test',
      store,
      buildChangeSet: () => new Map(),
      buildDb: db => ({ values: db.openMap(VALUES_MAP) }),
    });
    this.#committedValues = store.openMap(VALUES_MAP);
  }

  protected async flushChangeSet(changeSet: Map<string, number>, db: TestDb): Promise<void> {
    for (const [key, value] of changeSet) {
      await db.values.set(key, value);
    }
  }

  protected applyRollback(toBlock: number, _db: TestDb): Promise<void> {
    this.rollbacks.push(toBlock);
    return Promise.resolve();
  }

  write(key: string, value: number, changeSetId: ChangeSetId): Promise<void> {
    return this.withChangeSetAndDb(changeSetId, changeSet => {
      changeSet.set(key, value);
      return Promise.resolve();
    });
  }

  stage(key: string, value: number, changeSetId: ChangeSetId): Promise<void> {
    return this.withChangeSet(changeSetId, changeSet => {
      changeSet.set(key, value);
    });
  }

  staged(key: string, changeSetId: ChangeSetId): Promise<number | undefined> {
    return this.withChangeSet(changeSetId, changeSet => changeSet.get(key));
  }

  // Runs an arbitrary operation body under the change set's lock.
  op<R>(fn: (changeSet: Map<string, number>) => Promise<R>, changeSetId: ChangeSetId): Promise<R> {
    return this.withChangeSetAndDb(changeSetId, changeSet => fn(changeSet));
  }

  readStaged(key: string, changeSetId: ChangeSetId): Promise<number | undefined> {
    return this.withChangeSetAndDb(changeSetId, changeSet => Promise.resolve(changeSet.get(key)));
  }

  committed(key: string): Promise<number | undefined> {
    return this.#committedValues.getAsync(key);
  }
}
