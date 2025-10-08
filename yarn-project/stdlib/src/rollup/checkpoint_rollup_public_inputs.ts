import { BlobAccumulator, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { EpochConstantData } from './epoch_constant_data.js';

/**
 * Output of the checkpoint root and checkpoint merge rollup circuits.
 */
export class CheckpointRollupPublicInputs {
  constructor(
    /**
     * Constants for the entire epoch.
     */
    public constants: EpochConstantData,
    /**
     * Archive tree immediately before this checkpoint range.
     */
    public previousArchive: AppendOnlyTreeSnapshot,
    /**
     * Archive tree after adding this checkpoint range.
     */
    public newArchive: AppendOnlyTreeSnapshot,
    /**
     * The hashes of the headers of the constituent checkpoints.
     */
    public checkpointHeaderHashes: Tuple<Fr, typeof AZTEC_MAX_EPOCH_DURATION>,
    /**
     * The summed transaction fees and recipients of the constituent checkpoints.
     */
    public fees: Tuple<FeeRecipient, typeof AZTEC_MAX_EPOCH_DURATION>,
    /**
     * Accumulated opening proofs for all blobs before this checkpoint range.
     */
    public startBlobAccumulator: BlobAccumulator,
    /**
     * Accumulated opening proofs for all blobs after applying this checkpoint range.
     */
    public endBlobAccumulator: BlobAccumulator,
    /**
     * Final values z and gamma, shared across the epoch.
     */
    public finalBlobChallenges: FinalBlobBatchingChallenges,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CheckpointRollupPublicInputs(
      reader.readObject(EpochConstantData),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readArray(AZTEC_MAX_EPOCH_DURATION, Fr),
      reader.readArray(AZTEC_MAX_EPOCH_DURATION, FeeRecipient),
      reader.readObject(BlobAccumulator),
      reader.readObject(BlobAccumulator),
      reader.readObject(FinalBlobBatchingChallenges),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.previousArchive,
      this.newArchive,
      this.checkpointHeaderHashes,
      this.fees,
      this.startBlobAccumulator,
      this.endBlobAccumulator,
      this.finalBlobChallenges,
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return CheckpointRollupPublicInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(CheckpointRollupPublicInputs);
  }
}

export class FeeRecipient {
  constructor(
    public recipient: EthAddress,
    public value: Fr,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader): FeeRecipient {
    const reader = BufferReader.asReader(buffer);
    return new FeeRecipient(reader.readObject(EthAddress), Fr.fromBuffer(reader));
  }

  toBuffer() {
    return serializeToBuffer(this.recipient, this.value);
  }

  static getFields(fields: FieldsOf<FeeRecipient>) {
    return [fields.recipient, fields.value] as const;
  }

  toFields() {
    return serializeToFields(...FeeRecipient.getFields(this));
  }

  isEmpty() {
    return this.value.isZero() && this.recipient.isZero();
  }

  toFriendlyJSON() {
    if (this.isEmpty()) {
      return {};
    }
    return { recipient: this.recipient.toString(), value: this.value.toString() };
  }

  static random() {
    return new FeeRecipient(EthAddress.random(), Fr.random());
  }
}
