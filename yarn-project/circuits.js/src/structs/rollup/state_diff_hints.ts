import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import {
  MAX_NULLIFIERS_PER_TX,
  NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '../../constants.gen.js';
import { MembershipWitness } from '../membership_witness.js';
import { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '../trees/index.js';

/**
 * Hints used while proving state diff validity for the private base rollup.
 */
export class PrivateBaseStateDiffHints {
  constructor(
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
     * Sibling path "pointing to" where the new note hash subtree should be inserted into the note hash tree.
     */
    public noteHashSubtreeSiblingPath: Tuple<Fr, typeof NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH>,
    /**
     * Sibling path "pointing to" where the new nullifiers subtree should be inserted into the nullifier tree.
     */
    public nullifierSubtreeSiblingPath: Tuple<Fr, typeof NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH>,

    /**
     * Low leaf for the fee write in the public data tree.
     */
    public feeWriteLowLeafPreimage: PublicDataTreeLeafPreimage,
    /**
     * Membership witness for the low leaf for the fee write in the public data tree.
     */
    public feeWriteLowLeafMembershipWitness: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
    /**
     * Sibling path "pointing to" where the fee write should be inserted into the public data tree.
     */
    public feeWriteSiblingPath: Tuple<Fr, typeof PUBLIC_DATA_TREE_HEIGHT>,
  ) {}

  static from(fields: FieldsOf<PrivateBaseStateDiffHints>): PrivateBaseStateDiffHints {
    return new PrivateBaseStateDiffHints(...PrivateBaseStateDiffHints.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateBaseStateDiffHints>) {
    return [
      fields.nullifierPredecessorPreimages,
      fields.nullifierPredecessorMembershipWitnesses,
      fields.sortedNullifiers,
      fields.sortedNullifierIndexes,
      fields.noteHashSubtreeSiblingPath,
      fields.nullifierSubtreeSiblingPath,
      fields.feeWriteLowLeafPreimage,
      fields.feeWriteLowLeafMembershipWitness,
      fields.feeWriteSiblingPath,
    ] as const;
  }

  /**
   * Serializes the state diff hints to a buffer.
   * @returns A buffer of the serialized state diff hints.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(...PrivateBaseStateDiffHints.getFields(this));
  }

  /**
   * Deserializes the state diff hints from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new PrivateBaseStateDiffHints instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateBaseStateDiffHints {
    const reader = BufferReader.asReader(buffer);
    return new PrivateBaseStateDiffHints(
      reader.readArray(MAX_NULLIFIERS_PER_TX, NullifierLeafPreimage),
      reader.readArray(MAX_NULLIFIERS_PER_TX, {
        fromBuffer: buffer => MembershipWitness.fromBuffer(buffer, NULLIFIER_TREE_HEIGHT),
      }),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readNumbers(MAX_NULLIFIERS_PER_TX),
      reader.readArray(NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, Fr),
      reader.readArray(NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, Fr),
      reader.readObject(PublicDataTreeLeafPreimage),
      MembershipWitness.fromBuffer(reader, PUBLIC_DATA_TREE_HEIGHT),
      reader.readArray(PUBLIC_DATA_TREE_HEIGHT, Fr),
    );
  }

  static empty() {
    return new PrivateBaseStateDiffHints(
      makeTuple(MAX_NULLIFIERS_PER_TX, NullifierLeafPreimage.empty),
      makeTuple(MAX_NULLIFIERS_PER_TX, () => MembershipWitness.empty(NULLIFIER_TREE_HEIGHT)),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, () => 0),
      makeTuple(NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, Fr.zero),
      makeTuple(NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, Fr.zero),
      PublicDataTreeLeafPreimage.empty(),
      MembershipWitness.empty(PUBLIC_DATA_TREE_HEIGHT),
      makeTuple(PUBLIC_DATA_TREE_HEIGHT, Fr.zero),
    );
  }
}
