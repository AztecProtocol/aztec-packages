import { FinalBlobAccumulatorPublicInputs } from '@aztec/blob-lib';
import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { ProofData } from '../proofs/proof_data.js';
import { CheckpointRollupPublicInputs, FeeRecipient } from './checkpoint_rollup_public_inputs.js';
import { EpochConstantData } from './epoch_constant_data.js';
import type { RollupProofData } from './rollup_proof_data.js';

/**
 * Represents inputs of the root rollup circuit.
 */
export class RootRollupPrivateInputs {
  constructor(
    /**
     * The previous rollup data.
     * Note: Root rollup circuit is the latest circuit the chain of circuits and the previous rollup data is the data
     * from 2 checkpoint root/merge/padding circuits.
     */
    public previousRollups: [
      RollupProofData<CheckpointRollupPublicInputs>,
      RollupProofData<CheckpointRollupPublicInputs>,
    ],
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...RootRollupPrivateInputs.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new RootRollupPrivateInputs instance.
   */
  static from(fields: FieldsOf<RootRollupPrivateInputs>) {
    return new RootRollupPrivateInputs(...RootRollupPrivateInputs.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<RootRollupPrivateInputs>) {
    return [fields.previousRollups] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupPrivateInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new RootRollupPrivateInputs([
      ProofData.fromBuffer(reader, CheckpointRollupPublicInputs),
      ProofData.fromBuffer(reader, CheckpointRollupPublicInputs),
    ]);
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new RootRollupPrivateInputs instance.
   */
  static fromString(str: string) {
    return RootRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a string. */
  static get schema() {
    return bufferSchemaFor(RootRollupPrivateInputs);
  }
}

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
    public checkpointHeaderHashes: Tuple<Fr, typeof AZTEC_MAX_EPOCH_DURATION>,
    public fees: Tuple<FeeRecipient, typeof AZTEC_MAX_EPOCH_DURATION>,
    public constants: EpochConstantData,
    public blobPublicInputs: FinalBlobAccumulatorPublicInputs,
  ) {}

  static getFields(fields: FieldsOf<RootRollupPublicInputs>) {
    return [
      fields.previousArchiveRoot,
      fields.endArchiveRoot,
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
      reader.readArray(AZTEC_MAX_EPOCH_DURATION, Fr),
      reader.readArray(AZTEC_MAX_EPOCH_DURATION, FeeRecipient),
      EpochConstantData.fromBuffer(reader),
      reader.readObject(FinalBlobAccumulatorPublicInputs),
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
      makeTuple(AZTEC_MAX_EPOCH_DURATION, Fr.random),
      makeTuple(AZTEC_MAX_EPOCH_DURATION, FeeRecipient.random),
      new EpochConstantData(Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()),
      FinalBlobAccumulatorPublicInputs.random(),
    );
  }
}
