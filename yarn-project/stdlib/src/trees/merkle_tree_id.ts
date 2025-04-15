import {
  ARCHIVE_HEIGHT,
  ARCHIVE_TREE_ID,
  L1_TO_L2_MESSAGE_TREE_ID,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NOTE_HASH_TREE_ID,
  NULLIFIER_TREE_HEIGHT,
  NULLIFIER_TREE_ID,
  PUBLIC_DATA_TREE_HEIGHT,
  PUBLIC_DATA_TREE_ID,
} from '@aztec/constants';

/**
 * Defines the possible Merkle tree IDs.
 * @remarks The MerkleTrees class expects these to start from zero and be in incremental order.
 */
export enum MerkleTreeId {
  NULLIFIER_TREE = NULLIFIER_TREE_ID, // 0
  NOTE_HASH_TREE = NOTE_HASH_TREE_ID, // 1
  PUBLIC_DATA_TREE = PUBLIC_DATA_TREE_ID, // 2
  L1_TO_L2_MESSAGE_TREE = L1_TO_L2_MESSAGE_TREE_ID, // 3
  ARCHIVE = ARCHIVE_TREE_ID, // 4
}

export const merkleTreeIds = () => {
  return Object.values(MerkleTreeId).filter((v): v is MerkleTreeId => !isNaN(Number(v)));
};

const TREE_HEIGHTS = {
  [MerkleTreeId.NOTE_HASH_TREE]: NOTE_HASH_TREE_HEIGHT,
  [MerkleTreeId.ARCHIVE]: ARCHIVE_HEIGHT,
  [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: L1_TO_L2_MSG_TREE_HEIGHT,
  [MerkleTreeId.NULLIFIER_TREE]: NULLIFIER_TREE_HEIGHT,
  [MerkleTreeId.PUBLIC_DATA_TREE]: PUBLIC_DATA_TREE_HEIGHT,
} as const;

export type TreeHeights = typeof TREE_HEIGHTS;

export function getTreeHeight<TID extends MerkleTreeId>(treeId: TID): TreeHeights[TID] {
  return TREE_HEIGHTS[treeId];
}

const TREE_NAMES = {
  [MerkleTreeId.NULLIFIER_TREE]: 'NULLIFIER_TREE' as const,
  [MerkleTreeId.NOTE_HASH_TREE]: 'NOTE_HASH_TREE' as const,
  [MerkleTreeId.PUBLIC_DATA_TREE]: 'PUBLIC_DATA_TREE' as const,
  [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: 'L1_TO_L2_MESSAGE_TREE' as const,
  [MerkleTreeId.ARCHIVE]: 'ARCHIVE' as const,
} as const;

export function getTreeName<TID extends MerkleTreeId>(treeId: TID): (typeof TREE_NAMES)[TID] {
  return TREE_NAMES[treeId];
}
