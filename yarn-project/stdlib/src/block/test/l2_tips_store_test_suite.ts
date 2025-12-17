import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type L2BlockId, L2BlockNew } from '@aztec/stdlib/block';

import { jestExpect as expect } from '@jest/expect';

import type { L2TipsStore } from '../l2_block_stream/index.js';

export function testL2TipsStore(makeTipsStore: () => Promise<L2TipsStore>) {
  let tipsStore: L2TipsStore;
  // Track blocks and their hashes for test assertions
  const blockHashes: Map<number, string> = new Map();

  beforeEach(async () => {
    tipsStore = await makeTipsStore();
    blockHashes.clear();
  });

  const makeBlock = async (number: number): Promise<L2BlockNew> => {
    const block = await L2BlockNew.random(BlockNumber(number));
    blockHashes.set(number, (await block.hash()).toString());
    return block;
  };

  const makeBlockId = (number: number): L2BlockId => ({
    number: BlockNumber(number),
    hash: blockHashes.get(number) ?? new Fr(number).toString(),
  });

  const makeTip = (number: number): L2BlockId => ({
    number: BlockNumber(number),
    hash: number === 0 ? GENESIS_BLOCK_HEADER_HASH.toString() : (blockHashes.get(number) ?? new Fr(number).toString()),
  });

  const makeTips = (latest: number, proven: number, finalized: number) => ({
    blocks: {
      latest: makeTip(latest),
      proven: makeTip(proven),
      finalized: makeTip(finalized),
    },
  });

  it('returns zero if no tips are stored', async () => {
    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(0, 0, 0));
  });

  it('stores chain tips', async () => {
    await tipsStore.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await Promise.all(times(20, i => makeBlock(i + 1))),
    });

    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(5) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(8) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-pruned', block: makeBlockId(10) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(10, 8, 5));
  });

  it('sets latest tip from blocks added', async () => {
    await tipsStore.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await Promise.all(times(3, i => makeBlock(i + 1))),
    });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(3, 0, 0));

    expect(await tipsStore.getL2BlockHash(1)).toEqual(blockHashes.get(1));
    expect(await tipsStore.getL2BlockHash(2)).toEqual(blockHashes.get(2));
    expect(await tipsStore.getL2BlockHash(3)).toEqual(blockHashes.get(3));
  });

  it('clears block hashes when setting finalized chain', async () => {
    await tipsStore.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await Promise.all(times(5, i => makeBlock(i + 1))),
    });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(3) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(5, 3, 3));

    expect(await tipsStore.getL2BlockHash(1)).toBeUndefined();
    expect(await tipsStore.getL2BlockHash(2)).toBeUndefined();

    expect(await tipsStore.getL2BlockHash(3)).toEqual(blockHashes.get(3));
    expect(await tipsStore.getL2BlockHash(4)).toEqual(blockHashes.get(4));
    expect(await tipsStore.getL2BlockHash(5)).toEqual(blockHashes.get(5));
  });

  // Regression test for #13142
  it('does not blow up when setting proven chain on an unseen block number', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [await makeBlock(5)] });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).toEqual(makeTips(5, 3, 0));
  });
}
