import { SpongeBlob } from '@aztec/blob-lib/types';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { StateReference } from '../tx/state_reference.js';
import type { UInt64 } from '../types/shared.js';
import { CheckpointConstantData } from './checkpoint_constant_data.js';

/**
 * Output of the block root and block merge rollup circuits.
 */
export class BlockRollupPublicInputs {
  constructor(
    /**
     * Constants for the entire checkpoint.
     */
    public constants: CheckpointConstantData,
    /**
     * Archive tree immediately before this block range.
     */
    public previousArchive: AppendOnlyTreeSnapshot,
    /**
     * Archive tree after applying this block range.
     */
    public newArchive: AppendOnlyTreeSnapshot,
    /**
     * State reference immediately before this block range.
     */
    public startState: StateReference,
    /**
     * State reference after applying this block range.
     */
    public endState: StateReference,
    /**
     * Sponge state to absorb blob inputs at the start of this block range.
     */
    public startSpongeBlob: SpongeBlob,
    /**
     * Sponge state to absorb blob inputs at the end of this block range.
     */
    public endSpongeBlob: SpongeBlob,
    /**
     * Timestamp of the first block in this block range.
     */
    public startTimestamp: UInt64,
    /**
     * Timestamp of the last block in this block range.
     */
    public endTimestamp: UInt64,
    /**
     * SHA256 hash of l1 to l2 messages.
     */
    public inHash: Fr,
    /**
     * SHA256 hash of L2 to L1 messages created in this block range.
     */
    public outHash: Fr,
    /**
     * The summed transaction fees of all the txs in this block range.
     */
    public accumulatedFees: Fr,
    /**
     * The summed mana used of all the txs in this block range.
     */
    public accumulatedManaUsed: Fr,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader): BlockRollupPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlockRollupPublicInputs(
      reader.readObject(CheckpointConstantData),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(StateReference),
      reader.readObject(StateReference),
      reader.readObject(SpongeBlob),
      reader.readObject(SpongeBlob),
      reader.readUInt64(),
      reader.readUInt64(),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.previousArchive,
      this.newArchive,
      this.startState,
      this.endState,
      this.startSpongeBlob,
      this.endSpongeBlob,
      bigintToUInt64BE(this.startTimestamp),
      bigintToUInt64BE(this.endTimestamp),
      this.inHash,
      this.outHash,
      this.accumulatedFees,
      this.accumulatedManaUsed,
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return BlockRollupPublicInputs.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockRollupPublicInputs);
  }
}
