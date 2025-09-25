import { SpongeBlob } from '@aztec/blob-lib/types';
import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { ParityPublicInputs } from '../parity/parity_public_inputs.js';
import { ProofData, type RollupHonkProofData, type UltraHonkProofData } from '../proofs/proof_data.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { StateReference } from '../tx/state_reference.js';
import type { UInt64 } from '../types/shared.js';
import { CheckpointConstantData } from './checkpoint_constant_data.js';
import { TxRollupPublicInputs } from './tx_rollup_public_inputs.js';

export class BlockRootFirstRollupPrivateInputs {
  constructor(
    /**
     * The original and converted roots of the L1 to L2 messages subtrees.
     */
    public l1ToL2Roots: UltraHonkProofData<ParityPublicInputs>,
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollups: [RollupHonkProofData<TxRollupPublicInputs>, RollupHonkProofData<TxRollupPublicInputs>],
    /**
     * The l1 to l2 message tree snapshot immediately before this block.
     */
    public previousL1ToL2: AppendOnlyTreeSnapshot,
    /**
     * Hint for inserting the new l1 to l2 message subtree root into `previousL1ToL2`.
     */
    public newL1ToL2MessageSubtreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
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
      fields.previousL1ToL2,
      fields.newL1ToL2MessageSubtreeRootSiblingPath,
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
      [ProofData.fromBuffer(reader, TxRollupPublicInputs), ProofData.fromBuffer(reader, TxRollupPublicInputs)],
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      reader.readArray(L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH, Fr),
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
    public l1ToL2Roots: UltraHonkProofData<ParityPublicInputs>,
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollup: RollupHonkProofData<TxRollupPublicInputs>,
    /**
     * The l1 to l2 message tree snapshot immediately before this block.
     */
    public previousL1ToL2: AppendOnlyTreeSnapshot,
    /**
     * Hint for inserting the new l1 to l2 message subtree root.
     */
    public newL1ToL2MessageSubtreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
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
      fields.previousL1ToL2,
      fields.newL1ToL2MessageSubtreeRootSiblingPath,
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
      ProofData.fromBuffer(reader, TxRollupPublicInputs),
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      reader.readArray(L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH, Fr),
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
    public l1ToL2Roots: UltraHonkProofData<ParityPublicInputs>,
    /**
     * The archive after applying the previous block.
     */
    public previousArchive: AppendOnlyTreeSnapshot,
    /**
     * The state reference of the previous block.
     */
    public previousState: StateReference,
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
     * The timestamp of this block.
     */
    public timestamp: UInt64,
    /**
     * Hint for inserting the new l1 to l2 message subtree root.
     */
    public newL1ToL2MessageSubtreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
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
      fields.previousArchive,
      fields.previousState,
      fields.constants,
      fields.startSpongeBlob,
      fields.timestamp,
      fields.newL1ToL2MessageSubtreeRootSiblingPath,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer([
      this.l1ToL2Roots,
      this.previousArchive,
      this.previousState,
      this.constants,
      this.startSpongeBlob,
      bigintToUInt64BE(this.timestamp),
      this.newL1ToL2MessageSubtreeRootSiblingPath,
      this.newArchiveSiblingPath,
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootEmptyTxFirstRollupPrivateInputs(
      ProofData.fromBuffer(reader, ParityPublicInputs),
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      StateReference.fromBuffer(reader),
      CheckpointConstantData.fromBuffer(reader),
      SpongeBlob.fromBuffer(reader),
      reader.readUInt64(),
      reader.readArray(L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH, Fr),
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
    public previousRollups: [RollupHonkProofData<TxRollupPublicInputs>, RollupHonkProofData<TxRollupPublicInputs>],
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
      [ProofData.fromBuffer(reader, TxRollupPublicInputs), ProofData.fromBuffer(reader, TxRollupPublicInputs)],
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
    public previousRollup: RollupHonkProofData<TxRollupPublicInputs>,
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
      ProofData.fromBuffer(reader, TxRollupPublicInputs),
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
