import { BufferReader, Fr } from '@aztec/foundation';
import assert from 'assert';
import { FieldsOf, assertLength } from '../../utils/jsUtils.js';
import { serializeToBuffer } from '../../utils/serialize.js';
import {
  CONTRACT_TREE_HEIGHT,
  CONTRACT_TREE_ROOTS_TREE_HEIGHT,
  KERNEL_NEW_COMMITMENTS_LENGTH,
  KERNEL_NEW_CONTRACTS_LENGTH,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  PRIVATE_DATA_TREE_HEIGHT,
  PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  STATE_READS_LENGTH,
  STATE_TRANSITIONS_LENGTH,
} from '../constants.js';
import { PreviousKernelData } from '../kernel/previous_kernel_data.js';
import { MembershipWitness } from '../membership_witness.js';
import { UInt32 } from '../shared.js';
import { SiblingPath } from '../sibling_path.js';
import { AppendOnlyTreeSnapshot } from './append_only_tree_snapshot.js';

export class NullifierLeafPreimage {
  constructor(public leafValue: Fr, public nextValue: Fr, public nextIndex: UInt32) {}

  toBuffer() {
    return serializeToBuffer(this.leafValue, this.nextValue, this.nextIndex);
  }

  static empty() {
    return new NullifierLeafPreimage(Fr.ZERO, Fr.ZERO, 0);
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
    public mergeRollupVkHash: Fr,
  ) {}

  static from(fields: FieldsOf<ConstantBaseRollupData>): ConstantBaseRollupData {
    return new ConstantBaseRollupData(...ConstantBaseRollupData.getFields(fields));
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
      reader.readFr(),
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

export const PRIVATE_DATA_SUBTREE_HEIGHT = Math.log2(KERNEL_NEW_COMMITMENTS_LENGTH * 2);
export const CONTRACT_SUBTREE_HEIGHT = Math.log2(KERNEL_NEW_CONTRACTS_LENGTH * 2);
export const NULLIFIER_SUBTREE_HEIGHT = Math.log2(KERNEL_NEW_NULLIFIERS_LENGTH * 2);

// Set these constants to a fixed number, so we can retrieve the constant value via typeof, and
// use it for type checking the length of these sibling paths. We need constexprs in typescript!
export const PRIVATE_DATA_SUBTREE_SIBLING_PATH_LENGTH = 5;
export const NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH = 5;
export const CONTRACT_SUBTREE_SIBLING_PATH_LENGTH = 3;

assert(
  PRIVATE_DATA_SUBTREE_SIBLING_PATH_LENGTH === PRIVATE_DATA_TREE_HEIGHT - PRIVATE_DATA_SUBTREE_HEIGHT,
  'Invalid constant value for PRIVATE_DATA_SUBTREE_SIBLING_PATH_LENGTH',
);

assert(
  NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH === NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT,
  'Invalid constant value for NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH',
);

assert(
  CONTRACT_SUBTREE_SIBLING_PATH_LENGTH === CONTRACT_TREE_HEIGHT - CONTRACT_SUBTREE_HEIGHT,
  'Invalid constant value for CONTRACT_SUBTREE_SIBLING_PATH_LENGTH',
);

/**
 * Inputs to the base rollup circuit
 */
export class BaseRollupInputs {
  constructor(
    public kernelData: [PreviousKernelData, PreviousKernelData],

    public startPrivateDataTreeSnapshot: AppendOnlyTreeSnapshot,
    public startNullifierTreeSnapshot: AppendOnlyTreeSnapshot,
    public startContractTreeSnapshot: AppendOnlyTreeSnapshot,
    public startPublicDataTreeSnapshot: AppendOnlyTreeSnapshot,

    public lowNullifierLeafPreimages: NullifierLeafPreimage[],
    public lowNullifierMembershipWitness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>[],

    public newCommitmentsSubtreeSiblingPath: SiblingPath<typeof PRIVATE_DATA_SUBTREE_SIBLING_PATH_LENGTH>,
    public newNullifiersSubtreeSiblingPath: SiblingPath<typeof NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH>,
    public newContractsSubtreeSiblingPath: SiblingPath<typeof CONTRACT_SUBTREE_SIBLING_PATH_LENGTH>,
    public newStateTransitionsSiblingPaths: SiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>[],
    public newStateReadsSiblingPaths: SiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>[],

    public historicPrivateDataTreeRootMembershipWitnesses: [
      MembershipWitness<typeof PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT>,
      MembershipWitness<typeof PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT>,
    ],
    public historicContractsTreeRootMembershipWitnesses: [
      MembershipWitness<typeof CONTRACT_TREE_ROOTS_TREE_HEIGHT>,
      MembershipWitness<typeof CONTRACT_TREE_ROOTS_TREE_HEIGHT>,
    ],

    public constants: ConstantBaseRollupData,
  ) {
    assertLength(this, 'lowNullifierLeafPreimages', 2 * KERNEL_NEW_NULLIFIERS_LENGTH);
    assertLength(this, 'lowNullifierMembershipWitness', 2 * KERNEL_NEW_NULLIFIERS_LENGTH);
    assertLength(this, 'newStateTransitionsSiblingPaths', 2 * STATE_TRANSITIONS_LENGTH);
    assertLength(this, 'newStateReadsSiblingPaths', 2 * STATE_READS_LENGTH);
  }

  static from(fields: FieldsOf<BaseRollupInputs>): BaseRollupInputs {
    return new BaseRollupInputs(...BaseRollupInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<BaseRollupInputs>) {
    return [
      fields.kernelData,
      fields.startPrivateDataTreeSnapshot,
      fields.startNullifierTreeSnapshot,
      fields.startContractTreeSnapshot,
      fields.startPublicDataTreeSnapshot,
      fields.lowNullifierLeafPreimages,
      fields.lowNullifierMembershipWitness,
      fields.newCommitmentsSubtreeSiblingPath,
      fields.newNullifiersSubtreeSiblingPath,
      fields.newContractsSubtreeSiblingPath,
      fields.newStateTransitionsSiblingPaths,
      fields.newStateReadsSiblingPaths,
      fields.historicPrivateDataTreeRootMembershipWitnesses,
      fields.historicContractsTreeRootMembershipWitnesses,
      fields.constants,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer(...BaseRollupInputs.getFields(this));
  }
}
