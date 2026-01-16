import type { BatchedBlob, FinalBlobBatchingChallenges } from '@aztec/blob-lib/types';
import type { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { Proof } from '../proofs/proof.js';
import type { CheckpointConstantData } from '../rollup/checkpoint_constant_data.js';
import type { RootRollupPublicInputs } from '../rollup/root_rollup_public_inputs.js';
import type { BlockHeader } from '../tx/block_header.js';
import type { Tx } from '../tx/tx.js';
import type { UInt64 } from '../types/index.js';
import type { IBlockFactory } from './block-builder.js';

/** Coordinates the proving of an entire epoch. */
export interface EpochProver extends Omit<IBlockFactory, 'setBlockCompleted' | 'startNewBlock'> {
  /**
   * Starts a new epoch. Must be the first method to be called.
   * @param epochNumber - The epoch number.
   * @param totalNumCheckpoints - The total number of checkpoints expected in the epoch (must be at least one).
   * @param finalBlobBatchingChallenges - The final blob batching challenges for the epoch.
   **/
  startNewEpoch(
    epochNumber: EpochNumber,
    totalNumCheckpoints: number,
    finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
  ): void;

  /**
   * Starts a new checkpoint.
   * @param checkpointIndex - The index of the checkpoint in the epoch.
   * @param constants - The constants for this checkpoint.
   * @param l1ToL2Messages - The set of L1 to L2 messages to be included in this checkpoint.
   * @param totalNumBlocks - The total number of blocks expected in the checkpoint (must be at least one).
   * @param headerOfLastBlockInPreviousCheckpoint - The header of the last block in the previous checkpoint.
   */
  startNewCheckpoint(
    checkpointIndex: number,
    constants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    totalNumBlocks: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ): Promise<void>;

  /**
   * Starts a new block.
   * @param blockNumber - The block number.
   * @param timestamp - The timestamp of the block.
   * @param totalNumTxs - The total number of txs in the block.
   */
  startNewBlock(blockNumber: BlockNumber, timestamp: UInt64, totalNumTxs: number): Promise<void>;

  /**
   * Kickstarts chonk verifier circuits for the specified txs. These will be used during epoch proving.
   * Note that if the chonk verifier circuits are not started this way, they will be started nonetheless after processing.
   */
  startChonkVerifierCircuits(txs: Tx[]): Promise<void>;

  /** Returns the block. */
  setBlockCompleted(blockNumber: BlockNumber, expectedBlockHeader?: BlockHeader): Promise<BlockHeader>;

  /** Pads the epoch with empty block roots if needed and blocks until proven. Throws if proving has failed. */
  finalizeEpoch(): Promise<{ publicInputs: RootRollupPublicInputs; proof: Proof; batchedBlobInputs: BatchedBlob }>;

  /** Cancels all proving jobs. */
  cancel(): void;

  /** Returns an identifier for the prover or zero if not set. */
  getProverId(): EthAddress;

  /** Called when no longer required, cleans up internal resources */
  stop(): Promise<void>;
}
