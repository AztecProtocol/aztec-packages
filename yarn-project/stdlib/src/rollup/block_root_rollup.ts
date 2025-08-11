import { SpongeBlob } from '@aztec/blob-lib';
import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { ParityPublicInputs } from '../parity/index.js';
import { ProofData } from '../proofs/index.js';
import { AppendOnlyTreeSnapshot } from '../trees/index.js';
import { BlockHeader } from '../tx/index.js';
import { BaseOrMergeRollupPublicInputs } from './base_or_merge_rollup_public_inputs.js';
import { CheckpointConstantData } from './checkpoint_constant_data.js';
import type { RollupProofData, RootParityProofData } from './rollup_proof_data.js';

export class BlockRootFirstRollupPrivateInputs {
  constructor(
    /**
     * The original and converted roots of the L1 to L2 messages subtrees.
     */
    public l1ToL2Roots: RootParityProofData,
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollups: [
      RollupProofData<BaseOrMergeRollupPublicInputs>,
      RollupProofData<BaseOrMergeRollupPublicInputs>,
    ],
    /**
     * Hint for inserting the new l1 to l2 message subtree.
     */
    public newL1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootFirstRollupPrivateInputs>) {
    return new BlockRootFirstRollupPrivateInputs(...BlockRootFirstRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockRootFirstRollupPrivateInputs>) {
    return [
      fields.l1ToL2Roots,
      fields.previousRollups,
      fields.newL1ToL2MessageSubtreeSiblingPath,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BlockRootFirstRollupPrivateInputs.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootFirstRollupPrivateInputs(
      ProofData.fromBuffer(reader, ParityPublicInputs),
      [
        ProofData.fromBuffer(reader, BaseOrMergeRollupPublicInputs),
        ProofData.fromBuffer(reader, BaseOrMergeRollupPublicInputs),
      ],
      reader.readArray(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, Fr),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
    );
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockRootFirstRollupPrivateInputs);
  }
}

export class BlockRootSingleTxFirstRollupPrivateInputs {
  constructor(
    /**
     * The original and converted roots of the L1 to L2 messages subtrees.
     */
    public l1ToL2Roots: RootParityProofData,
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollup: RollupProofData<BaseOrMergeRollupPublicInputs>,
    /**
     * Hint for inserting the new l1 to l2 message subtree.
     */
    public newL1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootSingleTxFirstRollupPrivateInputs>) {
    return new BlockRootSingleTxFirstRollupPrivateInputs(
      ...BlockRootSingleTxFirstRollupPrivateInputs.getFields(fields),
    );
  }

  static getFields(fields: FieldsOf<BlockRootSingleTxFirstRollupPrivateInputs>) {
    return [
      fields.l1ToL2Roots,
      fields.previousRollup,
      fields.newL1ToL2MessageSubtreeSiblingPath,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BlockRootSingleTxFirstRollupPrivateInputs.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootSingleTxFirstRollupPrivateInputs(
      ProofData.fromBuffer(reader, ParityPublicInputs),
      ProofData.fromBuffer(reader, BaseOrMergeRollupPublicInputs),
      reader.readArray(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, Fr),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
    );
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockRootSingleTxFirstRollupPrivateInputs);
  }
}

export class BlockRootEmptyTxFirstRollupPrivateInputs {
  constructor(
    /**
     * The original and converted roots of the L1 to L2 messages subtrees.
     */
    public l1ToL2Roots: RootParityProofData,
    /**
     * The header of the previous block.
     */
    public previousBlockHeader: BlockHeader,
    /**
     * The archive after applying the previous block.
     */
    public previousArchive: AppendOnlyTreeSnapshot,
    /**
     * The constants of the checkpoint.
     */
    public constants: CheckpointConstantData,
    /**
     * The start sponge blob of this block. No data has been absorbed into it yet, since it's the first block. But the
     * number of expected fields must be set to the total number of fields in the entire checkpoint.
     */
    public startSpongeBlob: SpongeBlob,
    /**
     * Hint for inserting the new l1 to l2 message subtree.
     */
    public newL1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootEmptyTxFirstRollupPrivateInputs>) {
    return new BlockRootEmptyTxFirstRollupPrivateInputs(...BlockRootEmptyTxFirstRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockRootEmptyTxFirstRollupPrivateInputs>) {
    return [
      fields.l1ToL2Roots,
      fields.previousBlockHeader,
      fields.previousArchive,
      fields.constants,
      fields.startSpongeBlob,
      fields.newL1ToL2MessageSubtreeSiblingPath,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BlockRootEmptyTxFirstRollupPrivateInputs.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootEmptyTxFirstRollupPrivateInputs(
      ProofData.fromBuffer(reader, ParityPublicInputs),
      BlockHeader.fromBuffer(reader),
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      CheckpointConstantData.fromBuffer(reader),
      SpongeBlob.fromBuffer(reader),
      reader.readArray(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, Fr),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
    );
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockRootEmptyTxFirstRollupPrivateInputs);
  }
}

export class BlockRootRollupPrivateInputs {
  constructor(
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollups: [
      RollupProofData<BaseOrMergeRollupPublicInputs>,
      RollupProofData<BaseOrMergeRollupPublicInputs>,
    ],
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootRollupPrivateInputs>) {
    return new BlockRootRollupPrivateInputs(...BlockRootRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockRootRollupPrivateInputs>) {
    return [fields.previousRollups, fields.newArchiveSiblingPath] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BlockRootRollupPrivateInputs.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootRollupPrivateInputs(
      [
        ProofData.fromBuffer(reader, BaseOrMergeRollupPublicInputs),
        ProofData.fromBuffer(reader, BaseOrMergeRollupPublicInputs),
      ],
      reader.readArray(ARCHIVE_HEIGHT, Fr),
    );
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockRootRollupPrivateInputs);
  }
}

export class BlockRootSingleTxRollupPrivateInputs {
  constructor(
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollup: RollupProofData<BaseOrMergeRollupPublicInputs>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootSingleTxRollupPrivateInputs>) {
    return new BlockRootSingleTxRollupPrivateInputs(...BlockRootSingleTxRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockRootSingleTxRollupPrivateInputs>) {
    return [fields.previousRollup, fields.newArchiveSiblingPath] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BlockRootSingleTxRollupPrivateInputs.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootSingleTxRollupPrivateInputs(
      ProofData.fromBuffer(reader, BaseOrMergeRollupPublicInputs),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
    );
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockRootSingleTxRollupPrivateInputs);
  }
}
