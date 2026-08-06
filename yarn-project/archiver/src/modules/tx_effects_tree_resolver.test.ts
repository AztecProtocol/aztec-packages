import { DomainSeparator } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { Body } from '@aztec/stdlib/block';
import { type TxEffectMembershipWitness, TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type TxEffectsTreeArchiverView, TxEffectsTreeResolver } from './tx_effects_tree_resolver.js';

/** Block number every fixture block is served at. */
const BLOCK_NUMBER = BlockNumber(7);

describe('TxEffectsTreeResolver', () => {
  let archiver: MockProxy<TxEffectsTreeArchiverView>;
  let resolver: TxEffectsTreeResolver;

  beforeEach(() => {
    archiver = mock<TxEffectsTreeArchiverView>();
    resolver = new TxEffectsTreeResolver(archiver, makeFakeStore());
  });

  it('returns undefined for a tx the archiver does not know', async () => {
    archiver.getTxEffect.mockResolvedValue(undefined);
    expect(await resolver.getTxEffectMembershipWitness(TxHash.random())).toBeUndefined();
  });

  it('returns undefined when the tx is indexed but its block is gone', async () => {
    const body = await makeBody(2);
    await wireArchiver(archiver, body);
    archiver.getBlock.mockResolvedValue(undefined);

    expect(await resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).toBeUndefined();
  });

  it('builds a verifiable witness for every tx of a multi-tx block', async () => {
    const body = await makeBody(3);
    const root = await wireArchiver(archiver, body);

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
    await wireArchiver(archiver, body);

    const witnesses = await Promise.all(
      body.txEffects.map(txEffect => resolver.getTxEffectMembershipWitness(txEffect.txHash)),
    );

    expect(witnesses.map(w => w!.siblingPath.pathSize)).toEqual([2, 2, 1]);
    expect(witnesses.map(w => w!.leafIndex)).toEqual([0n, 1n, 1n]);
  });

  it('builds an empty witness for a single-tx block', async () => {
    const body = await makeBody(1);
    const root = await wireArchiver(archiver, body);

    const witness = await resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash);
    expect(witness!.siblingPath.pathSize).toBe(0);
    expect(witness!.leafIndex).toBe(0n);
    expect(witness!.root).toEqual(root);
    expect(root).toEqual(await body.txEffects[0].computeTxEffectLeaf());
  });

  it('throws when the stored tx effects do not hash up to the root in the block header', async () => {
    const body = await makeBody(2);
    await wireArchiver(archiver, body, Fr.random());

    await expect(resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).rejects.toThrow(
      'does not match its header',
    );
  });

  it('throws when the tx index does not point at the tx it was looked up by', async () => {
    const body = await makeBody(2);
    await wireArchiver(archiver, body);
    archiver.getTxEffect.mockResolvedValue({
      l2BlockNumber: BLOCK_NUMBER,
      txIndexInBlock: 1,
    } as never);

    await expect(resolver.getTxEffectMembershipWitness(body.txEffects[0].txHash)).rejects.toThrow('is indexed at');
  });
});

/**
 * Store double whose `transactionAsync` just runs the callback. The archiver view is mocked here, so there is no real
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
 * Wires the archiver view to serve a single block holding `body`, indexing each of its txs by position. Returns the
 * root the block header commits to, which is the body's own root unless `headerRoot` overrides it.
 */
async function wireArchiver(archiver: MockProxy<TxEffectsTreeArchiverView>, body: Body, headerRoot?: Fr): Promise<Fr> {
  const txEffectsTreeRoot = headerRoot ?? (await body.computeTxEffectsTreeRoot());
  archiver.getBlock.mockResolvedValue({ number: BLOCK_NUMBER, header: { txEffectsTreeRoot }, body } as never);
  archiver.getTxEffect.mockImplementation(((txHash: TxHash) => {
    const txIndexInBlock = body.txEffects.findIndex(txEffect => txEffect.txHash.equals(txHash));
    if (txIndexInBlock === -1) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({ l2BlockNumber: BLOCK_NUMBER, txIndexInBlock });
  }) as never);
  return txEffectsTreeRoot;
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
