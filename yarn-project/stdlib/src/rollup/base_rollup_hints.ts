import { SpongeBlob } from '@aztec/blob-lib';
import { ARCHIVE_HEIGHT, MAX_CONTRACT_CLASS_LOGS_PER_TX } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { FieldsOf } from '@aztec/foundation/types';

import { PublicDataHint } from '../avm/public_data_hint.js';
import { ContractClassLogFields } from '../logs/index.js';
import { AppendOnlyTreeSnapshot } from '../trees/index.js';
import { PartialStateReference } from '../tx/partial_state_reference.js';
import { BlockConstantData } from './block_constant_data.js';
import { PrivateBaseStateDiffHints } from './state_diff_hints.js';

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
    public stateDiffHints: PrivateBaseStateDiffHints,
    /**
     * Public data read hint for accessing the balance of the fee payer.
     */
    public feePayerFeeJuiceBalanceReadHint: PublicDataHint,
    /**
     * Membership witnesses of blocks referred by each of the 2 kernels.
     */
    public archiveRootMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>,
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
      fields.stateDiffHints,
      fields.feePayerFeeJuiceBalanceReadHint,
      fields.archiveRootMembershipWitness,
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
      reader.readObject(PrivateBaseStateDiffHints),
      reader.readObject(PublicDataHint),
      MembershipWitness.fromBuffer(reader, ARCHIVE_HEIGHT),
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
      PrivateBaseStateDiffHints.empty(),
      PublicDataHint.empty(),
      MembershipWitness.empty(ARCHIVE_HEIGHT),
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
    public archiveRootMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>,
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
      fields.archiveRootMembershipWitness,
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
      MembershipWitness.fromBuffer(reader, ARCHIVE_HEIGHT),
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
      MembershipWitness.empty(ARCHIVE_HEIGHT),
      makeTuple(MAX_CONTRACT_CLASS_LOGS_PER_TX, ContractClassLogFields.empty),
    );
  }
}
