import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { L2Block, L2BlockId, PublishedL2Block } from '@aztec/stdlib/block';
import type { BlockHeader } from '@aztec/stdlib/tx';

import { jestExpect as expect } from '@jest/expect';

import type { L2TipsStore } from '../l2_block_stream/index.js';

export function testL2TipsStore(makeTipsStore: () => Promise<L2TipsStore>) {
  let tipsStore: L2TipsStore;

  beforeEach(async () => {
    tipsStore = await makeTipsStore();
  });

  const makeBlock = (number: number): PublishedL2Block => ({
    block: { number, header: { hash: () => Promise.resolve(new Fr(number)) } as BlockHeader } as L2Block,
    l1: { blockNumber: BigInt(number), blockHash: `0x${number}`, timestamp: BigInt(number) },
    attestations: [],
  });

  const makeBlockId = (number: number): L2BlockId => ({
    number,
    hash: new Fr(number).toString(),
  });

  const makeTip = (number: number) => ({ number, hash: number === 0 ? undefined : new Fr(number).toString() });

  const makeTips = (latest: number, proven: number, finalized: number) => ({
    latest: makeTip(latest),
    proven: makeTip(proven),
    finalized: makeTip(finalized),
  });

  it('returns zero if no tips are stored', async () => {
    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(0, 0, 0));
  });

  it('stores chain tips', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(20, i => makeBlock(i + 1)) });

    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(5) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(8) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-pruned', block: makeBlockId(10) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(10, 8, 5));
  });

  it('sets latest tip from blocks added', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(3, i => makeBlock(i + 1)) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(3, 0, 0));

    expect(await tipsStore.getL2BlockHash(1)).toEqual(new Fr(1).toString());
    expect(await tipsStore.getL2BlockHash(2)).toEqual(new Fr(2).toString());
    expect(await tipsStore.getL2BlockHash(3)).toEqual(new Fr(3).toString());
  });

  it('clears block hashes when setting finalized chain', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(3) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(5, 3, 3));

    expect(await tipsStore.getL2BlockHash(1)).toBeUndefined();
    expect(await tipsStore.getL2BlockHash(2)).toBeUndefined();

    expect(await tipsStore.getL2BlockHash(3)).toEqual(new Fr(3).toString());
    expect(await tipsStore.getL2BlockHash(4)).toEqual(new Fr(4).toString());
    expect(await tipsStore.getL2BlockHash(5)).toEqual(new Fr(5).toString());
  });

  // Regression test for #13142
  it('does not blow up when setting proven chain on an unseen block number', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [makeBlock(5)] });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(5, 3, 0));
  });
}
