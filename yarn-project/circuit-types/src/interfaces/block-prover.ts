import { Fr, GlobalVariables, Proof } from '@aztec/circuits.js';

import { L2Block } from '../l2_block.js';
import { ProcessedTx } from '../tx/processed_tx.js';

export enum PROVING_STATUS {
  SUCCESS,
  FAILURE,
}

export type ProvingResult = {
  status: PROVING_STATUS;
  block: L2Block;
  proof: Proof;
};

export type ProvingTicket = {
  provingPromise: Promise<ProvingResult>;
};

/**
 * The interface to the block prover.
 * Provides the ability to generate proofs and build rollups.
 */
export interface BlockProver {
  startNewBlock(
    numTxs: number,
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    emptyTx: ProcessedTx,
  ): Promise<ProvingTicket>;

  addNewTx(tx: ProcessedTx): Promise<void>;
}
