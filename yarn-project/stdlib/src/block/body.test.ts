import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { Body } from './body.js';

describe('Body', () => {
  it('converts to and from buffer', async () => {
    const body = await Body.random();
    const buf = body.toBuffer();
    expect(Body.fromBuffer(buf)).toEqual(body);
  });

  it('converts to and from blob data', async () => {
    const body = await Body.random();
    const fields = body.toTxBlobData();
    expect(Body.fromTxBlobData(fields)).toEqual(body);
  });

  it('converts to and from empty blob data', () => {
    const body = Body.empty();
    const fields = body.toTxBlobData();
    expect(Body.fromTxBlobData(fields)).toEqual(body);
  });

  it('convert to and from json', async () => {
    const body = await Body.random();
    const parsed = Body.schema.parse(JSON.parse(jsonStringify(body)));
    expect(parsed).toEqual(body);
  });

  describe('tx effects tree root', () => {
    const node = (left: Fr, right: Fr) => poseidon2HashWithSeparator([left, right], DomainSeparator.TX_EFFECTS_TREE);

    const makeBody = (txsPerBlock: number) => Body.random({ txsPerBlock, maxEffects: 1, numPublicCallsPerTx: 1 });

    const leaves = (body: Body) => Promise.all(body.txEffects.map(txEffect => txEffect.computeTxEffectLeaf()));

    it('is zero for a block with no txs', async () => {
      expect(await Body.empty().computeTxEffectsTreeRoot()).toEqual(Fr.ZERO);
    });

    it('is the leaf itself for one tx', async () => {
      const body = await makeBody(1);
      const [leaf] = await leaves(body);
      expect(await body.computeTxEffectsTreeRoot()).toEqual(leaf);
    });

    it('pairs the leaves for two txs', async () => {
      const body = await makeBody(2);
      const [l0, l1] = await leaves(body);
      expect(await body.computeTxEffectsTreeRoot()).toEqual(await node(l0, l1));
    });

    it('shifts the odd leaf up for three txs', async () => {
      const body = await makeBody(3);
      const [l0, l1, l2] = await leaves(body);
      expect(await body.computeTxEffectsTreeRoot()).toEqual(await node(await node(l0, l1), l2));
    });

    it('fills the left subtree greedily for five txs', async () => {
      const body = await makeBody(5);
      const [l0, l1, l2, l3, l4] = await leaves(body);
      const left = await node(await node(l0, l1), await node(l2, l3));
      expect(await body.computeTxEffectsTreeRoot()).toEqual(await node(left, l4));
    });
  });
});
