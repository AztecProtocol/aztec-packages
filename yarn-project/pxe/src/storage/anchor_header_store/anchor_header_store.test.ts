import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BlockHeader } from '@aztec/stdlib/tx';

import { AnchorHeaderStore } from './anchor_header_store.js';

describe('AnchorHeaderStore', () => {
  let kv: Awaited<ReturnType<typeof openTmpStore>>;
  let store: AnchorHeaderStore;

  beforeEach(async () => {
    kv = await openTmpStore('anchor-header-store-test');
    store = new AnchorHeaderStore(kv);
  });

  it('round-trips the synchronized header', async () => {
    const header = BlockHeader.empty();
    await store.setHeader(header);
    expect((await store.getBlockHeader()).toBuffer()).toEqual(header.toBuffer());
  });

  it('throws when reading before a header is set', async () => {
    await expect(store.getBlockHeader()).rejects.toThrow(/not-yet-synchronized/);
  });
});
