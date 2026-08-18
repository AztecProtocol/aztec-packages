import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { BaseStagingStore } from './base_staging_store.js';
import type { JobId } from './job_coordinator.js';

describe('BaseStagingStore', () => {
  let kv: AztecAsyncKVStore;
  let store: TestStore;

  beforeEach(async () => {
    kv = await openTmpStore('base_staging_store_test');
    store = new TestStore(kv);
  });

  describe('withStaging', () => {
    it('accepts operations between beginJob and the end of the job', async () => {
      store.beginJob('job1');
      await store.write('key', 1, 'job1');
      await expect(store.readStaged('key', 'job1')).resolves.toBe(1);
    });

    it('rejects operations for a job that was never begun', async () => {
      let operationRan = false;
      await expect(
        store.op(() => {
          operationRan = true;
          return Promise.resolve();
        }, 'never-begun'),
      ).rejects.toThrow('Store "test_store": job "never-begun" is not in progress');
      expect(operationRan).toBe(false);
    });

    it('rejects operations for a job that was committed', async () => {
      store.beginJob('job1');
      await store.write('key', 1, 'job1');
      await store.commit('job1');
      await expect(store.write('key', 2, 'job1')).rejects.toThrow('Store "test_store": job "job1" is not in progress');
      await expect(store.readStaged('key', 'job1')).rejects.toThrow(
        'Store "test_store": job "job1" is not in progress',
      );
    });

    it('rejects operations for a job that was discarded', async () => {
      store.beginJob('job1');
      await store.write('key', 1, 'job1');
      await store.discardStaged('job1');
      await expect(store.write('key', 2, 'job1')).rejects.toThrow('Store "test_store": job "job1" is not in progress');
    });

    it('serializes operations of the same job', async () => {
      store.beginJob('job1');
      const gate = promiseWithResolvers<void>();
      const order: string[] = [];

      const first = store.op(async () => {
        order.push('first-start');
        await gate.promise;
        order.push('first-end');
      }, 'job1');
      const second = store.op(() => {
        order.push('second');
        return Promise.resolve();
      }, 'job1');

      await tick();
      expect(order).toEqual(['first-start']);

      gate.resolve();
      await first;
      await second;
      expect(order).toEqual(['first-start', 'first-end', 'second']);
    });

    it('releases the lock when the operation throws', async () => {
      store.beginJob('job1');
      await expect(store.op(() => Promise.reject(new Error('boom')), 'job1')).rejects.toThrow('boom');
      await expect(store.op(() => Promise.resolve('ok'), 'job1')).resolves.toBe('ok');
    });

    it('rejects an operation whose job ended while it waited for the lock', async () => {
      // An operation can pass the entry liveness check while its job is alive and then lose the job while parked on
      // the lock: the re-check inside the transaction must reject it instead of running it on the dead job's staging.
      store.beginJob('job1');
      const entered = promiseWithResolvers<void>();
      const gate = promiseWithResolvers<void>();

      const holding = store.op(() => {
        entered.resolve();
        return gate.promise;
      }, 'job1');
      const queuedWrite = store.write('key', 1, 'job1');

      // Only end the job once the first operation is inside its body, so it is the queued write that finds the job
      // dead.
      await entered.promise;
      await store.discardStaged('job1');
      gate.resolve();

      await holding;
      await expect(queuedWrite).rejects.toThrow('Store "test_store": job "job1" is not in progress');
    });

    it('rejects an operation whose job ended while it waited in the transaction queue', async () => {
      // The wait point after the lock: an operation can take the lock while its job is alive and then lose the job
      // while its transaction waited in the kv store's queue. The re-check inside the transaction must reject it
      // instead of running it on the dead job's staging.
      store.beginJob('job1');
      const gate = promiseWithResolvers<void>();

      // Hold the kv store's writer queue so the write's transaction is in flight but not yet executed, then end the
      // job before releasing.
      const holdTx = kv.transactionAsync(() => gate.promise);
      const queuedWrite = store.write('key', 1, 'job1');

      await store.discardStaged('job1');
      gate.resolve();
      await holdTx;

      await expect(queuedWrite).rejects.toThrow('Store "test_store": job "job1" is not in progress');

      // The rejected write staged nothing: the rollback guard passes and nothing reaches the db.
      expect(() => store.rollbackGuard()).not.toThrow();
      await expect(store.committed('key')).resolves.toBeUndefined();
    });
  });

  describe('beginJob', () => {
    it('rejects beginning a job while another is in progress', async () => {
      store.beginJob('job1');
      await store.write('key', 1, 'job1');
      expect(() => store.beginJob('job2')).toThrow('Store "test_store" has job "job1" in progress');
      await expect(store.readStaged('key', 'job1')).resolves.toBe(1);
    });

    it('accepts a new job once the previous one ended', async () => {
      store.beginJob('job1');
      await store.commit('job1');
      expect(() => store.beginJob('job2')).not.toThrow();
    });
  });

  describe('commit', () => {
    it('flushes staged data to the db', async () => {
      store.beginJob('job1');
      await store.write('key', 1, 'job1');
      await store.commit('job1');
      await expect(store.committed('key')).resolves.toBe(1);
    });

    it('ends the job even when nothing was staged', async () => {
      store.beginJob('job1');
      await store.commit('job1');
      await expect(store.write('key', 1, 'job1')).rejects.toThrow('Store "test_store": job "job1" is not in progress');
    });

    it('rejects a job that was never begun', async () => {
      await expect(store.commit('never-begun')).rejects.toThrow(
        'Store "test_store": job "never-begun" is not in progress',
      );
    });
  });

  describe('assertNoJobInProgress', () => {
    it('passes when no job is in progress', () => {
      expect(() => store.rollbackGuard()).not.toThrow();
    });

    it('throws once a job begins, even before it stages anything', () => {
      store.beginJob('job1');
      expect(() => store.rollbackGuard()).toThrow('Store "test_store" has job "job1" in progress');
    });

    it('passes again once the job is discarded', async () => {
      store.beginJob('job1');
      await store.write('key', 1, 'job1');
      await store.discardStaged('job1');
      expect(() => store.rollbackGuard()).not.toThrow();
    });

    it('passes again once the job is committed', async () => {
      store.beginJob('job1');
      await store.write('key', 1, 'job1');
      await store.commit('job1');
      expect(() => store.rollbackGuard()).not.toThrow();
    });
  });
});

type TestDb = { values: AztecAsyncMap<string, number> };

class TestStore extends BaseStagingStore<Map<string, number>, TestDb> {
  constructor(store: AztecAsyncKVStore) {
    super({
      storeName: 'test_store',
      store,
      buildStaging: () => new Map(),
      buildDb: db => ({ values: db.openMap('values') }),
    });
  }

  protected async flushStaged(staging: Map<string, number>, db: TestDb): Promise<void> {
    for (const [key, value] of staging) {
      await db.values.set(key, value);
    }
  }

  write(key: string, value: number, jobId: JobId): Promise<void> {
    return this.withStaging(jobId, staging => {
      staging.set(key, value);
      return Promise.resolve();
    });
  }

  // Runs an arbitrary operation body under the job's lock.
  op<R>(fn: () => Promise<R>, jobId: JobId): Promise<R> {
    return this.withStaging(jobId, () => fn());
  }

  readStaged(key: string, jobId: JobId): Promise<number | undefined> {
    return this.withStaging(jobId, staging => Promise.resolve(staging.get(key)));
  }

  committed(key: string): Promise<number | undefined> {
    return this.joblessDb.values.getAsync(key);
  }

  rollbackGuard(): void {
    this.assertNoJobInProgress();
  }
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
