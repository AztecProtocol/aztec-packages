import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeArrayOfBufferableToVector, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { BlockHeader } from '../tx/block_header.js';
import { TxHash } from '../tx/tx_hash.js';

/**
 * Inputs for a `BLOCK_EXECUTION` proving job. The execution agent uses these to
 * re-execute every transaction in the named block, then enqueues the per-tx
 * proving jobs (AVM, etc.) under deterministic IDs computed from
 * `(epochNumber, blockNumber, slotNumber, txIndex)`.
 */
export class BlockExecutionInputs {
  constructor(
    public readonly epochNumber: EpochNumber,
    public readonly checkpointIndex: number,
    public readonly blockHeader: BlockHeader,
    public readonly txHashes: TxHash[],
  ) {}

  get blockNumber(): BlockNumber {
    return this.blockHeader.getBlockNumber();
  }

  static from(fields: FieldsOf<BlockExecutionInputs>): BlockExecutionInputs {
    return new BlockExecutionInputs(...BlockExecutionInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockExecutionInputs>) {
    return [fields.epochNumber, fields.checkpointIndex, fields.blockHeader, fields.txHashes] as const;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.epochNumber,
      this.checkpointIndex,
      this.blockHeader,
      serializeArrayOfBufferableToVector(this.txHashes),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockExecutionInputs {
    const reader = BufferReader.asReader(buffer);
    const epochNumber = EpochNumber(reader.readNumber());
    const checkpointIndex = reader.readNumber();
    const blockHeader = reader.readObject(BlockHeader);
    const txHashes = reader.readVector(TxHash);
    return new BlockExecutionInputs(epochNumber, checkpointIndex, blockHeader, txHashes);
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
