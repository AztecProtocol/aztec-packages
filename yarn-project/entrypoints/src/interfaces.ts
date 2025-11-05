import type { Fr } from '@aztec/foundation/fields';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import type { ExecutionPayload } from './payload.js';

/**
 * Information on the connected chain. Used by wallets when constructing transactions to protect against replay
 * attacks.
 */
export type ChainInfo = {
  /** The L1 chain id */
  chainId: Fr;
  /** The version of the rollup  */
  version: Fr;
};

/**
 * Creates transaction execution requests out of a set of function calls, a fee payment method and
 * general options for the transaction
 */
export interface EntrypointInterface {
  /**
   * Generates an execution request out of set of function calls.
   * @param exec - The execution intents to be run.
   * @param gasSettings - The gas settings for the transaction.
   * @param options - Miscellaneous tx options that enable/disable features of the entrypoint
   * @returns The authenticated transaction execution request.
   */
  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    options?: any,
  ): Promise<TxExecutionRequest>;
}

/** Creates authorization witnesses. */
export interface AuthWitnessProvider {
  /**
   * Computes an authentication witness from either a message hash
   * @param messageHash - The message hash to approve
   * @returns The authentication witness
   */
  createAuthWit(messageHash: Fr | Buffer): Promise<AuthWitness>;
}
