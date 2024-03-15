import { Fr, GlobalVariables, Proof } from '@aztec/circuits.js';

import { L2Block } from '../l2_block.js';
import { ProcessedTx } from '../tx/processed_tx.js';

/**
 * The interface to the prover client.
 * Provides the ability to generate proofs and build rollups.
 */
export interface ProverClient {
  start(): Promise<void>;

  stop(): Promise<void>;

  proveBlock(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    newModelL1ToL2Messages: Fr[], // TODO(#4492): Rename this when purging the old inbox
    newL1ToL2Messages: Fr[], // TODO(#4492): Nuke this when purging the old inbox
  ): Promise<[L2Block, Proof]>;
}
