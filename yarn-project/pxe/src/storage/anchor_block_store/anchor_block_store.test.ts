import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { AnchorBlockStore } from './anchor_block_store.js';

describe('AnchorBlockStore', () => {
  let kv: Awaited<ReturnType<typeof openTmpStore>>;
  let store: AnchorBlockStore;

  beforeEach(async () => {
    kv = await openTmpStore('anchor-block-store-test');
    store = new AnchorBlockStore(kv);
  });

  it('round-trips the synchronized header', async () => {
    const header = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });
    await store.setHeader(header);
    expect((await store.getBlockHeader()).toBuffer()).toEqual(header.toBuffer());
  });

  it('throws when reading before a header is set', async () => {
    await expect(store.getBlockHeader()).rejects.toThrow(/not-yet-synchronized/);
  });
});
