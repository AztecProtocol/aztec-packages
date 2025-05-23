import { randomBytes } from '@aztec/foundation/crypto';

import { expect } from 'chai';

import type { AztecAsyncMap } from '../interfaces/map.js';
import { openTmpStore } from './factory.js';
import { AztecLMDBStoreV2 } from './store.js';
import type { WriteTransaction } from './write_transaction.js';

describe('Clean shutdown', () => {
  let store: AztecLMDBStoreV2;
  let map: AztecAsyncMap<string, string>;

  beforeEach(async () => {
    store = await openTmpStore('test');
    map = store.openMap<string, string>('test');
  });

  it('Ensures clean closing of the database', async () => {
    const numValues = 1000;
    await store.transactionAsync(async (_: WriteTransaction) => {
      for (let i = 0; i < numValues; i++) {
        const key = i.toString();
        const value = randomBytes(16).toString('hex');
        await map.set(key, value);
      }
    });

    // Queue up 2 lots of reads with a close in the middle, there should be no unrecoverable errors
    // though not all reads will complete
    const reads = Array.from({ length: numValues }).map((_, index) =>
      map
        .getAsync((index % numValues).toString())
        .then(_ => true)
        .catch(_ => false),
    );

    const close = store
      .delete()
      .then(_ => true)
      .catch(_ => false);

    const reads2 = Array.from({ length: numValues }).map((_, index) =>
      map
        .getAsync((index % numValues).toString())
        .then(_ => true)
        .catch(_ => false),
    );

    const numSuccessfulReads = (await Promise.all(reads.concat(reads2))).filter(x => x).length;
    const closeSuccess = await close;

    // The fact that we are here suggests that everything completed success fully. There were no unrecoverable errors within the NAPI module
    expect(numSuccessfulReads).greaterThanOrEqual(0);
    expect(numSuccessfulReads).lessThanOrEqual(reads.length + reads2.length);
    expect(closeSuccess).to.equal(true);
  });
});
