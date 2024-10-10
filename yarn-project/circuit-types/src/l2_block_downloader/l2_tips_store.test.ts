import { Fr, type Header } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';

import { type L2Block } from '../l2_block.js';
import { L2TipsStore } from './l2_tips_store.js';

describe('L2TipsStore', () => {
  let kvStore: AztecKVStore;
  let tipsStore: L2TipsStore;

  beforeEach(() => {
    kvStore = openTmpStore(true);
    tipsStore = new L2TipsStore(kvStore);
  });

  const makeBlock = (number: number): L2Block =>
    ({ number, header: { hash: () => new Fr(number) } as Header } as L2Block);

  it('returns zero if no tips are stored', async () => {
    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual({ latest: 0, finalized: 0, proven: 0 });
  });

  it('stores chain tips', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', blockNumber: 5 });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', blockNumber: 8 });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-pruned', blockNumber: 10 });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual({ latest: 10, finalized: 5, proven: 8 });
  });

  it('sets latest tip from blocks added', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(3, i => makeBlock(i + 1)) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual({ latest: 3, finalized: 0, proven: 0 });

    expect(await tipsStore.getL2BlockHash(1)).toEqual(new Fr(1).toString());
    expect(await tipsStore.getL2BlockHash(2)).toEqual(new Fr(2).toString());
    expect(await tipsStore.getL2BlockHash(3)).toEqual(new Fr(3).toString());
  });

  it('clears block hashes when setting finalized chain', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', blockNumber: 3 });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual({ latest: 5, finalized: 3, proven: 0 });

    expect(await tipsStore.getL2BlockHash(1)).toBeUndefined();
    expect(await tipsStore.getL2BlockHash(2)).toBeUndefined();

    expect(await tipsStore.getL2BlockHash(3)).toEqual(new Fr(3).toString());
    expect(await tipsStore.getL2BlockHash(4)).toEqual(new Fr(4).toString());
    expect(await tipsStore.getL2BlockHash(5)).toEqual(new Fr(5).toString());
  });
});
