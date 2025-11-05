import {
  MAX_NULLIFIERS_PER_TX,
  NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { FieldsOf } from '@aztec/foundation/types';

import { NullifierLeafPreimage } from '../trees/index.js';

/**
 * Hints used while proving state diff validity for the private base rollup.
 */
export class TreeSnapshotDiffHints {
  constructor(
    /**
     * Sibling path "pointing to" where the new note hash subtree should be inserted into the note hash tree.
     */
    public noteHashSubtreeRootSiblingPath: Tuple<Fr, typeof NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
    /**
     * The nullifiers which need to be updated to perform the batch insertion of the new nullifiers.
     * See `StandardIndexedTree.batchInsert` function for more details.
     */
    public nullifierPredecessorPreimages: Tuple<NullifierLeafPreimage, typeof MAX_NULLIFIERS_PER_TX>,
    /**
     * Membership witnesses for the nullifiers which need to be updated to perform the batch insertion of the new
     * nullifiers.
     */
    public nullifierPredecessorMembershipWitnesses: Tuple<
      MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>,
      typeof MAX_NULLIFIERS_PER_TX
    >,
    /**
     * The nullifiers to be inserted in the tree, sorted high to low.
     */
    public sortedNullifiers: Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>,
    /**
     * The indexes of the sorted nullifiers to the original ones.
     */
    public sortedNullifierIndexes: Tuple<number, typeof MAX_NULLIFIERS_PER_TX>,
    /**
     * Sibling path "pointing to" where the new nullifiers subtree should be inserted into the nullifier tree.
     */
    public nullifierSubtreeRootSiblingPath: Tuple<Fr, typeof NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
    /**
     * Membership witness for the fee payer's balance leaf in the public data tree.
     */
    public feePayerBalanceMembershipWitness: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<TreeSnapshotDiffHints>): TreeSnapshotDiffHints {
    return new TreeSnapshotDiffHints(...TreeSnapshotDiffHints.getFields(fields));
  }

  static getFields(fields: FieldsOf<TreeSnapshotDiffHints>) {
    return [
      fields.noteHashSubtreeRootSiblingPath,
      fields.nullifierPredecessorPreimages,
      fields.nullifierPredecessorMembershipWitnesses,
      fields.sortedNullifiers,
      fields.sortedNullifierIndexes,
      fields.nullifierSubtreeRootSiblingPath,
      fields.feePayerBalanceMembershipWitness,
    ] as const;
  }

  /**
   * Serializes the state diff hints to a buffer.
   * @returns A buffer of the serialized state diff hints.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(...TreeSnapshotDiffHints.getFields(this));
  }

  /**
   * Deserializes the state diff hints from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new TreeSnapshotDiffHints instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TreeSnapshotDiffHints {
    const reader = BufferReader.asReader(buffer);
    return new TreeSnapshotDiffHints(
      reader.readArray(NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH, Fr),
      reader.readArray(MAX_NULLIFIERS_PER_TX, NullifierLeafPreimage),
      reader.readArray(MAX_NULLIFIERS_PER_TX, {
        fromBuffer: buffer => MembershipWitness.fromBuffer(buffer, NULLIFIER_TREE_HEIGHT),
      }),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readNumbers(MAX_NULLIFIERS_PER_TX),
      reader.readArray(NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH, Fr),
      MembershipWitness.fromBuffer(reader, PUBLIC_DATA_TREE_HEIGHT),
    );
  }

  static empty() {
    return new TreeSnapshotDiffHints(
      makeTuple(NOTE_HASH_SUBTREE_ROOT_SIBLING_PATH_LENGTH, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, NullifierLeafPreimage.empty),
      makeTuple(MAX_NULLIFIERS_PER_TX, () => MembershipWitness.empty(NULLIFIER_TREE_HEIGHT)),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, () => 0),
      makeTuple(NULLIFIER_SUBTREE_ROOT_SIBLING_PATH_LENGTH, Fr.zero),
      MembershipWitness.empty(PUBLIC_DATA_TREE_HEIGHT),
    );
  }
}
