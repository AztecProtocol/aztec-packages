import type { Fr } from '@aztec/foundation/fields';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import type { ExecutionPayload } from './payload.js';

/**
 * General options for the tx execution.
 */
export type TxExecutionOptions = {
  /** Whether the transaction can be cancelled. */
  cancellable?: boolean;
  /**
   * A nonce to inject into the app payload of the transaction. When used with cancellable=true, this nonce will be
   * used to compute a nullifier that allows cancelling this transaction by submitting a new one with the same nonce
   * but higher fee. The nullifier ensures only one transaction can succeed.
   */
  txNonce?: Fr;
  /**
   * Account contracts usually support paying transaction fees using their own fee juice balance, which is configured
   * by setting this flag to true.
   */
  isFeePayer: boolean;
  /**
   * When paying transactions with fee juice, the account contract itself usually has to signal the end of the setup phase since
   * no other contract will do it. This is configurable independently of the previous flag because in the case of using
   * FeeJuiceWithClaim the account contract is the fee payer, but the end of the setup is handled by the FeeJuice contract.
   */
  endSetup: boolean;
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
   * @param options - Miscellaneous tx options that enable/disable features of the account contract
   * @returns The authenticated transaction execution request.
   */
  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    options: TxExecutionOptions,
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
