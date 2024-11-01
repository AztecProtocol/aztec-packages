import { type IndexedTreeId, MerkleTreeId } from '@aztec/circuit-types';
import {
  type Fr,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  type MAX_NULLIFIERS_PER_TX,
  type MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  type MAX_PUBLIC_DATA_READS_PER_TX,
  type MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MembershipWitness,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  type Nullifier,
  type NullifierLeafPreimage,
  PUBLIC_DATA_TREE_HEIGHT,
  type PublicDataRead,
  type PublicDataTreeLeafPreimage,
  type PublicDataUpdateRequest,
  type ScopedReadRequest,
  type TreeLeafReadRequest,
  TreeLeafReadRequestHint,
  buildNullifierNonExistentReadRequestHints,
  buildPublicDataHint,
  buildPublicDataHints,
  buildSiloedNullifierReadRequestHints,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { type Tuple } from '@aztec/foundation/serialize';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { type MerkleTreeReadOperations } from '@aztec/world-state';

export class HintsBuilder {
  constructor(private db: MerkleTreeReadOperations) {}

  async getNoteHashReadRequestsHints(
    readRequests: Tuple<TreeLeafReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  ) {
    return await this.getTreeLeafReadRequestsHints(
      readRequests,
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      NOTE_HASH_TREE_HEIGHT,
      MerkleTreeId.NOTE_HASH_TREE,
    );
  }

  async getNullifierReadRequestHints(
    nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    pendingNullifiers: Tuple<Nullifier, typeof MAX_NULLIFIERS_PER_TX>,
  ) {
    return await buildSiloedNullifierReadRequestHints(
      this,
      nullifierReadRequests,
      pendingNullifiers,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    );
  }

  getNullifierNonExistentReadRequestHints(
    nullifierNonExistentReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX>,
    pendingNullifiers: Tuple<Nullifier, typeof MAX_NULLIFIERS_PER_TX>,
  ) {
    return buildNullifierNonExistentReadRequestHints(this, nullifierNonExistentReadRequests, pendingNullifiers);
  }

  async getL1ToL2MsgReadRequestsHints(
    readRequests: Tuple<TreeLeafReadRequest, typeof MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX>,
  ) {
    return await this.getTreeLeafReadRequestsHints(
      readRequests,
      MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
      L1_TO_L2_MSG_TREE_HEIGHT,
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
    );
  }

  getPublicDataHints(
    publicDataReads: Tuple<PublicDataRead, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
    publicDataUpdateRequests: Tuple<PublicDataUpdateRequest, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
  ) {
    return buildPublicDataHints(this, publicDataReads, publicDataUpdateRequests);
  }

  getPublicDataHint(dataAction: PublicDataRead | PublicDataUpdateRequest | bigint) {
    const slot = typeof dataAction === 'bigint' ? dataAction : dataAction.leafSlot.toBigInt();
    return buildPublicDataHint(this, slot);
  }

  async getNullifierMembershipWitness(nullifier: Fr) {
    const index = await this.db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    if (index === undefined) {
      throw new Error(`Cannot find the leaf for nullifier ${nullifier.toBigInt()}.`);
    }

    return this.getMembershipWitnessWithPreimage<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      NULLIFIER_TREE_HEIGHT,
      index,
    );
  }

  async getLowNullifierMembershipWitness(nullifier: Fr) {
    const res = await this.db.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!res) {
      throw new Error(`Cannot find the low leaf for nullifier ${nullifier.toBigInt()}.`);
    }

    const { index, alreadyPresent } = res;
    if (alreadyPresent) {
      throw new Error(`Nullifier ${nullifier.toBigInt()} already exists in the tree.`);
    }

    // Should find a way to stop casting IndexedTreeLeafPreimage as NullifierLeafPreimage
    return this.getMembershipWitnessWithPreimage<typeof NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage>(
      MerkleTreeId.NULLIFIER_TREE,
      NULLIFIER_TREE_HEIGHT,
      index,
    );
  }

  async getMatchOrLowPublicDataMembershipWitness(leafSlot: bigint) {
    const res = await this.db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
    if (!res) {
      throw new Error(`Cannot find the previous value index for public data ${leafSlot}.`);
    }

    // Should find a way to stop casting IndexedTreeLeafPreimage as PublicDataTreeLeafPreimage everywhere.
    return this.getMembershipWitnessWithPreimage<typeof PUBLIC_DATA_TREE_HEIGHT, PublicDataTreeLeafPreimage>(
      MerkleTreeId.PUBLIC_DATA_TREE,
      PUBLIC_DATA_TREE_HEIGHT,
      res.index,
    );
  }

  private async getMembershipWitnessWithPreimage<
    TREE_HEIGHT extends number,
    LEAF_PREIMAGE extends IndexedTreeLeafPreimage = IndexedTreeLeafPreimage,
  >(treeId: IndexedTreeId, treeHeight: TREE_HEIGHT, index: bigint) {
    const siblingPath = await this.db.getSiblingPath<TREE_HEIGHT>(treeId, index);
    const membershipWitness = new MembershipWitness(treeHeight, index, siblingPath.toTuple());

    const leafPreimage = (await this.db.getLeafPreimage(treeId, index)) as LEAF_PREIMAGE;
    if (!leafPreimage) {
      throw new Error(`Cannot find the leaf preimage for tree ${treeId} at index ${index}.`);
    }

    return { membershipWitness, leafPreimage };
  }

  private async getTreeLeafReadRequestsHints<N extends number, TREE_HEIGHT extends number>(
    readRequests: Tuple<TreeLeafReadRequest, N>,
    size: N,
    treeHeight: TREE_HEIGHT,
    treeId: MerkleTreeId,
  ): Promise<Tuple<TreeLeafReadRequestHint<TREE_HEIGHT>, N>> {
    const hints = makeTuple(size, () => TreeLeafReadRequestHint.empty(treeHeight));
    for (let i = 0; i < readRequests.length; i++) {
      const request = readRequests[i];
      if (!request.isEmpty()) {
        const siblingPath = await this.db.getSiblingPath<typeof treeHeight>(treeId, request.leafIndex.toBigInt());
        hints[i] = new TreeLeafReadRequestHint(treeHeight, siblingPath.toTuple());
      }
    }
    return hints;
  }
}
