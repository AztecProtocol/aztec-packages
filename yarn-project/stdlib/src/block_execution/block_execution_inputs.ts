import { SpongeBlob } from '@aztec/blob-lib/types';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import {
  BufferReader,
  boolToBuffer,
  serializeArrayOfBufferableToVector,
  serializeToBuffer,
} from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/tx_hash.js';

/**
 * Inputs for a `BLOCK_EXECUTION` proving job. The execution agent uses these to
 * re-execute every transaction in the named block, build per-tx base-rollup hints
 * against its own world-state fork, and enqueue per-tx proving jobs under
 * deterministic IDs computed from `(epochNumber, blockNumber, slotNumber, txIndex)`.
 */
export class BlockExecutionInputs {
  constructor(
    public readonly epochNumber: EpochNumber,
    public readonly checkpointIndex: number,
    public readonly blockHeader: BlockHeader,
    public readonly txHashes: TxHash[],
    /**
     * `true` when this block is the first in its checkpoint and the agent must
     * insert this checkpoint's L1-to-L2 messages into the agent's fork before
     * processing transactions. For non-first blocks the parent fork already
     * carries the messages, and `l1ToL2Messages` is ignored.
     */
    public readonly isFirstBlockInCheckpoint: boolean,
    /**
     * L1-to-L2 messages for this checkpoint. Only used when
     * `isFirstBlockInCheckpoint` is `true`.
     */
    public readonly l1ToL2Messages: Fr[],
    /**
     * Sponge-blob accumulator state at the start of this block. Carries through
     * across blocks in a checkpoint — the orchestrator passes block N+1's start
     * sponge as block N's end sponge (returned by the agent in
     * `BlockExecutionResult`).
     */
    public readonly startSpongeBlob: SpongeBlob,
  ) {}

  get blockNumber(): BlockNumber {
    return this.blockHeader.getBlockNumber();
  }

  static from(fields: FieldsOf<BlockExecutionInputs>): BlockExecutionInputs {
    return new BlockExecutionInputs(...BlockExecutionInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockExecutionInputs>) {
    return [
      fields.epochNumber,
      fields.checkpointIndex,
      fields.blockHeader,
      fields.txHashes,
      fields.isFirstBlockInCheckpoint,
      fields.l1ToL2Messages,
      fields.startSpongeBlob,
    ] as const;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.epochNumber,
      this.checkpointIndex,
      this.blockHeader,
      serializeArrayOfBufferableToVector(this.txHashes),
      boolToBuffer(this.isFirstBlockInCheckpoint),
      serializeArrayOfBufferableToVector(this.l1ToL2Messages),
      this.startSpongeBlob,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockExecutionInputs {
    const reader = BufferReader.asReader(buffer);
    const epochNumber = EpochNumber(reader.readNumber());
    const checkpointIndex = reader.readNumber();
    const blockHeader = reader.readObject(BlockHeader);
    const txHashes = reader.readVector(TxHash);
    const isFirstBlockInCheckpoint = reader.readBoolean();
    const l1ToL2Messages = reader.readVector(Fr);
    const startSpongeBlob = reader.readObject(SpongeBlob);
    return new BlockExecutionInputs(
      epochNumber,
      checkpointIndex,
      blockHeader,
      txHashes,
      isFirstBlockInCheckpoint,
      l1ToL2Messages,
      startSpongeBlob,
    );
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): BlockExecutionInputs {
    return BlockExecutionInputs.fromBuffer(hexToBuffer(str));
  }

  /** Buffer representation used by jsonStringify. */
  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockExecutionInputs);
  }
}
