import { type L2Block } from '@aztec/circuit-types';
import { type BlockHeader, Fr } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { type AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { expect } from 'chai';

import { L2TipsStore } from './l2_tips_store.js';

describe('L2TipsStore', () => {
  let kvStore: AztecAsyncKVStore;
  let tipsStore: L2TipsStore;

  beforeEach(() => {
    kvStore = openTmpStore(true);
    tipsStore = new L2TipsStore(kvStore, 'test');
  });

  afterEach(async () => {
    await kvStore.delete();
  });

  const makeBlock = (number: number): L2Block =>
    ({ number, header: { hash: () => new Fr(number) } as BlockHeader } as L2Block);

  const makeTip = (number: number) => ({ number, hash: number === 0 ? undefined : new Fr(number).toString() });

  const makeTips = (latest: number, proven: number, finalized: number) => ({
    latest: makeTip(latest),
    proven: makeTip(proven),
    finalized: makeTip(finalized),
  });

  it('returns zero if no tips are stored', async () => {
    const tips = await tipsStore.getL2Tips();
    expect(tips).to.deep.equal(makeTips(0, 0, 0));
  });

  it('stores chain tips', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(20, i => makeBlock(i + 1)) });

    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', blockNumber: 5 });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', blockNumber: 8 });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-pruned', blockNumber: 10 });

    const tips = await tipsStore.getL2Tips();
    expect(tips).to.deep.equal(makeTips(10, 8, 5));
  });

  it('sets latest tip from blocks added', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(3, i => makeBlock(i + 1)) });

    const tips = await tipsStore.getL2Tips();
    expect(tips).to.deep.equal(makeTips(3, 0, 0));

    expect(await tipsStore.getL2BlockHash(1)).to.deep.equal(new Fr(1).toString());
    expect(await tipsStore.getL2BlockHash(2)).to.deep.equal(new Fr(2).toString());
    expect(await tipsStore.getL2BlockHash(3)).to.deep.equal(new Fr(3).toString());
  });

  it('clears block hashes when setting finalized chain', async () => {
    await tipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-proven', blockNumber: 3 });
    await tipsStore.handleBlockStreamEvent({ type: 'chain-finalized', blockNumber: 3 });

    const tips = await tipsStore.getL2Tips();
    expect(tips).to.deep.equal(makeTips(5, 3, 3));

    expect(await tipsStore.getL2BlockHash(1)).to.be.undefined;
    expect(await tipsStore.getL2BlockHash(2)).to.be.undefined;

    expect(await tipsStore.getL2BlockHash(3)).to.deep.equal(new Fr(3).toString());
    expect(await tipsStore.getL2BlockHash(4)).to.deep.equal(new Fr(4).toString());
    expect(await tipsStore.getL2BlockHash(5)).to.deep.equal(new Fr(5).toString());
  });
});
