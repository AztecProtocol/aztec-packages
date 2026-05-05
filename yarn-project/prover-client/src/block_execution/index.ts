import type { PublicProcessorFactory } from '@aztec/simulator/server';

import type { TxFetcher } from './block_execution_handler.js';

export { BlockExecutionHandler, type TxFetcher } from './block_execution_handler.js';
export { CompositeServerCircuitProver } from './composite_circuit_prover.js';

/**
 * Optional dependencies the prover-client needs to run BLOCK_EXECUTION jobs in its
 * agents. When provided, every agent the prover-client spins up gets a composite
 * `ServerCircuitProver` that handles BLOCK_EXECUTION via a `BlockExecutionHandler`
 * and routes everything else to the regular proving prover.
 */
export type ProverClientBlockExecutionDeps = {
  publicProcessorFactory: PublicProcessorFactory;
  txFetcher: TxFetcher;
};
