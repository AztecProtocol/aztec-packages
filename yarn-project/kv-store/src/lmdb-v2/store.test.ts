import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';

import { expect } from 'chai';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { stub } from 'sinon';

import { openStoreAt, openTmpStore } from './factory.js';
import type { ReadTransaction } from './read_transaction.js';
import type { AztecLMDBStoreV2 } from './store.js';

const testMaxReaders = 4;

describe('AztecLMDBStoreV2', () => {
  let store: AztecLMDBStoreV2;

  beforeEach(async () => {
    store = await openTmpStore('test', true, 10 * 1024 * 1024, testMaxReaders, undefined);
  });

  afterEach(async () => {
    await store.delete();
  });

  it('returns undefined for unset keys', async () => {
    const tx = store.getReadTx();
    try {
      expect(await tx.get(Buffer.from('foo'))).to.be.undefined;
      expect(await tx.getIndex(Buffer.from('foo'))).to.deep.eq([]);
    } finally {
      tx.close();
    }
  });

  it('reads and writes in separate txs', async () => {
    const writeChecks = promiseWithResolvers<void>();
    const delay = promiseWithResolvers<void>();
    const getValues = async (tx?: ReadTransaction) => {
      let shouldClose = false;
      if (!tx) {
        tx = store.getCurrentWriteTx();
        if (!tx) {
          shouldClose = true;
          tx = store.getReadTx();
        }
      }

      try {
        const data = await tx.get(Buffer.from('foo'));
        const index = await tx.getIndex(Buffer.from('foo'));

        return {
          data,
          index,
        };
      } finally {
        if (shouldClose) {
          tx.close();
        }
      }
    };

    // before doing any writes, we should have an empty db
    expect(await getValues()).to.deep.eq({
      data: undefined,
      index: [],
    });

    // start a write and run some checks but prevent the write tx from finishing immediately in order to run concurrent reads
    const writeCommitted = store.transactionAsync(async writeTx => {
      await writeTx.set(Buffer.from('foo'), Buffer.from('bar'));
      await writeTx.setIndex(Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz'));

      // the write tx should make the writes visible immediately
      expect(await getValues(writeTx)).to.deep.eq({
        data: Buffer.from('bar'),
        index: [Buffer.from('bar'), Buffer.from('baz')],
      });

      // even without access to the tx, the writes should still be visible in this context
      expect(await getValues()).to.deep.eq({
        data: Buffer.from('bar'),
        index: [Buffer.from('bar'), Buffer.from('baz')],
      });

      writeChecks.resolve();

      // prevent this write from ending
      await delay.promise;
    });

    // we don't know a write is happening, so we should get an empty result back
    expect(await getValues()).to.deep.eq({
      data: undefined,
      index: [],
    });

    // wait for the batch checks to complete
    await writeChecks.promise;

    // to batch is ready but uncommmitted, we should still see empty data
    expect(await getValues()).to.deep.eq({
      data: undefined,
      index: [],
    });

    delay.resolve();
    await writeCommitted;

    // now we should see the db update
    expect(await getValues()).to.deep.eq({
      data: Buffer.from('bar'),
      index: [Buffer.from('bar'), Buffer.from('baz')],
    });
  });

  it('should serialize writes correctly', async () => {
    const key = Buffer.from('foo');
    const inc = () =>
      store.transactionAsync(async tx => {
        const buf = Buffer.from((await store.getReadTx().get(key)) ?? Buffer.alloc(4));
        buf.writeUint32BE(buf.readUInt32BE() + 1);
        await tx.set(key, buf);
      });

    const promises: Promise<void>[] = [];
    const rounds = 100;
    for (let i = 0; i < rounds; i++) {
      promises.push(inc());
    }

    await Promise.all(promises);
    expect(Buffer.from((await store.getReadTx().get(key))!).readUint32BE()).to.eq(rounds);
  });

  it('guards against too many cursors being opened at the same time', async () => {
    await store.transactionAsync(async tx => {
      for (let i = 0; i < 100; i++) {
        await tx.set(Buffer.from(String(i)), Buffer.from(String(i)));
      }
    });

    const readTx = store.getReadTx();
    const cursors: AsyncIterator<[Uint8Array, Uint8Array]>[] = [];

    // fill up with cursors
    for (let i = 0; i < testMaxReaders; i++) {
      cursors.push(readTx.iterate(Buffer.from('1'))[Symbol.asyncIterator]());
    }

    // the first few iterators should be fine
    await expect(Promise.all(cursors.slice(0, -1).map(it => it.next()))).eventually.to.deep.eq([
      { value: [Buffer.from('1'), Buffer.from('1')], done: false },
      { value: [Buffer.from('1'), Buffer.from('1')], done: false },
      { value: [Buffer.from('1'), Buffer.from('1')], done: false },
    ]);

    // this promise should be blocked until we release a cursor
    const fn = stub();
    cursors.at(-1)!.next().then(fn, fn);

    expect(fn.notCalled).to.be.true;
    await sleep(100);
    expect(fn.notCalled).to.be.true;

    // but we can still do regular reads
    await expect(readTx.get(Buffer.from('99'))).eventually.to.deep.eq(Buffer.from('99'));

    // early-return one of the cursors
    await cursors[0].return!();

    // this should have unblocked the last cursor from progressing
    await sleep(10);
    expect(fn.calledWith({ value: [Buffer.from('1'), Buffer.from('1')], done: false })).to.be.true;

    for (let i = 1; i < testMaxReaders; i++) {
      await cursors[i].return!();
    }

    readTx.close();
  });

  it('copies and restores data', async () => {
    const key = Buffer.from('foo');
    const value = Buffer.from('bar');
    await store.transactionAsync(tx => tx.set(key, value));
    expect(Buffer.from((await store.getReadTx().get(key))!).toString()).to.eq('bar');

    const backupDir = await mkdtemp(join(tmpdir(), 'lmdb-store-test-backup'));
    await store.backupTo(backupDir, true);

    const store2 = await openStoreAt(backupDir);
    expect(Buffer.from((await store2.getReadTx().get(key))!).toString()).to.eq('bar');
    await store2.close();
    await store2.delete();
  });
});
