import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { ARCHIVE_HEIGHT } from '../../constants.gen.js';
import { MembershipWitness } from '../membership_witness.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { PublicDataHint } from '../public_data_hint.js';
import { SpongeBlob } from '../sponge_blob.js';
import { ConstantRollupData } from './constant_rollup_data.js';
import { PrivateBaseStateDiffHints, PublicBaseStateDiffHints } from './state_diff_hints.js';

export type BaseRollupHints = PrivateBaseRollupHints | PublicBaseRollupHints;

export class PrivateBaseRollupHints {
  constructor(
    /** Partial state reference at the start of the rollup. */
    public start: PartialStateReference,
    /** Sponge state to absorb blob inputs at the start of the rollup. */
    public startSpongeBlob: SpongeBlob,
    /** Hints used while proving state diff validity. */
    public stateDiffHints: PrivateBaseStateDiffHints,
    /** Public data read hint for accessing the balance of the fee payer. */
    public feePayerFeeJuiceBalanceReadHint: PublicDataHint,

    /**
     * Membership witnesses of blocks referred by each of the 2 kernels.
     */
    public archiveRootMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>,
    /**
     * Data which is not modified by the base rollup circuit.
     */
    public constants: ConstantRollupData,
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
      reader.readObject(ConstantRollupData),
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
      ConstantRollupData.empty(),
    );
  }
}

export class PublicBaseRollupHints {
  constructor(
    /** Partial state reference at the start of the rollup. */
    public start: PartialStateReference,
    /** Sponge state to absorb blob inputs at the start of the rollup. */
    public startSpongeBlob: SpongeBlob,
    /** Hints used while proving state diff validity. */
    public stateDiffHints: PublicBaseStateDiffHints,
    /**
     * Membership witnesses of blocks referred by each of the 2 kernels.
     */
    public archiveRootMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>,
    /**
     * Data which is not modified by the base rollup circuit.
     */
    public constants: ConstantRollupData,
  ) {}

  static from(fields: FieldsOf<PublicBaseRollupHints>): PublicBaseRollupHints {
    return new PublicBaseRollupHints(...PublicBaseRollupHints.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicBaseRollupHints>) {
    return [
      fields.start,
      fields.startSpongeBlob,
      fields.stateDiffHints,
      fields.archiveRootMembershipWitness,
      fields.constants,
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
      reader.readObject(PartialStateReference),
      reader.readObject(SpongeBlob),
      reader.readObject(PublicBaseStateDiffHints),
      MembershipWitness.fromBuffer(reader, ARCHIVE_HEIGHT),
      reader.readObject(ConstantRollupData),
    );
  }

  static fromString(str: string) {
    return PublicBaseRollupHints.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new PublicBaseRollupHints(
      PartialStateReference.empty(),
      SpongeBlob.empty(),
      PublicBaseStateDiffHints.empty(),
      MembershipWitness.empty(ARCHIVE_HEIGHT),
      ConstantRollupData.empty(),
    );
  }
}
