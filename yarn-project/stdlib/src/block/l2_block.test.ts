import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { L2Block } from './l2_block.js';
import { L2BlockHeader } from './l2_block_header.js';

describe('L2Block', () => {
  it('can serialize an L2 block with logs to a buffer and back', async () => {
    const block = await L2Block.random(BlockNumber(42));

    const buffer = block.toBuffer();
    const recovered = L2Block.fromBuffer(buffer);

    expect(recovered).toEqual(block);
  });

  it('convert to and from json', async () => {
    const block = await L2Block.random(BlockNumber(42));
    const parsed = L2Block.schema.parse(JSON.parse(jsonStringify(block)));
    expect(parsed).toEqual(block);
  });
  it('can create an initial block', async () => {
    // Values taken from world_state.test.cpp WorldStateTest.GetInitialTreeInfoForAllTrees
    const emptyBlockHeader = L2BlockHeader.empty();
    emptyBlockHeader.state.l1ToL2MessageTree.root = Fr.fromString(
      '0x0d582c10ff8115413aa5b70564fdd2f3cefe1f33a1e43a47bc495081e91e73e5',
    );
    emptyBlockHeader.state.partial.noteHashTree.root = Fr.fromString(
      '0x2ac5dda169f6bb3b9ca09bbac34e14c94d1654597db740153a1288d859a8a30a',
    );
    emptyBlockHeader.state.partial.nullifierTree.root = Fr.fromString(
      '0x1ec3788cd1c32e54d889d67fe29e481114f9d4afe9b44b229aa29d8ad528dd31',
    );
    emptyBlockHeader.state.partial.nullifierTree.nextAvailableLeafIndex = 128;
    emptyBlockHeader.state.partial.publicDataTree.root = Fr.fromString(
      '0x23c08a6b1297210c5e24c76b9a936250a1ce2721576c26ea797c7ec35f9e46a9',
    );
    emptyBlockHeader.state.partial.publicDataTree.nextAvailableLeafIndex = 128;
    const emptyBlock = L2Block.empty(emptyBlockHeader);
    const emptyBlockHash = await emptyBlock.hash();
    expect(emptyBlockHash.equals(GENESIS_BLOCK_HEADER_HASH)).toBeTruthy();
  });
});
