import type { Fr } from '@aztec/foundation/fields';
import type { BlockProposal } from '@aztec/stdlib/p2p';

/**
 * Interface of a Block proposal pool. The pool includes block proposals  and is kept up-to-date by a P2P client.
 */
export interface BlockProposalPool {
  /**
   * Adds block proposal to the pool
   *
   * @param blockProposal - Block proposal to add
   *
   * @returns True if block proposal is added, False if it already existed in the pool
   * */
  addBLockProposal(blockProposal: BlockProposal): Promise<boolean>;

  /**
   * Checks if block proposal is in the cache
   *
   * @param hash - The hash of block proposal Header
   *
   * @returns True if block proposal exists in the pool, otherwise false.
   * */
  hasBlockProposal(hash: Fr): Promise<boolean>;

  /**
   * Gets the block proposal from the pool
   *
   * @param hash - The hash of block proposal Header
   *
   * @returns The block proposal if it exists, otherwise undefined.
   * */
  getBlockProposal(hash: Fr): Promise<BlockProposal | undefined>;

  /**
   * Gets current pool size
   */
  size(): Promise<number>;
}
