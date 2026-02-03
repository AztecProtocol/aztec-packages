import { Fr } from '@aztec/foundation/curves/bn254';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { ExecutionPayload, TxExecutionRequest } from '@aztec/stdlib/tx';

import { z } from 'zod';

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
 * Zod schema for ChainInfo
 */
export const ChainInfoSchema = z.object({
  chainId: Fr.schema,
  version: Fr.schema,
});

/**
 * Creates transaction execution requests out of a set of function calls, a fee payment method and
 * general options for the transaction
 */
export interface EntrypointInterface {
  /**
   * Generates an execution request out of set of function calls.
   * @param exec - The execution intents to be run.
   * @param gasSettings - The gas settings for the transaction.
   * @param chainInfo - Chain information (chainId and version) for replay protection.
   * @param options - Miscellaneous tx options that enable/disable features of the entrypoint
   * @returns The authenticated transaction execution request.
   */
  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    chainInfo: ChainInfo,
    options?: any,
  ): Promise<TxExecutionRequest>;

  /**
   * Wraps an execution payload such that it is executed *via* this entrypoint.
   * This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload.
   * Useful for account self-funding deployments and batching calls beyond the limit
   * of a single entrypoint call.
   *
   * @param exec - The execution payload to wrap
   * @param options - Implementation-specific options
   * @returns A new execution payload with a single call to this entrypoint
   * @throws Error if the payload cannot be wrapped (e.g., exceeds call limit)
   */
  wrapExecutionPayload(exec: ExecutionPayload, options?: any): Promise<ExecutionPayload>;
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
