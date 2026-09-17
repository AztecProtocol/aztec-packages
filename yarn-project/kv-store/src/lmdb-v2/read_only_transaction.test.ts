import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';

import { openTmpStore } from './factory.js';
import type { ReadTransaction } from './read_transaction.js';
import type { AztecLMDBStoreV2 } from './store.js';

const testMaxReaders = 4;

describe('AztecLMDBStoreV2 readOnlyTransaction', () => {
  let store: AztecLMDBStoreV2;

  beforeEach(async () => {
    store = await openTmpStore('test', true, 10 * 1024 * 1024, testMaxReaders, undefined);
  });

  afterEach(async () => {
    await store.delete();
  });

  it('keeps reads on one snapshot while a concurrent write commits', async () => {
    const key = Buffer.from('foo');
    await store.transactionAsync(tx => tx.set(key, Buffer.from('v1')));

    const opened = promiseWithResolvers<void>();
    const writeCommitted = promiseWithResolvers<void>();

    const snapshotReads = store.readOnlyTransaction(async tx => {
      const first = await tx.get(key);
      opened.resolve();
      // The write below has to land while this snapshot is open, which is only possible because readers neither
      // block the writer nor queue behind it.
      await writeCommitted.promise;
      const second = await tx.get(key);
      return [first, second];
    });

    await opened.promise;
    await store.transactionAsync(tx => tx.set(key, Buffer.from('v2')));
    writeCommitted.resolve();

    const [first, second] = await snapshotReads;
    expect(Buffer.from(first!).toString()).toBe('v1');
    expect(Buffer.from(second!).toString()).toBe('v1');

    // outside the snapshot the new value is visible
    expect(Buffer.from((await store.getReadTx().get(key))!).toString()).toBe('v2');
  });

  it('makes the snapshot visible to ambient container reads', async () => {
    const map = store.openMap<string, string>('ambient');
    await map.set('k', 'v1');

    const opened = promiseWithResolvers<void>();
    const writeCommitted = promiseWithResolvers<void>();

    const snapshotReads = store.readOnlyTransaction(async () => {
      const first = await map.getAsync('k');
      opened.resolve();
      await writeCommitted.promise;
      return [first, await map.getAsync('k'), await map.hasAsync('k')];
    });

    await opened.promise;
    await map.set('k', 'v2');
    writeCommitted.resolve();

    await expect(snapshotReads).resolves.toEqual(['v1', 'v1', true]);
    await expect(map.getAsync('k')).resolves.toBe('v2');
  });

  it('does not observe rows committed after the snapshot was taken while iterating', async () => {
    const map = store.openMap<string, string>('iteration');
    await store.transactionAsync(async () => {
      await map.set('a', '1');
      await map.set('b', '2');
    });

    const opened = promiseWithResolvers<void>();
    const writeCommitted = promiseWithResolvers<void>();

    const snapshotEntries = store.readOnlyTransaction(async () => {
      // read once so the snapshot is definitely established before the write lands
      await map.getAsync('a');
      opened.resolve();
      await writeCommitted.promise;

      const entries: [string, string][] = [];
      for await (const entry of map.entriesAsync()) {
        entries.push(entry);
      }
      return { entries, size: await map.sizeAsync() };
    });

    await opened.promise;
    await map.set('c', '3');
    writeCommitted.resolve();

    await expect(snapshotEntries).resolves.toEqual({
      entries: [
        ['a', '1'],
        ['b', '2'],
      ],
      size: 2,
    });

    // and the row is there once the snapshot is gone
    await expect(map.sizeAsync()).resolves.toBe(3);
  });

  it('reuses the enclosing snapshot when nested', async () => {
    const map = store.openMap<string, string>('nested');
    await map.set('k', 'v1');

    const opened = promiseWithResolvers<void>();
    const writeCommitted = promiseWithResolvers<void>();

    const reads = store.readOnlyTransaction(async outerTx => {
      await map.getAsync('k');
      opened.resolve();
      await writeCommitted.promise;

      return await store.readOnlyTransaction(async innerTx => ({
        sameTx: innerTx === outerTx,
        value: await map.getAsync('k'),
      }));
    });

    await opened.promise;
    await map.set('k', 'v2');
    writeCommitted.resolve();

    await expect(reads).resolves.toEqual({ sameTx: true, value: 'v1' });
  });

  it('sees uncommitted writes when nested inside a write transaction', async () => {
    const map = store.openMap<string, string>('nested-write');
    await map.set('k', 'v1');

    const result = await store.transactionAsync(writeTx =>
      store.readOnlyTransaction(async tx => {
        await map.set('k', 'v2');
        return { sameTx: tx === writeTx, value: await map.getAsync('k') };
      }),
    );

    expect(result).toEqual({ sameTx: true, value: 'v2' });
  });

  it('queues snapshots on the available reader slots instead of failing', async () => {
    const map = store.openMap<string, string>('slots');
    await map.set('k', 'v');

    const release = promiseWithResolvers<void>();
    const readerCount = testMaxReaders * 3;
    const readers = Array.from({ length: readerCount }, () =>
      store.readOnlyTransaction(async () => {
        await release.promise;
        return map.getAsync('k');
      }),
    );

    // more snapshots were requested than there are reader slots, so some of these are still queued
    await sleep(100);
    release.resolve();

    await expect(Promise.all(readers)).resolves.toEqual(Array.from({ length: readerCount }, () => 'v'));
  });

  it('iterates inside a snapshot even when every reader slot is taken', async () => {
    const map = store.openMap<string, string>('drained');
    await store.transactionAsync(async () => {
      for (let i = 0; i < 20; i++) {
        await map.set(String(i).padStart(2, '0'), String(i));
      }
    });

    // one snapshot per available reader slot: the store keeps one reader back for one-shot reads
    const release = promiseWithResolvers<void>();
    const opened: Promise<void>[] = [];
    const holders: Promise<number>[] = [];
    for (let i = 0; i < testMaxReaders - 1; i++) {
      const isOpen = promiseWithResolvers<void>();
      opened.push(isOpen.promise);
      holders.push(
        store.readOnlyTransaction(async () => {
          isOpen.resolve();
          // Iterating needs a cursor bound to this snapshot. Were it to take a reader slot of its own it would
          // block forever, because every slot is held by one of these snapshots.
          let count = 0;
          for await (const _ of map.entriesAsync()) {
            count++;
          }
          await release.promise;
          return count;
        }),
      );
    }

    await Promise.all(opened);
    release.resolve();
    await expect(Promise.all(holders)).resolves.toEqual(Array.from({ length: testMaxReaders - 1 }, () => 20));

    // every reader slot was handed back, so a fresh snapshot still opens afterwards
    await expect(store.readOnlyTransaction(() => map.getAsync('05'))).resolves.toBe('5');
  });

  it('rejects reads inside the callback once the store is closed', async () => {
    const map = store.openMap<string, string>('closing');
    await map.set('k', 'v');

    const opened = promiseWithResolvers<void>();
    const closed = promiseWithResolvers<void>();

    const snapshot = store.readOnlyTransaction(async (tx: ReadTransaction) => {
      expect(await map.getAsync('k')).toBe('v');
      opened.resolve();
      await closed.promise;
      await expect(tx.get(Buffer.from('anything'))).rejects.toThrow('Store is closed');
      await expect(map.getAsync('k')).rejects.toThrow('Store is closed');
    });

    await opened.promise;
    await store.close();
    closed.resolve();

    await snapshot;
  });
});
