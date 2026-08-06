import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { SiblingPath } from '@aztec/foundation/trees';

import { Body } from '../block/body.js';
import { TxEffectMembershipWitnessSchema, computeTxEffectMembershipWitness } from './tx_effect_membership.js';

describe('TxEffectMembershipWitness', () => {
  const makeBody = (txsPerBlock: number) => Body.random({ txsPerBlock, maxEffects: 1, numPublicCallsPerTx: 1 });

  it('round trips through the schema', () => {
    const witness = {
      blockNumber: BlockNumber(7),
      root: Fr.random(),
      leafIndex: 3n,
      siblingPath: new SiblingPath(2, [Fr.random().toBuffer(), Fr.random().toBuffer()]),
    };
    expect(jsonParseWithSchema(jsonStringify(witness), TxEffectMembershipWitnessSchema)).toEqual(witness);
  });

  it('builds witnesses against the same root the block body commits to', async () => {
    const body = await makeBody(5);
    const root = await body.computeTxEffectsTreeRoot();

    for (let txIndex = 0; txIndex < body.txEffects.length; txIndex++) {
      const witness = await computeTxEffectMembershipWitness(body.txEffects, txIndex);
      expect(witness.root).toEqual(root);
    }
  });

  it('builds an empty witness for a single-tx block', async () => {
    const body = await makeBody(1);
    const witness = await computeTxEffectMembershipWitness(body.txEffects, 0);

    expect(witness.siblingPath.pathSize).toBe(0);
    expect(witness.leafIndex).toBe(0n);
    expect(witness.root).toEqual(await body.txEffects[0].computeTxEffectLeaf());
  });

  it('throws for a tx index outside the block', async () => {
    const body = await makeBody(2);
    await expect(computeTxEffectMembershipWitness(body.txEffects, 2)).rejects.toThrow('out of bounds');
  });
});
