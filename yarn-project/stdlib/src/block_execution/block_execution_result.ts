import { SpongeBlob } from '@aztec/blob-lib/types';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeArrayOfBufferableToVector, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { StateReference } from '../tx/state_reference.js';
import { TxEffect } from '../tx/tx_effect.js';

/**
 * Result of a `BLOCK_EXECUTION` proving job. Carries everything the orchestrator
 * needs to drive block-level proving and block-header construction without
 * touching `ProcessedTx` itself:
 *
 * - `endSpongeBlob` — the sponge-blob accumulator state after the block.
 *   Used as `startSpongeBlob` for the next block in the same checkpoint.
 * - `endState` — the world-state reference at the end of the block. Goes
 *   straight onto `BlockProvingState` for header construction.
 * - `totalFees`, `totalManaUsed` — header aggregate values.
 * - `txEffects` — per-tx effects in tx order, used for blob accumulation
 *   on the checkpoint side.
 *
 * Per-tx proofs (private base rollup, AVM) flow back through separate proving
 * jobs whose IDs are computed deterministically from the block coordinates.
 */
export class BlockExecutionResult {
  constructor(
    public readonly blockNumber: BlockNumber,
    public readonly endSpongeBlob: SpongeBlob,
    public readonly endState: StateReference,
    public readonly totalFees: Fr,
    public readonly totalManaUsed: Fr,
    public readonly txEffects: TxEffect[],
  ) {}

  static from(fields: FieldsOf<BlockExecutionResult>): BlockExecutionResult {
    return new BlockExecutionResult(...BlockExecutionResult.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockExecutionResult>) {
    return [
      fields.blockNumber,
      fields.endSpongeBlob,
      fields.endState,
      fields.totalFees,
      fields.totalManaUsed,
      fields.txEffects,
    ] as const;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.blockNumber,
      this.endSpongeBlob,
      this.endState,
      this.totalFees,
      this.totalManaUsed,
      serializeArrayOfBufferableToVector(this.txEffects),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockExecutionResult {
    const reader = BufferReader.asReader(buffer);
    const blockNumber = BlockNumber(reader.readNumber());
    const endSpongeBlob = reader.readObject(SpongeBlob);
    const endState = reader.readObject(StateReference);
    const totalFees = reader.readObject(Fr);
    const totalManaUsed = reader.readObject(Fr);
    const txEffects = reader.readVector(TxEffect);
    return new BlockExecutionResult(blockNumber, endSpongeBlob, endState, totalFees, totalManaUsed, txEffects);
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
