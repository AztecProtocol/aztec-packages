import { type Fr, type GlobalVariables, type Proof, type RootRollupPublicInputs } from '@aztec/circuits.js';

import { type L2Block } from '../l2_block.js';
import { type ProcessedTx } from '../tx/processed_tx.js';

export enum PROVING_STATUS {
  SUCCESS,
  FAILURE,
}

export type ProvingSuccess = {
  status: PROVING_STATUS.SUCCESS;
};

export type ProvingFailure = {
  status: PROVING_STATUS.FAILURE;
  reason: string;
};

export type ProvingResult = ProvingSuccess | ProvingFailure;

export type ProvingTicket = {
  provingPromise: Promise<ProvingResult>;
};

export type SimulationBlockResult = {
  block: L2Block;
};

export type ProvingBlockResult = SimulationBlockResult & {
  proof: Proof;
  aggregationObject: Fr[];
};

export type ProvingEpochResult = { publicInputs: RootRollupPublicInputs; proof: Proof };

/** Receives processed txs as part of block simulation or proving. */
export interface ProcessedTxHandler {
  /**
   * Add a processed transaction to the current block.
   * @param tx - The transaction to be added.
   */
  addNewTx(tx: ProcessedTx): Promise<void>;
}

/** The interface to a block simulator. Generates an L2 block out of a set of processed txs by calling into the Aztec circuits. */
export interface BlockSimulator extends ProcessedTxHandler {
  /**
   * Prepares to build a new block.
   * @param numTxs - The complete size of the block, must be a power of 2
   * @param globalVariables - The global variables for this block
   * @param l1ToL2Messages - The set of L1 to L2 messages to be included in this block
   */
  startNewBlock(numTxs: number, globalVariables: GlobalVariables, l1ToL2Messages: Fr[]): Promise<void>;

  /** Cancels the block currently being processed. Processes already in progress built may continue but further proofs should not be started. */
  cancel(): void;

  /** Performs the final archive tree insertion for this block and returns the L2Block. */
  getBlock(): Promise<SimulationBlockResult>;

  /**
   * Mark the block as having all the transactions it is going to contain.
   * Will pad the block to its complete size with empty transactions and prove all the way to the root rollup.
   */
  setBlockCompleted(): Promise<L2Block>;
}

/** The interface to a block prover. Generates a root rollup proof out of a set of processed txs by recursively proving Aztec circuits. */
export interface BlockProver extends BlockSimulator {
  /** Returns an identifier for the prover or zero if not set. */
  getProverId(): Fr;

  /** Performs the final archive tree insertion for this block and returns the L2Block. */
  getBlock(): Promise<ProvingBlockResult>;
}

export interface EpochProver extends BlockProver {
  startNewEpoch(epochNumber: number, totalNumBlocks: number): ProvingTicket;

  setEpochCompleted(): void;

  finaliseEpoch(): ProvingEpochResult;
}
