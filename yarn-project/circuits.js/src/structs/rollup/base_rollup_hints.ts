import { makeTuple } from '@aztec/foundation/array';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import {
  ARCHIVE_HEIGHT,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_DATA_TREE_HEIGHT,
} from '../../constants.gen.js';
import { MembershipWitness } from '../membership_witness.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { PublicDataHint } from '../public_data_hint.js';
import { type UInt32 } from '../shared.js';
import { PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '../trees/index.js';
import { ConstantRollupData } from './constant_rollup_data.js';
import { StateDiffHints } from './state_diff_hints.js';

export class BaseRollupHints {
  constructor(
    /** Partial state reference at the start of the rollup. */
    public start: PartialStateReference,
    /** Hints used while proving state diff validity. */
    public stateDiffHints: StateDiffHints,
    /** Public data read hint for accessing the balance of the fee payer. */
    public feePayerFeeJuiceBalanceReadHint: PublicDataHint,
    /**
     * The public data writes to be inserted in the tree, sorted high slot to low slot.
     */
    public sortedPublicDataWrites: Tuple<PublicDataTreeLeaf, typeof MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,

    /**
     * The indexes of the sorted public data writes to the original ones.
     */
    public sortedPublicDataWritesIndexes: Tuple<UInt32, typeof MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
    /**
     * The public data writes which need to be updated to perform the batch insertion of the new public data writes.
     * See `StandardIndexedTree.batchInsert` function for more details.
     */
    public lowPublicDataWritesPreimages: Tuple<
      PublicDataTreeLeafPreimage,
      typeof MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    >,
    /**
     * Membership witnesses for the nullifiers which need to be updated to perform the batch insertion of the new
     * nullifiers.
     */
    public lowPublicDataWritesMembershipWitnesses: Tuple<
      MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
      typeof MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    >,
    /**
     * Membership witnesses of blocks referred by each of the 2 kernels.
     */
    public archiveRootMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>,
    /**
     * Data which is not modified by the base rollup circuit.
     */
    public constants: ConstantRollupData,
  ) {}

  static from(fields: FieldsOf<BaseRollupHints>): BaseRollupHints {
    return new BaseRollupHints(...BaseRollupHints.getFields(fields));
  }

  static getFields(fields: FieldsOf<BaseRollupHints>) {
    return [
      fields.start,
      fields.stateDiffHints,
      fields.feePayerFeeJuiceBalanceReadHint,
      fields.sortedPublicDataWrites,
      fields.sortedPublicDataWritesIndexes,
      fields.lowPublicDataWritesPreimages,
      fields.lowPublicDataWritesMembershipWitnesses,
      fields.archiveRootMembershipWitness,
      fields.constants,
    ] as const;
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...BaseRollupHints.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromBuffer(buffer: Buffer | BufferReader): BaseRollupHints {
    const reader = BufferReader.asReader(buffer);
    return new BaseRollupHints(
      reader.readObject(PartialStateReference),
      reader.readObject(StateDiffHints),
      reader.readObject(PublicDataHint),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataTreeLeaf),
      reader.readNumbers(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataTreeLeafPreimage),
      reader.readArray(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, {
        fromBuffer: buffer => MembershipWitness.fromBuffer(buffer, PUBLIC_DATA_TREE_HEIGHT),
      }),
      MembershipWitness.fromBuffer(reader, ARCHIVE_HEIGHT),
      reader.readObject(ConstantRollupData),
    );
  }

  static fromString(str: string) {
    return BaseRollupHints.fromBuffer(Buffer.from(str, 'hex'));
  }

  static empty() {
    return new BaseRollupHints(
      PartialStateReference.empty(),
      StateDiffHints.empty(),
      PublicDataHint.empty(),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataTreeLeaf.empty),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, () => 0),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataTreeLeafPreimage.empty),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, () => MembershipWitness.empty(PUBLIC_DATA_TREE_HEIGHT)),
      MembershipWitness.empty(ARCHIVE_HEIGHT),
      ConstantRollupData.empty(),
    );
  }
}
