import { DomainSeparator } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { Body } from '@aztec/stdlib/block';
import { type TxEffectMembershipWitness, TxHash, computeTxEffectLeaves } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { TxEffectsTreeResolver, type TxEffectsTreeStoreView } from './tx_effects_tree_resolver.js';

/** Block number every fixture block is served at. */
const BLOCK_NUMBER = BlockNumber(7);

describe('TxEffectsTreeResolver', () => {
  let blocks: MockProxy<TxEffectsTreeStoreView>;
  let resolver: TxEffectsTreeResolver;

  beforeEach(() => {
    blocks = mock<TxEffectsTreeStoreView>();
    resolver = new TxEffectsTreeResolver(blocks, makeFakeStore());
  });

  it('returns undefined for a tx the archiver does not know', async () => {
    blocks.getTxEffect.mockResolvedValue(undefined);
    expect(await resolver.getTxEffectMembershipWitness(TxHash.random())).toBeUndefined();
  });

  it('returns undefined when the tx is indexed but its block is gone', async () => {
    const body = await makeBody(2);
    await wireStore(blocks, body);
    blocks.getBlockData.mockResolvedValue(undefined);

    expect(await resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).toBeUndefined();
  });

  it('builds a verifiable witness for every tx of a multi-tx block', async () => {
    const body = await makeBody(3);
    const root = await wireStore(blocks, body);

    for (const txEffect of body.txEffects) {
      const witness = await resolver.getTxEffectMembershipWitness(txEffect.txHash);
      expect(witness).toBeDefined();
      expect(witness!.blockNumber).toBe(BLOCK_NUMBER);
      expect(witness!.root).toEqual(root);
      expect(await reconstructRoot(await txEffect.computeTxEffectLeaf(), witness!)).toEqual(root);
    }
  });

  // The tree is greedily filled, so a 3-leaf tree pairs the first two leaves and shifts the last one up a level.
  it('yields per-leaf path depths matching the unbalanced tree shape', async () => {
    const body = await makeBody(3);
    await wireStore(blocks, body);

    const witnesses = await Promise.all(
      body.txEffects.map(txEffect => resolver.getTxEffectMembershipWitness(txEffect.txHash)),
    );

    expect(witnesses.map(w => w!.siblingPath.pathSize)).toEqual([2, 2, 1]);
    expect(witnesses.map(w => w!.leafIndex)).toEqual([0n, 1n, 1n]);
  });

  it('builds an empty witness for a single-tx block', async () => {
    const body = await makeBody(1);
    const root = await wireStore(blocks, body);

    const witness = await resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash);
    expect(witness!.siblingPath.pathSize).toBe(0);
    expect(witness!.leafIndex).toBe(0n);
    expect(witness!.root).toEqual(root);
    expect(root).toEqual(await body.txEffects[0].computeTxEffectLeaf());
  });

  // Serves a second leaf that does not match the second tx's effects, so a resolver that recomputed the leaves from the
  // block body instead of reading the stored ones would build a different tree and fail the header root check.
  it('builds the witness from the stored leaves rather than recomputing them from the block', async () => {
    const body = await makeBody(2);
    const storedLeaves = [await body.txEffects[0].computeTxEffectLeaf(), Fr.random()];
    const root = await wireStore(blocks, body, await hashPair(storedLeaves[0], storedLeaves[1]));
    blocks.getTxEffectLeaves.mockResolvedValue(storedLeaves);

    const witness = await resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash);

    expect(witness!.root).toEqual(root);
    expect(witness!.siblingPath.toFields()).toEqual([storedLeaves[1]]);
  });

  it('throws when the block has no stored leaves', async () => {
    const body = await makeBody(2);
    await wireStore(blocks, body);
    blocks.getTxEffectLeaves.mockResolvedValue(undefined);

    await expect(resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).rejects.toThrow(
      'No tx effects tree leaves stored for block 7',
    );
  });

  it('throws when the stored leaves do not hash up to the root in the block header', async () => {
    const body = await makeBody(2);
    await wireStore(blocks, body, Fr.random());

    await expect(resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).rejects.toThrow(
      'does not match its header',
    );
  });

  it('throws when the stored leaf does not match the effects served for the tx', async () => {
    const body = await makeBody(2);
    await wireStore(blocks, body);
    blocks.getTxEffectLeaves.mockResolvedValue([Fr.random(), await body.txEffects[1].computeTxEffectLeaf()]);

    await expect(resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).rejects.toThrow('is indexed at');
  });

  it('throws when the tx index does not point at the tx it was looked up by', async () => {
    const body = await makeBody(2);
    await wireStore(blocks, body);
    blocks.getTxEffect.mockResolvedValue({
      l2BlockNumber: BLOCK_NUMBER,
      txIndexInBlock: 1,
      data: body.txEffects[0],
    } as never);

    await expect(resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).rejects.toThrow('is indexed at');
  });
});

/**
 * Store double whose `transactionAsync` just runs the callback. The store view is mocked here, so there is no real
 * snapshot to isolate; the resolver only needs the callback invoked.
 */
function makeFakeStore(): AztecAsyncKVStore {
  const store = mock<AztecAsyncKVStore>();
  store.transactionAsync.mockImplementation(callback => callback());
  return store;
}

function makeBody(txsPerBlock: number): Promise<Body> {
  return Body.random({ txsPerBlock, maxEffects: 1, numPublicCallsPerTx: 1 });
}

/**
 * Wires the store view to serve a single block holding `body`: the block's header, its stored tx effects tree leaves,
 * and each of its txs indexed by position. Returns the root the block header commits to, which is the body's own root
 * unless `headerRoot` overrides it.
 */
async function wireStore(blocks: MockProxy<TxEffectsTreeStoreView>, body: Body, headerRoot?: Fr): Promise<Fr> {
  const txEffectsTreeRoot = headerRoot ?? (await body.computeTxEffectsTreeRoot());
  blocks.getBlockData.mockResolvedValue({ header: { txEffectsTreeRoot } } as never);
  blocks.getTxEffectLeaves.mockResolvedValue(await computeTxEffectLeaves(body.txEffects));
  blocks.getTxEffect.mockImplementation(((txHash: TxHash) => {
    const txIndexInBlock = body.txEffects.findIndex(txEffect => txEffect.txHash.equals(txHash));
    if (txIndexInBlock === -1) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({ l2BlockNumber: BLOCK_NUMBER, txIndexInBlock, data: body.txEffects[txIndexInBlock] });
  }) as never);
  return txEffectsTreeRoot;
}

/** Hashes a pair of nodes the way the tx effects tree does. */
function hashPair(left: Fr, right: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([left, right], DomainSeparator.TX_EFFECTS_TREE);
}

/** Hashes `leaf` up the witness' sibling path, taking the side of each step from the leaf index. */
async function reconstructRoot(leaf: Fr, witness: TxEffectMembershipWitness): Promise<Fr> {
  let node = leaf;
  let index = witness.leafIndex;
  for (const sibling of witness.siblingPath.toFields()) {
    const pair = index % 2n === 0n ? [node, sibling] : [sibling, node];
    node = await poseidon2HashWithSeparator(pair, DomainSeparator.TX_EFFECTS_TREE);
    index >>= 1n;
  }
  return node;
}
