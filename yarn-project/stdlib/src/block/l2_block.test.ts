import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { BlockHeader } from '../tx/block_header.js';
import { GENESIS_BLOCK_HEADER_HASH } from './block_hash.js';
import { L2Block } from './l2_block.js';

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
    const emptyBlockHeader = BlockHeader.empty();
    emptyBlockHeader.state.l1ToL2MessageTree.root = Fr.fromString(
      '0x0fef6d80d31109ddb56d6b3f607cbc9c0af0bff3ea0d43e8f278983c64c11f7a',
    );
    emptyBlockHeader.state.partial.noteHashTree.root = Fr.fromString(
      '0x2590f2aab19dd791700b4a43d3f52bb88ef2409a3731da8e848663559202e4c6',
    );
    emptyBlockHeader.state.partial.nullifierTree.root = Fr.fromString(
      '0x18935581a8ed73d08ffd00386fba55ba6c89f3ab848a76b8fedfa9034cee0454',
    );
    emptyBlockHeader.state.partial.nullifierTree.nextAvailableLeafIndex = 128;
    emptyBlockHeader.state.partial.publicDataTree.root = Fr.fromString(
      '0x1bef38b621017d3c7416663d0cd81369424560710526a3fbaaec13e356b9d084',
    );
    emptyBlockHeader.state.partial.publicDataTree.nextAvailableLeafIndex = 128;
    const emptyBlock = L2Block.empty(emptyBlockHeader);
    const emptyBlockHash = await emptyBlock.hash();
    expect(emptyBlockHash.equals(GENESIS_BLOCK_HEADER_HASH)).toBeTruthy();
  });
});
