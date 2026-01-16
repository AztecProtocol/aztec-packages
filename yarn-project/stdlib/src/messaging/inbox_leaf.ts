import { INITIAL_CHECKPOINT_NUMBER, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
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

  static smallestIndexForCheckpoint(checkpointNumber: CheckpointNumber): bigint {
    return BigInt(checkpointNumber - INITIAL_CHECKPOINT_NUMBER) * BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  }

  /**
   * Returns the range of valid indices for a given checkpoint.
   * Start index is inclusive, end index is exclusive.
   */
  static indexRangeForCheckpoint(checkpointNumber: CheckpointNumber): [bigint, bigint] {
    const start = this.smallestIndexForCheckpoint(checkpointNumber);
    const end = start + BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    return [start, end];
  }

  /** Returns the checkpoint number for a given leaf index */
  static checkpointNumberFromIndex(index: bigint): CheckpointNumber {
    return CheckpointNumber(Number(index / BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP)) + INITIAL_CHECKPOINT_NUMBER);
  }
}
