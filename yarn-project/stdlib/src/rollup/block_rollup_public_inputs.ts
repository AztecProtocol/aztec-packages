import { SpongeBlob } from '@aztec/blob-lib/types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { L1ToL2MessageSponge } from '../messaging/l1_to_l2_message_sponge.js';
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
     * Timestamp of the blocks in this block range.
     */
    public timestamp: UInt64,
    /**
     * Hash of the headers of all blocks in this block range. It will be combined with the `blockHeadersHash` from
     * other blocks in the same checkpoint to form an unbalanced tree. The root of that tree becomes the final hash
     * stored in the checkpoint header, enabling validation of the blocks included in a checkpoint given their headers.
     */
    public blockHeadersHash: Fr,
    /**
     * Message-bundle sponge threaded across the checkpoint's blocks, before this block range absorbs its bundle.
     */
    public startMsgSponge: L1ToL2MessageSponge,
    /**
     * Message-bundle sponge after this block range absorbs its bundle. The checkpoint root asserts the final value
     * matches the parity root's sponge over the same (padded) message list.
     */
    public endMsgSponge: L1ToL2MessageSponge,
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
      Fr.fromBuffer(reader),
      reader.readObject(L1ToL2MessageSponge),
      reader.readObject(L1ToL2MessageSponge),
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
      bigintToUInt64BE(this.timestamp),
      this.blockHeadersHash,
      this.startMsgSponge,
      this.endMsgSponge,
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

  toInspect() {
    return {
      previousArchiveRoot: this.previousArchive.root.toString(),
      newArchiveRoot: this.newArchive.root.toString(),
      blockHeadersHash: this.blockHeadersHash.toString(),
      startMsgSpongeNumAbsorbed: this.startMsgSponge.numAbsorbed,
      endMsgSpongeNumAbsorbed: this.endMsgSponge.numAbsorbed,
      outHash: this.outHash.toString(),
      timestamp: this.timestamp.toString(),
      accumulatedFees: this.accumulatedFees.toString(),
      accumulatedManaUsed: this.accumulatedManaUsed.toString(),
    };
  }

  static get schema() {
    return bufferSchemaFor(BlockRollupPublicInputs);
  }
}
