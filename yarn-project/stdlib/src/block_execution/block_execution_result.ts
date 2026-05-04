import { SpongeBlob } from '@aztec/blob-lib/types';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

/**
 * Result of a `BLOCK_EXECUTION` proving job. Reports the executed block number
 * and the sponge-blob accumulator state at the end of the block — the
 * orchestrator carries the latter forward to the next block in the same
 * checkpoint as that block's `startSpongeBlob`. The actual proofs flow back
 * through separate proving jobs whose IDs are computed deterministically from
 * the block coordinates.
 */
export class BlockExecutionResult {
  constructor(
    public readonly blockNumber: BlockNumber,
    public readonly endSpongeBlob: SpongeBlob,
  ) {}

  static from(fields: FieldsOf<BlockExecutionResult>): BlockExecutionResult {
    return new BlockExecutionResult(...BlockExecutionResult.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockExecutionResult>) {
    return [fields.blockNumber, fields.endSpongeBlob] as const;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.blockNumber, this.endSpongeBlob);
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockExecutionResult {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = BlockNumber(reader.readNumber());
    const endSpongeBlob = reader.readObject(SpongeBlob);
    return new BlockExecutionResult(blockNumber, endSpongeBlob);
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): BlockExecutionResult {
    return BlockExecutionResult.fromBuffer(hexToBuffer(str));
  }

  /** Buffer representation used by jsonStringify. */
  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockExecutionResult);
  }
}
