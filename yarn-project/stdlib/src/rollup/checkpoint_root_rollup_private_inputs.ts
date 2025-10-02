import { BlobAccumulator, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import { ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB } from '@aztec/constants';
import { BLS12Point, Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { BlockHeader } from '../tx/block_header.js';
import { BlockRollupPublicInputs } from './block_rollup_public_inputs.js';

export class CheckpointRootRollupHints {
  constructor(
    /**
     * The header of the previous block before this checkpoint.
     */
    public previousBlockHeader: BlockHeader,
    /**
     * Hint for checking the hash of previous_block_header is the last leaf of the previous archive.
     */
    public previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    /**
     * The current blob accumulation state across the epoch.
     */
    public startBlobAccumulator: BlobAccumulator,
    /**
     * Finalized challenges z and gamma for performing blob batching. Shared value across the epoch.
     */
    public finalBlobChallenges: FinalBlobBatchingChallenges,
    /**
     * Flat list of all tx effects which will be added to the blob.
     * Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
     * Tuple<Fr, FIELDS_PER_BLOB * BLOBS_PER_BLOCK>
     */
    public blobFields: Fr[],
    /**
     * KZG commitments representing the blob (precomputed in ts, injected to use inside circuit).
     */
    public blobCommitments: Tuple<BLS12Point, typeof BLOBS_PER_BLOCK>,
    /**
     * The hash of eth blob hashes for this block
     * See yarn-project/foundation/src/blob/index.ts or body.ts for calculation
     */
    public blobsHash: Fr,
  ) {}

  static from(fields: FieldsOf<CheckpointRootRollupHints>) {
    return new CheckpointRootRollupHints(...CheckpointRootRollupHints.getFields(fields));
  }

  static getFields(fields: FieldsOf<CheckpointRootRollupHints>) {
    return [
      fields.previousBlockHeader,
      fields.previousArchiveSiblingPath,
      fields.startBlobAccumulator,
      fields.finalBlobChallenges,
      fields.blobFields,
      fields.blobCommitments,
      fields.blobsHash,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...CheckpointRootRollupHints.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CheckpointRootRollupHints(
      BlockHeader.fromBuffer(reader),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
      reader.readObject(BlobAccumulator),
      reader.readObject(FinalBlobBatchingChallenges),
      // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
      // reader.readArray(FIELDS_PER_BLOB, Fr),
      Array.from({ length: FIELDS_PER_BLOB * BLOBS_PER_BLOCK }, () => Fr.fromBuffer(reader)),
      reader.readArray(BLOBS_PER_BLOCK, BLS12Point),
      Fr.fromBuffer(reader),
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return CheckpointRootRollupHints.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(CheckpointRootRollupHints);
  }
}

export class CheckpointRootRollupPrivateInputs {
  constructor(
    public previousRollups: [
      RollupHonkProofData<BlockRollupPublicInputs>,
      RollupHonkProofData<BlockRollupPublicInputs>,
    ],
    public hints: CheckpointRootRollupHints,
  ) {}

  static from(fields: FieldsOf<CheckpointRootRollupPrivateInputs>) {
    return new CheckpointRootRollupPrivateInputs(...CheckpointRootRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<CheckpointRootRollupPrivateInputs>) {
    return [fields.previousRollups, fields.hints] as const;
  }

  toBuffer() {
    return serializeToBuffer(...CheckpointRootRollupPrivateInputs.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CheckpointRootRollupPrivateInputs(
      [ProofData.fromBuffer(reader, BlockRollupPublicInputs), ProofData.fromBuffer(reader, BlockRollupPublicInputs)],
      CheckpointRootRollupHints.fromBuffer(reader),
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return CheckpointRootRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(CheckpointRootRollupPrivateInputs);
  }
}

export class CheckpointRootSingleBlockRollupPrivateInputs {
  constructor(
    public previousRollup: RollupHonkProofData<BlockRollupPublicInputs>,
    public hints: CheckpointRootRollupHints,
  ) {}

  static from(fields: FieldsOf<CheckpointRootSingleBlockRollupPrivateInputs>) {
    return new CheckpointRootSingleBlockRollupPrivateInputs(
      ...CheckpointRootSingleBlockRollupPrivateInputs.getFields(fields),
    );
  }

  static getFields(fields: FieldsOf<CheckpointRootSingleBlockRollupPrivateInputs>) {
    return [fields.previousRollup, fields.hints] as const;
  }

  toBuffer() {
    return serializeToBuffer(...CheckpointRootSingleBlockRollupPrivateInputs.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CheckpointRootSingleBlockRollupPrivateInputs(
      ProofData.fromBuffer(reader, BlockRollupPublicInputs),
      CheckpointRootRollupHints.fromBuffer(reader),
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return CheckpointRootSingleBlockRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(CheckpointRootSingleBlockRollupPrivateInputs);
  }
}

// Checkpoint padding circuit does not have any private inputs.
export class CheckpointPaddingRollupPrivateInputs {
  constructor() {}

  toBuffer() {
    return Buffer.alloc(0);
  }

  static fromBuffer(_buffer: Buffer | BufferReader) {
    return new CheckpointPaddingRollupPrivateInputs();
  }

  toString(): `0x${string}` {
    return '0x';
  }

  static fromString(_str: string) {
    return new CheckpointPaddingRollupPrivateInputs();
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(CheckpointPaddingRollupPrivateInputs);
  }
}
