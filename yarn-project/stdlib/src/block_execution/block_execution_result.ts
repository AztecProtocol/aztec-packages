import { BlockNumber } from '@aztec/foundation/branded-types';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

/**
 * Result of a `BLOCK_EXECUTION` proving job. Carries the executed block number for
 * traceability — the actual proofs flow back through separate proving jobs whose
 * IDs are computed deterministically from the block coordinates.
 */
export class BlockExecutionResult {
  constructor(public readonly blockNumber: BlockNumber) {}

  static from(fields: FieldsOf<BlockExecutionResult>): BlockExecutionResult {
    return new BlockExecutionResult(...BlockExecutionResult.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockExecutionResult>) {
    return [fields.blockNumber] as const;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.blockNumber);
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockExecutionResult {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = BlockNumber(reader.readNumber());
    return new BlockExecutionResult(blockNumber);
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
