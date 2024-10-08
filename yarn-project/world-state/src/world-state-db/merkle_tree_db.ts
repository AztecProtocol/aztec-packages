import { type L2Block, type MerkleTreeId } from '@aztec/circuit-types';
import { type MerkleTreeReadOperations, type MerkleTreeWriteOperations } from '@aztec/circuit-types/interfaces';
import { type Fr, MAX_NULLIFIERS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX } from '@aztec/circuits.js';
import { type IndexedTreeSnapshot, type TreeSnapshot } from '@aztec/merkle-tree';

/**
 *
 * @remarks Short explanation:
 *    The nullifier tree must be initially padded as the pre-populated 0 index prevents efficient subtree insertion.
 *    Padding with some values solves this issue.
 *
 * @remarks Thorough explanation:
 *    There needs to be an initial (0,0,0) leaf in the tree, so that when we insert the first 'proper' leaf, we can
 *    prove that any value greater than 0 doesn't exist in the tree yet. We prefill/pad the tree with "the number of
 *    leaves that are added by one block" so that the first 'proper' block can insert a full subtree.
 *
 *    Without this padding, there would be a leaf (0,0,0) at leaf index 0, making it really difficult to insert e.g.
 *    1024 leaves for the first block, because there's only neat space for 1023 leaves after 0. By padding with 1023
 *    more leaves, we can then insert the first block of 1024 leaves into indices 1024:2047.
 */
export const INITIAL_NULLIFIER_TREE_SIZE = 2 * MAX_NULLIFIERS_PER_TX;

export const INITIAL_PUBLIC_DATA_TREE_SIZE = 2 * MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;

export type TreeSnapshots = {
  [MerkleTreeId.NULLIFIER_TREE]: IndexedTreeSnapshot;
  [MerkleTreeId.NOTE_HASH_TREE]: TreeSnapshot<Fr>;
  [MerkleTreeId.PUBLIC_DATA_TREE]: IndexedTreeSnapshot;
  [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: TreeSnapshot<Fr>;
  [MerkleTreeId.ARCHIVE]: TreeSnapshot<Fr>;
};

/** Return type for handleL2BlockAndMessages */
export type HandleL2BlockAndMessagesResult = {
  /** Whether the block processed was emitted by our sequencer */ isBlockOurs: boolean;
};

export interface MerkleTreeAdminDatabase {
  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param block - The L2 block to handle.
   * @param l1ToL2Messages - The L1 to L2 messages for the block.
   */
  handleL2BlockAndMessages(block: L2Block, l1ToL2Messages: Fr[]): Promise<HandleL2BlockAndMessagesResult>;

  /**
   * Gets a handle that allows reading the latest committed state
   */
  getCommitted(): MerkleTreeReadOperations;

  /**
   * Gets a handle that allows reading the state as it was at the given block number
   * @param blockNumber - The block number to get the snapshot for
   */
  getSnapshot(blockNumber: number): MerkleTreeReadOperations;

  /**
   * Forks the database at its current state.
   * @param blockNumber - The block number to fork at. If not provided, the current block number is used.
   */
  fork(blockNumber?: number): Promise<MerkleTreeWriteOperations>;

  /**
   * Forks the database at the given block number.
   */
  fork(blockNumber: number): Promise<MerkleTreeWriteOperations>;

  /** Stops the database */
  close(): Promise<void>;
}
