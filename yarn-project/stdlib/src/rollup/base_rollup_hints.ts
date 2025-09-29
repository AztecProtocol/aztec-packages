import { SpongeBlob } from '@aztec/blob-lib/types';
import { ARCHIVE_HEIGHT, MAX_CONTRACT_CLASS_LOGS_PER_TX } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { ContractClassLogFields } from '../logs/index.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { PublicDataTreeLeafPreimage } from '../trees/public_data_leaf.js';
import { PartialStateReference } from '../tx/partial_state_reference.js';
import { BlockConstantData } from './block_constant_data.js';
import { TreeSnapshotDiffHints } from './tree_snapshot_diff_hints.js';

export type BaseRollupHints = PrivateBaseRollupHints | PublicBaseRollupHints;

export class PrivateBaseRollupHints {
  constructor(
    /**
     * Partial state reference at the start of the rollup.
     */
    public start: PartialStateReference,
    /**
     * Sponge state to absorb blob inputs at the start of the rollup.
     */
    public startSpongeBlob: SpongeBlob,
    /**
     * Hints used while proving state diff validity.
     */
    public treeSnapshotDiffHints: TreeSnapshotDiffHints,
    /**
     * Public data tree leaf preimage for accessing the balance of the fee payer.
     */
    public feePayerBalanceLeafPreimage: PublicDataTreeLeafPreimage,
    /**
     * Membership witnesses of blocks referred by each of the 2 kernels.
     */
    public anchorBlockArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    /**
     * Preimages to the kernel's contractClassLogsHashes.
     */
    public contractClassLogsFields: Tuple<ContractClassLogFields, typeof MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    /**
     * Data which is not modified by the base rollup circuit.
     */
    public constants: BlockConstantData,
  ) {}

  static from(fields: FieldsOf<PrivateBaseRollupHints>): PrivateBaseRollupHints {
    return new PrivateBaseRollupHints(...PrivateBaseRollupHints.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateBaseRollupHints>) {
    return [
      fields.start,
      fields.startSpongeBlob,
      fields.treeSnapshotDiffHints,
      fields.feePayerBalanceLeafPreimage,
      fields.anchorBlockArchiveSiblingPath,
      fields.contractClassLogsFields,
      fields.constants,
    ] as const;
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...PrivateBaseRollupHints.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateBaseRollupHints {
    const reader = BufferReader.asReader(buffer);
    return new PrivateBaseRollupHints(
      reader.readObject(PartialStateReference),
      reader.readObject(SpongeBlob),
      reader.readObject(TreeSnapshotDiffHints),
      reader.readObject(PublicDataTreeLeafPreimage),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_TX, () => reader.readObject(ContractClassLogFields)),
      reader.readObject(BlockConstantData),
    );
  }

  static fromString(str: string) {
    return PrivateBaseRollupHints.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new PrivateBaseRollupHints(
      PartialStateReference.empty(),
      SpongeBlob.empty(),
      TreeSnapshotDiffHints.empty(),
      PublicDataTreeLeafPreimage.empty(),
      makeTuple(ARCHIVE_HEIGHT, Fr.zero),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_TX, ContractClassLogFields.empty),
      BlockConstantData.empty(),
    );
  }
}

export class PublicBaseRollupHints {
  constructor(
    /**
     * Sponge state to absorb blob inputs at the start of the rollup.
     */
    public startSpongeBlob: SpongeBlob,
    /**
     * Archive tree snapshot at the very beginning of the block containing this base rollup.
     */
    public lastArchive: AppendOnlyTreeSnapshot,
    /**
     * Membership witnesses of blocks referred by each of the 2 kernels.
     */
    public anchorBlockArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    /**
     * Preimages to the kernel's contractClassLogsHashes.
     */
    public contractClassLogsFields: Tuple<ContractClassLogFields, typeof MAX_CONTRACT_CLASS_LOGS_PER_TX>,
  ) {}

  static from(fields: FieldsOf<PublicBaseRollupHints>): PublicBaseRollupHints {
    return new PublicBaseRollupHints(...PublicBaseRollupHints.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicBaseRollupHints>) {
    return [
      fields.startSpongeBlob,
      fields.lastArchive,
      fields.anchorBlockArchiveSiblingPath,
      fields.contractClassLogsFields,
    ] as const;
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...PublicBaseRollupHints.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicBaseRollupHints {
    const reader = BufferReader.asReader(buffer);
    return new PublicBaseRollupHints(
      reader.readObject(SpongeBlob),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readArray(ARCHIVE_HEIGHT, Fr),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_TX, () => reader.readObject(ContractClassLogFields)),
    );
  }

  static fromString(str: string) {
    return PublicBaseRollupHints.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new PublicBaseRollupHints(
      SpongeBlob.empty(),
      AppendOnlyTreeSnapshot.empty(),
      makeTuple(ARCHIVE_HEIGHT, Fr.zero),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_TX, ContractClassLogFields.empty),
    );
  }
}
