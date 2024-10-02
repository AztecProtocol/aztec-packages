import { type Fr, type Proof, type RootRollupPublicInputs } from '@aztec/circuits.js';

import { type L2Block } from '../l2_block.js';
import { type BlockBuilder } from './block-builder.js';

/**
 * Coordinates the proving of an entire epoch.
 *
 * Expected usage:
 * ```
 * startNewEpoch
 * foreach block {
 *   addNewBlock
 *   foreach tx {
 *     addTx
 *   }
 *   setBlockCompleted
 * }
 * finaliseEpoch
 * ```
 */
export interface EpochProver extends BlockBuilder {
  /**
   * Starts a new epoch. Must be the first method to be called.
   * @param epochNumber - The epoch number.
   * @param totalNumBlocks - The total number of blocks expected in the epoch (must be at least one).
   **/
  startNewEpoch(epochNumber: number, totalNumBlocks: number): void;

  /** Pads the epoch with empty block roots if needed and blocks until proven. Throws if proving has failed. */
  finaliseEpoch(): Promise<{ publicInputs: RootRollupPublicInputs; proof: Proof }>;

  /** Cancels all proving jobs. */
  cancel(): void;

  /** Returns an identifier for the prover or zero if not set. */
  getProverId(): Fr;

  /** Returns the block assembled at a given index (zero-based) within the epoch. */
  getBlock(index: number): L2Block;
}
