import { AztecNode, Fr } from '@aztec/aztec.js';
import { SiblingPath } from '@aztec/circuit-types';
import { SHA256 } from '@aztec/merkle-tree';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { setup } from './fixtures/utils.js';

describe('L1Publisher integration', () => {
  let teardown: () => void;
  let aztecNode: AztecNode;
  const sha256 = new SHA256();

  beforeEach(async () => {
    ({ teardown, aztecNode } = await setup(1));
  }, 100_000);

  afterAll(() => teardown());

  it('Checks the sibling path of the empty setup of two blocks of two empty tx effects each', async () => {
    const blockNumber = await aztecNode.getBlockNumber();

    const block = await aztecNode.getBlock(blockNumber);

    const l2ToL1Messages = block?.body.txEffects.flatMap(txEffect =>
      txEffect.l2ToL1Msgs.map(l2ToL1Message => l2ToL1Message.toBuffer()),
    );

    expect(l2ToL1Messages?.length).toBe(4);

    const siblingPath = await aztecNode.getL2ToL1MessageSiblingPath(blockNumber, Fr.ZERO);

    expect(siblingPath.pathSize).toBe(2);

    const expectedSiblingPath = new SiblingPath(siblingPath.pathSize, [
      Fr.ZERO.toBuffer(),
      sha256.hash(Fr.ZERO.toBuffer(), Fr.ZERO.toBuffer()),
    ]);
    expect(siblingPath.toString()).toBe(expectedSiblingPath.toString());
  }, 36_000);
});
