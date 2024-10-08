import { type L2Block, type MerkleTreeId } from '@aztec/circuit-types';
import { type MerkleTreeReadOperations, type MerkleTreeWriteOperations } from '@aztec/circuit-types/interfaces';
import { type Fr, MAX_NULLIFIERS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX } from '@aztec/circuits.js';
import { type IndexedTreeSnapshot, type TreeSnapshot } from '@aztec/merkle-tree';

import { type WorldStateStatus } from '../native/message.js';

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

export interface MerkleTreeAdminDatabase {
  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param block - The L2 block to handle.
   * @param l1ToL2Messages - The L1 to L2 messages for the block.
   */
  handleL2BlockAndMessages(block: L2Block, l1ToL2Messages: Fr[]): Promise<WorldStateStatus>;

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
   * Removes all historical snapshots up to but not including the given block number
   * @param toBlockNumber The block number of the new oldest historical block
   * @returns The new WorldStateStatus
   */
  removeHistoricalBlocks(toBlockNumber: bigint): Promise<WorldStateStatus>;

  /**
   * Removes all pending blocks down to but not including the given block number
   * @param toBlockNumber The block number of the new tip of the pending chain,
   * @returns The new WorldStateStatus
   */
  unwindBlocks(toBlockNumber: bigint): Promise<WorldStateStatus>;

  /**
   * Advances the finalised block number to be the number provided
   * @param toBlockNumber The block number that is now the tip of the finalised chain
   * @returns The new WorldStateStatus
   */
  setFinalised(toBlockNumber: bigint): Promise<WorldStateStatus>;

  /**
   * Gets the current status of the database.
   * @returns The current WorldStateStatus.
   */
  getStatus(): Promise<WorldStateStatus>;

  /** Stops the database */
  close(): Promise<void>;
}
