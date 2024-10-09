import { Fr, INITIAL_L2_BLOCK_NUM, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class InboxLeaf {
  constructor(
    /** L2 block number in which the message will be included. */
    public readonly blockNumber: bigint,
    /** Index of the leaf in the whole tree. */
    public readonly index: bigint,
    /** Leaf in the subtree/message hash. */
    public readonly leaf: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([this.blockNumber, this.index, this.leaf]);
  }

  fromBuffer(buffer: Buffer | BufferReader): InboxLeaf {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = toBigIntBE(reader.readBytes(32));
    const index = toBigIntBE(reader.readBytes(32));
    const leaf = reader.readObject(Fr);
    return new InboxLeaf(blockNumber, index, leaf);
  }

  static createInboxLeafUsingIndexInSubtree(blockNumber: bigint, indexInSubtree: bigint, leaf: Fr): InboxLeaf {
    return new InboxLeaf(blockNumber, this.convertToIndexInWholeTree(indexInSubtree, blockNumber), leaf);
  }

  convertToIndexInSubtree(): bigint {
    if (this.blockNumber < BigInt(INITIAL_L2_BLOCK_NUM)) {
      return 0n; //what tto actually do???? it fails this test
      // https://github.com/AztecProtocol/aztec-packages/blob/aa106cc2dd49d88a7259e5ccdfa61a477c5258e1/yarn-project/archiver/src/archiver/archiver_store_test_suite.ts#L118
      // getSynchPoint test - returns the L1 block number that most recently added messages from inbox
    }
    return this.index - (this.blockNumber - BigInt(INITIAL_L2_BLOCK_NUM)) * BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  }

  // the opposite of the previous function - takes index in a subtree and returns the index in the whole tree.
  static convertToIndexInWholeTree(i: bigint, l2Block: bigint): bigint {
    return i + (l2Block - BigInt(INITIAL_L2_BLOCK_NUM)) * BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  }
}
