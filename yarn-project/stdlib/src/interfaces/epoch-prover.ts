import type { Fr } from '@aztec/foundation/fields';

import type { L2Block } from '../block/l2_block.js';
import type { Proof } from '../proofs/proof.js';
import type { RootRollupPublicInputs } from '../rollup/root_rollup.js';
import type { BlockHeader } from '../tx/block_header.js';
import type { Tx } from '../tx/tx.js';
import type { IBlockFactory } from './block-builder.js';

/** Coordinates the proving of an entire epoch. */
export interface EpochProver extends Omit<IBlockFactory, 'setBlockCompleted'> {
  /**
   * Starts a new epoch. Must be the first method to be called.
   * @param epochNumber - The epoch number.
   * @param firstBlockNumber - The block number of the first block in the epoch.
   * @param totalNumBlocks - The total number of blocks expected in the epoch (must be at least one).
   **/
  startNewEpoch(epochNumber: number, firstBlockNumber: number, totalNumBlocks: number): void;

  /**
   * Kickstarts tube circuits for the specified txs. These will be used during epoch proving.
   * Note that if the tube circuits are not started this way, they will be started nontheless after processing.
   */
  startTubeCircuits(txs: Tx[]): Promise<void>;

  /** Returns the block. */
  setBlockCompleted(blockNumber: number, expectedBlockHeader?: BlockHeader): Promise<L2Block>;

  /** Pads the epoch with empty block roots if needed and blocks until proven. Throws if proving has failed. */
  finaliseEpoch(): Promise<{ publicInputs: RootRollupPublicInputs; proof: Proof }>;

  /** Cancels all proving jobs. */
  cancel(): void;

  /** Returns an identifier for the prover or zero if not set. */
  getProverId(): Fr;

  /** Returns the block assembled at a given index (zero-based) within the epoch. */
  getBlock(index: number): L2Block;

  /** Called when no longer required, cleans up internal resources */
  stop(): Promise<void>;
}
