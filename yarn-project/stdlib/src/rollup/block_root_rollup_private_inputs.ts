import { SpongeBlob } from '@aztec/blob-lib/types';
import { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { L1ToL2MessageBundle } from '../messaging/l1_to_l2_message_bundle.js';
import { L1ToL2MessageSponge } from '../messaging/l1_to_l2_message_sponge.js';
import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { StateReference } from '../tx/state_reference.js';
import type { UInt64 } from '../types/shared.js';
import { CheckpointConstantData } from './checkpoint_constant_data.js';
import { TxRollupPublicInputs } from './tx_rollup_public_inputs.js';

export class BlockRootNoTxsRollupPrivateInputs {
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
     * Sponge blob this block starts from: initialized for the checkpoint's first block, inherited from the previous
     * block otherwise (checked against `SpongeBlob.init()` or the previous block's `endSpongeBlob` respectively).
     */
    public startSpongeBlob: SpongeBlob,
    /**
     * Message sponge this block starts from: empty for the checkpoint's first block, inherited from the previous block
     * otherwise (checked against the empty sponge or the previous block's `endMsgSponge` respectively).
     */
    public startMsgSponge: L1ToL2MessageSponge,
    /**
     * L1-to-L2 message bundle inserted by this block.
     */
    public messageBundle: L1ToL2MessageBundle,
    /**
     * Frontier hint for appending the message bundle to the previous state's l1 to l2 message tree.
     */
    public l1ToL2MessageFrontierHint: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>,
    /**
     * Hint for inserting the new block hash to the last archive.
     */
    public newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<BlockRootNoTxsRollupPrivateInputs>) {
    return new BlockRootNoTxsRollupPrivateInputs(...BlockRootNoTxsRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BlockRootNoTxsRollupPrivateInputs>) {
    return [
      fields.previousArchive,
      fields.previousState,
      fields.constants,
      fields.timestamp,
      fields.startSpongeBlob,
      fields.startMsgSponge,
      fields.messageBundle,
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
      this.startSpongeBlob,
      this.startMsgSponge,
      this.messageBundle,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootNoTxsRollupPrivateInputs(
      AppendOnlyTreeSnapshot.fromBuffer(reader),
      StateReference.fromBuffer(reader),
      CheckpointConstantData.fromBuffer(reader),
      reader.readUInt64(),
      reader.readObject(SpongeBlob),
      reader.readObject(L1ToL2MessageSponge),
      reader.readObject(L1ToL2MessageBundle),
      reader.readArray(L1_TO_L2_MSG_TREE_HEIGHT, Fr),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
    );
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(BlockRootNoTxsRollupPrivateInputs);
  }
}

export class BlockRootRollupPrivateInputs {
  constructor(
    /**
     * The previous rollup proof data from base or merge rollup circuits.
     */
    public previousRollups: [RollupHonkProofData<TxRollupPublicInputs>, RollupHonkProofData<TxRollupPublicInputs>],
    /**
     * L1-to-L2 message bundle inserted by this block.
     */
    public messageBundle: L1ToL2MessageBundle,
    /**
     * The l1 to l2 message tree snapshot this block builds on (the previous block's post-insertion snapshot). Pinned by
     * block-merge continuity to the previous block's end state; the circuit appends this block's bundle on top and
     * asserts the tx constants carry the resulting post-bundle snapshot.
     */
    public previousL1ToL2: AppendOnlyTreeSnapshot,
    /**
     * Message sponge inherited from the previous block (checked against its `endMsgSponge` in the merge/checkpoint root).
     */
    public startMsgSponge: L1ToL2MessageSponge,
    /**
     * Frontier hint for appending the message bundle to `previousL1ToL2`.
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
      fields.messageBundle,
      fields.previousL1ToL2,
      fields.startMsgSponge,
      fields.l1ToL2MessageFrontierHint,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousRollups,
      this.messageBundle,
      this.previousL1ToL2,
      this.startMsgSponge,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootRollupPrivateInputs(
      [ProofData.fromBuffer(reader, TxRollupPublicInputs), ProofData.fromBuffer(reader, TxRollupPublicInputs)],
      reader.readObject(L1ToL2MessageBundle),
      AppendOnlyTreeSnapshot.fromBuffer(reader),
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
     * L1-to-L2 message bundle inserted by this block.
     */
    public messageBundle: L1ToL2MessageBundle,
    /**
     * The l1 to l2 message tree snapshot this block builds on (the previous block's post-insertion snapshot). Pinned by
     * block-merge continuity to the previous block's end state; the circuit appends this block's bundle on top and
     * asserts the tx constants carry the resulting post-bundle snapshot.
     */
    public previousL1ToL2: AppendOnlyTreeSnapshot,
    /**
     * Message sponge inherited from the previous block (checked against its `endMsgSponge` in the merge/checkpoint root).
     */
    public startMsgSponge: L1ToL2MessageSponge,
    /**
     * Frontier hint for appending the message bundle to `previousL1ToL2`.
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
      fields.messageBundle,
      fields.previousL1ToL2,
      fields.startMsgSponge,
      fields.l1ToL2MessageFrontierHint,
      fields.newArchiveSiblingPath,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousRollup,
      this.messageBundle,
      this.previousL1ToL2,
      this.startMsgSponge,
      this.l1ToL2MessageFrontierHint,
      this.newArchiveSiblingPath,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockRootSingleTxRollupPrivateInputs(
      ProofData.fromBuffer(reader, TxRollupPublicInputs),
      reader.readObject(L1ToL2MessageBundle),
      AppendOnlyTreeSnapshot.fromBuffer(reader),
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
