import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { L1ToL2MessageSponge } from '../messaging/l1_to_l2_message_sponge.js';
import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { StateReference } from '../tx/state_reference.js';
import type { UInt64 } from '../types/shared.js';
import { CheckpointConstantData } from './checkpoint_constant_data.js';
import { TxRollupPublicInputs } from './tx_rollup_public_inputs.js';

// The full-height (36) frontier hint the block root uses to append its message bundle. Tuple<Fr, 36> stays within TS's
// instantiation-depth limits; the 1024-lane message array is kept as a plain `Fr[]` (padded by the caller) to avoid
// the excessively-deep tuple type.
function readL1ToL2Messages(reader: BufferReader): Fr[] {
  return Array.from({ length: MAX_L1_TO_L2_MSGS_PER_BLOCK }, () => Fr.fromBuffer(reader));
}

export class BlockRootFirstRollupPrivateInputs {
  constructor(
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollups: [RollupHonkProofData<TxRollupPublicInputs>, RollupHonkProofData<TxRollupPublicInputs>],
    /**
     * L1-to-L2 messages inserted by this block, padded with zeros to `MAX_L1_TO_L2_MSGS_PER_BLOCK`.
     */
    public l1ToL2Messages: Fr[],
    /**
     * Number of real (non-padding) leaves in `l1ToL2Messages`.
     */
    public numMsgs: number,
    /**
     * The l1 to l2 message tree snapshot immediately before this block.
     */
    public previousL1ToL2: AppendOnlyTreeSnapshot,
    /**
     * Frontier hint for appending the message bundle to `previousL1ToL2`.
     */
    public l1ToL2MessageFrontierHint: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>,
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
      fields.previousRollups,
      fields.l1ToL2Messages,
      fields.numMsgs,
      fields.previousL1ToL2,
      fields.l1ToL2MessageFrontierHint,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousRollups,
      this.l1ToL2Messages,
      this.numMsgs,
      this.previousL1ToL2,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootFirstRollupPrivateInputs(
      [ProofData.fromBuffer(reader, TxRollupPublicInputs), ProofData.fromBuffer(reader, TxRollupPublicInputs)],
      readL1ToL2Messages(reader),
      reader.readNumber(),
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      reader.readArray(L1_TO_L2_MSG_TREE_HEIGHT, Fr),
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
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollup: RollupHonkProofData<TxRollupPublicInputs>,
    /**
     * L1-to-L2 messages inserted by this block, padded with zeros to `MAX_L1_TO_L2_MSGS_PER_BLOCK`.
     */
    public l1ToL2Messages: Fr[],
    /**
     * Number of real (non-padding) leaves in `l1ToL2Messages`.
     */
    public numMsgs: number,
    /**
     * The l1 to l2 message tree snapshot immediately before this block.
     */
    public previousL1ToL2: AppendOnlyTreeSnapshot,
    /**
     * Frontier hint for appending the message bundle to `previousL1ToL2`.
     */
    public l1ToL2MessageFrontierHint: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>,
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
      fields.previousRollup,
      fields.l1ToL2Messages,
      fields.numMsgs,
      fields.previousL1ToL2,
      fields.l1ToL2MessageFrontierHint,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousRollup,
      this.l1ToL2Messages,
      this.numMsgs,
      this.previousL1ToL2,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootSingleTxFirstRollupPrivateInputs(
      ProofData.fromBuffer(reader, TxRollupPublicInputs),
      readL1ToL2Messages(reader),
      reader.readNumber(),
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      reader.readArray(L1_TO_L2_MSG_TREE_HEIGHT, Fr),
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
     * The timestamp of this block.
     */
    public timestamp: UInt64,
    /**
     * L1-to-L2 messages inserted by this block, padded with zeros to `MAX_L1_TO_L2_MSGS_PER_BLOCK`.
     */
    public l1ToL2Messages: Fr[],
    /**
     * Number of real (non-padding) leaves in `l1ToL2Messages`.
     */
    public numMsgs: number,
    /**
     * Frontier hint for appending the message bundle to the previous state's l1 to l2 message tree.
     */
    public l1ToL2MessageFrontierHint: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>,
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
      fields.previousArchive,
      fields.previousState,
      fields.constants,
      fields.timestamp,
      fields.l1ToL2Messages,
      fields.numMsgs,
      fields.l1ToL2MessageFrontierHint,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousArchive,
      this.previousState,
      this.constants,
      bigintToUInt64BE(this.timestamp),
      this.l1ToL2Messages,
      this.numMsgs,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootEmptyTxFirstRollupPrivateInputs(
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      StateReference.fromBuffer(reader),
      CheckpointConstantData.fromBuffer(reader),
      reader.readUInt64(),
      readL1ToL2Messages(reader),
      reader.readNumber(),
      reader.readArray(L1_TO_L2_MSG_TREE_HEIGHT, Fr),
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
     * L1-to-L2 messages inserted by this block, padded with zeros to `MAX_L1_TO_L2_MSGS_PER_BLOCK`.
     */
    public l1ToL2Messages: Fr[],
    /**
     * Number of real (non-padding) leaves in `l1ToL2Messages`.
     */
    public numMsgs: number,
    /**
     * Message sponge inherited from the previous block (checked against its `endMsgSponge` in the merge/checkpoint root).
     */
    public startMsgSponge: L1ToL2MessageSponge,
    /**
     * Frontier hint for appending the message bundle to the l1 to l2 tree snapshot carried in the constants.
     */
    public l1ToL2MessageFrontierHint: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootRollupPrivateInputs>) {
    return new BlockRootRollupPrivateInputs(...BlockRootRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockRootRollupPrivateInputs>) {
    return [
      fields.previousRollups,
      fields.l1ToL2Messages,
      fields.numMsgs,
      fields.startMsgSponge,
      fields.l1ToL2MessageFrontierHint,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousRollups,
      this.l1ToL2Messages,
      this.numMsgs,
      this.startMsgSponge,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootRollupPrivateInputs(
      [ProofData.fromBuffer(reader, TxRollupPublicInputs), ProofData.fromBuffer(reader, TxRollupPublicInputs)],
      readL1ToL2Messages(reader),
      reader.readNumber(),
      reader.readObject(L1ToL2MessageSponge),
      reader.readArray(L1_TO_L2_MSG_TREE_HEIGHT, Fr),
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
     * L1-to-L2 messages inserted by this block, padded with zeros to `MAX_L1_TO_L2_MSGS_PER_BLOCK`.
     */
    public l1ToL2Messages: Fr[],
    /**
     * Number of real (non-padding) leaves in `l1ToL2Messages`.
     */
    public numMsgs: number,
    /**
     * Message sponge inherited from the previous block (checked against its `endMsgSponge` in the merge/checkpoint root).
     */
    public startMsgSponge: L1ToL2MessageSponge,
    /**
     * Frontier hint for appending the message bundle to the l1 to l2 tree snapshot carried in the constants.
     */
    public l1ToL2MessageFrontierHint: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootSingleTxRollupPrivateInputs>) {
    return new BlockRootSingleTxRollupPrivateInputs(...BlockRootSingleTxRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockRootSingleTxRollupPrivateInputs>) {
    return [
      fields.previousRollup,
      fields.l1ToL2Messages,
      fields.numMsgs,
      fields.startMsgSponge,
      fields.l1ToL2MessageFrontierHint,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousRollup,
      this.l1ToL2Messages,
      this.numMsgs,
      this.startMsgSponge,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootSingleTxRollupPrivateInputs(
      ProofData.fromBuffer(reader, TxRollupPublicInputs),
      readL1ToL2Messages(reader),
      reader.readNumber(),
      reader.readObject(L1ToL2MessageSponge),
      reader.readArray(L1_TO_L2_MSG_TREE_HEIGHT, Fr),
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
