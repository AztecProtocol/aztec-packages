import { promiseWithResolvers } from '@aztec/foundation/promise';

import { expect } from 'chai';

import { ReadTransaction } from './read_transaction.js';
import { AztecLMDBStoreV2 } from './store.js';

describe('AztecLMDBStoreV2', () => {
  let store: AztecLMDBStoreV2;

  beforeEach(async () => {
    store = await AztecLMDBStoreV2.tmp();
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
      tx ??= store.getReadTx();
      const data = await tx.get(Buffer.from('foo'));
      const index = await tx.getIndex(Buffer.from('foo'));

      return {
        data,
        index,
      };
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
});
