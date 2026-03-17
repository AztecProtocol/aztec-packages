import { FinalBlobAccumulator } from '@aztec/blob-lib/types';
import { MAX_CHECKPOINTS_PER_EPOCH } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { FeeRecipient } from './checkpoint_rollup_public_inputs.js';
import { EpochConstantData } from './epoch_constant_data.js';

/**
 * Represents public inputs of the root rollup circuit.
 *
 * NOTE: in practice, we'll hash all of this up into a single public input, for cheap onchain verification.
 */
export class RootRollupPublicInputs {
  constructor(
    /** Root of the archive tree before this rollup is processed */
    public previousArchiveRoot: Fr,
    /** Root of the archive tree after this rollup is processed */
    public endArchiveRoot: Fr,
    /**
     * Root of the balanced merkle tree consisting of the out hashes of all checkpoints in this epoch.
     * The out hash of the first checkpoint in the epoch is inserted at index 0, the second at index 1, and so on.
     */
    public outHash: Fr,
    /** Hashes of checkpoint headers for this rollup. */
    public checkpointHeaderHashes: Tuple<Fr, typeof MAX_CHECKPOINTS_PER_EPOCH>,
    public fees: Tuple<FeeRecipient, typeof MAX_CHECKPOINTS_PER_EPOCH>,
    public constants: EpochConstantData,
    public blobPublicInputs: FinalBlobAccumulator,
  ) {}

  static getFields(fields: FieldsOf<RootRollupPublicInputs>) {
    return [
      fields.previousArchiveRoot,
      fields.endArchiveRoot,
      fields.outHash,
      fields.checkpointHeaderHashes,
      fields.fees,
      fields.constants,
      fields.blobPublicInputs,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...RootRollupPublicInputs.getFields(this));
  }

  toFields(): Fr[] {
    return serializeToFields(...RootRollupPublicInputs.getFields(this));
  }

  static from(fields: FieldsOf<RootRollupPublicInputs>): RootRollupPublicInputs {
    return new RootRollupPublicInputs(...RootRollupPublicInputs.getFields(fields));
  }

  /**
   * Deserializes a buffer into a `RootRollupPublicInputs` object.
   * @param buffer - The buffer to deserialize.
   * @returns The deserialized `RootRollupPublicInputs` object.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): RootRollupPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new RootRollupPublicInputs(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readArray(MAX_CHECKPOINTS_PER_EPOCH, Fr),
      reader.readArray(MAX_CHECKPOINTS_PER_EPOCH, FeeRecipient),
      EpochConstantData.fromBuffer(reader),
      reader.readObject(FinalBlobAccumulator),
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return RootRollupPublicInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a string. */
  static get schema() {
    return bufferSchemaFor(RootRollupPublicInputs);
  }

  /** Creates a random instance. Used for testing only - will not prove/verify. */
  static random() {
    return new RootRollupPublicInputs(
      Fr.random(),
      Fr.random(),
      Fr.random(),
      makeTuple(MAX_CHECKPOINTS_PER_EPOCH, Fr.random),
      makeTuple(MAX_CHECKPOINTS_PER_EPOCH, FeeRecipient.random),
      new EpochConstantData(Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()),
      FinalBlobAccumulator.random(),
    );
  }
}
