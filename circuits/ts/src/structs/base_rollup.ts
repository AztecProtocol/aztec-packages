import { BufferReader } from "../utils/buffer_reader.js";
import { assertLength, FieldsOf } from "../utils/jsUtils.js";
import { serializeToBuffer } from "../utils/serialize.js";
import {
  CONTRACT_TREE_ROOTS_TREE_HEIGHT,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
} from "./constants.js";
import { PreviousKernelData } from "./kernel.js";
import {
  AggregationObject,
  Fr,
  MembershipWitness,
  RollupTypes,
  UInt32,
} from "./shared.js";

export class NullifierLeafPreimage {
  constructor(
    public leafValue: Fr,
    public nextValue: Fr,
    public nextIndex: UInt32
  ) {}

  toBuffer() {
    return serializeToBuffer(this.leafValue, this.nextValue, this.nextIndex);
  }
}

export class AppendOnlyTreeSnapshot {
  constructor(public root: Fr, public nextAvailableLeafIndex: UInt32) {}

  toBuffer() {
    return serializeToBuffer(this.root, this.nextAvailableLeafIndex);
  }

  static fromBuffer(buffer: Buffer | BufferReader): AppendOnlyTreeSnapshot {
    const reader = BufferReader.asReader(buffer);
    return new AppendOnlyTreeSnapshot(reader.readFr(), reader.readNumber());
  }
}

export class ConstantBaseRollupData {
  constructor(
    // The very latest roots as at the very beginning of the entire rollup:
    public startTreeOfHistoricPrivateDataTreeRootsSnapshot: AppendOnlyTreeSnapshot,
    public startTreeOfHistoricContractTreeRootsSnapshot: AppendOnlyTreeSnapshot,
    public treeOfHistoricL1ToL2MsgTreeRootsSnapshot: AppendOnlyTreeSnapshot,

    // Some members of this struct tbd:
    public privateKernelVkTreeRoot: Fr,
    public publicKernelVkTreeRoot: Fr,
    public baseRollupVkHash: Fr,
    public mergeRollupVkHash: Fr
  ) {}

  static from(
    fields: FieldsOf<ConstantBaseRollupData>
  ): ConstantBaseRollupData {
    return new ConstantBaseRollupData(
      ...ConstantBaseRollupData.getFields(fields)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): ConstantBaseRollupData {
    const reader = BufferReader.asReader(buffer);
    return new ConstantBaseRollupData(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr()
    );
  }

  static getFields(fields: FieldsOf<ConstantBaseRollupData>) {
    return [
      fields.startTreeOfHistoricPrivateDataTreeRootsSnapshot,
      fields.startTreeOfHistoricContractTreeRootsSnapshot,
      fields.treeOfHistoricL1ToL2MsgTreeRootsSnapshot,
      fields.privateKernelVkTreeRoot,
      fields.publicKernelVkTreeRoot,
      fields.baseRollupVkHash,
      fields.mergeRollupVkHash,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...ConstantBaseRollupData.getFields(this));
  }
}

/**
 * Inputs to the base rollup circuit
 */
export class BaseRollupInputs {
  constructor(
    public kernelData: [PreviousKernelData, PreviousKernelData],

    public startNullifierTreeSnapshot: AppendOnlyTreeSnapshot,
    public lowNullifierLeafPreimages: NullifierLeafPreimage[],
    public lowNullifierMembershipWitness: MembershipWitness<
      typeof NULLIFIER_TREE_HEIGHT
    >[],

    public historicPrivateDataTreeRootMembershipWitnesses: [
      MembershipWitness<typeof PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT>,
      MembershipWitness<typeof PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT>
    ],
    public historicContractsTreeRootMembershipWitnesses: [
      MembershipWitness<typeof CONTRACT_TREE_ROOTS_TREE_HEIGHT>,
      MembershipWitness<typeof CONTRACT_TREE_ROOTS_TREE_HEIGHT>
    ],

    public constants: ConstantBaseRollupData,

    public proverId: Fr
  ) {
    assertLength(
      this,
      "lowNullifierLeafPreimages",
      2 * KERNEL_NEW_NULLIFIERS_LENGTH
    );
    assertLength(
      this,
      "lowNullifierMembershipWitness",
      2 * KERNEL_NEW_NULLIFIERS_LENGTH
    );
  }

  static from(fields: FieldsOf<BaseRollupInputs>): BaseRollupInputs {
    return new BaseRollupInputs(...BaseRollupInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BaseRollupInputs>) {
    return [
      fields.kernelData,
      fields.startNullifierTreeSnapshot,
      fields.lowNullifierLeafPreimages,
      fields.lowNullifierMembershipWitness,
      fields.historicPrivateDataTreeRootMembershipWitnesses,
      fields.historicContractsTreeRootMembershipWitnesses,
      fields.constants,
      fields.proverId,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BaseRollupInputs.getFields(this));
  }
}

/**
 * Output of the base rollup circuit
 */
export class BaseRollupPublicInputs {
  constructor(
    public rollupType: RollupTypes,

    public endAggregationObject: AggregationObject,
    public constants: ConstantBaseRollupData,

    // The only tree root actually updated in this circuit is the nullifier tree, because earlier leaves (of low_nullifiers) must be updated to point to the new nullifiers in this circuit.
    public startNullifierTreeSnapshot: AppendOnlyTreeSnapshot,
    public endNullifierTreeSnapshots: AppendOnlyTreeSnapshot,

    public newCommitmentsSubtreeRoot: Fr,
    public newNullifiersSubtreeRoot: Fr,
    public newContractLeavesSubtreeRoot: Fr,

    // Hashes (probably sha256) to make public inputs constant-sized (to then be unpacked on-chain)
    public newCommitmentsHash: Fr,
    public newNullifiersHash: Fr,
    public newL1MsgsHash: Fr,
    public newContractDataHash: Fr,
    public proverContributionsHash: Fr
  ) {}

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param bufferReader - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): BaseRollupPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BaseRollupPublicInputs(
      reader.readNumber(),
      reader.readObject(AggregationObject),
      reader.readObject(ConstantBaseRollupData),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr(),
      reader.readFr()
    );
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.rollupType.valueOf(),
      this.endAggregationObject,
      this.constants,

      this.startNullifierTreeSnapshot,
      this.endNullifierTreeSnapshots,

      this.newCommitmentsSubtreeRoot,
      this.newNullifiersSubtreeRoot,
      this.newContractLeavesSubtreeRoot,

      this.newCommitmentsHash,
      this.newNullifiersHash,
      this.newL1MsgsHash,
      this.newContractDataHash,
      this.proverContributionsHash
    );
  }
}
