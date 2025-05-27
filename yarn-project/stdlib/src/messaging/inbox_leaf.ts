import { INITIAL_L2_BLOCK_NUM, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class InboxLeaf {
  constructor(
    /** Index of the leaf in the whole tree. */
    public readonly index: bigint,
    /** Leaf in the subtree/message hash. */
    public readonly leaf: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer([this.index, this.leaf]);
  }

  fromBuffer(buffer: Buffer | BufferReader): InboxLeaf {
    const reader = BufferReader.asReader(buffer);
    const index = toBigIntBE(reader.readBytes(32));
    const leaf = reader.readObject(Fr);
    return new InboxLeaf(index, leaf);
  }

  static smallestIndexFromL2Block(l2block: bigint): bigint {
    return (l2block - BigInt(INITIAL_L2_BLOCK_NUM)) * BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  }

  /**
   * Returns the range of valid indices for a given L2 block.
   * Start index is inclusive, end index is exclusive.
   */
  static indexRangeFromL2Block(l2block: bigint): [bigint, bigint] {
    const start = this.smallestIndexFromL2Block(l2block);
    const end = start + BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    return [start, end];
  }
}
