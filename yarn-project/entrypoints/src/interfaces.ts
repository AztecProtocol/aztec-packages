import type { Fr } from '@aztec/foundation/fields';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
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
};

/**
 * Creates transaction execution requests out of a set of function calls, a fee payment method and
 * general options for the transaction
 */
export interface EntrypointInterface {
  /**
   * Generates an execution request out of set of function calls.
   * @param exec - The execution intents to be run.
   * @param fee - The fee options for the transaction.
   * @param options - Transaction nonce and whether the transaction is cancellable.
   * @returns The authenticated transaction execution request.
   */
  createTxExecutionRequest(
    exec: ExecutionPayload,
    fee: FeeOptions,
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

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export interface FeePaymentMethod {
  /** The asset used to pay the fee. */
  getAsset(): Promise<AztecAddress>;
  /**
   * Returns the data to be added to the final execution request
   * to pay the fee in the given asset
   * @param gasSettings - The gas limits and max fees.
   * @returns The function calls to pay the fee.
   */
  getExecutionPayload(gasSettings: GasSettings): Promise<ExecutionPayload>;
  /**
   * The expected fee payer for this tx.
   * @param gasSettings - The gas limits and max fees.
   */
  getFeePayer(gasSettings: GasSettings): Promise<AztecAddress>;
}

/**
 * Fee payment options for a transaction.
 */
export type FeeOptions = {
  /** The fee payment method to use */
  paymentMethod: FeePaymentMethod;
  /** The gas settings */
  gasSettings: GasSettings;
};

// docs:start:user_fee_options
/** Fee options as set by a user. */
export type UserFeeOptions = {
  /** The fee payment method to use */
  paymentMethod?: FeePaymentMethod;
  /** The gas settings */
  gasSettings?: Partial<FieldsOf<GasSettings>>;
  /** Percentage to pad the base fee by, if empty, defaults to 0.5 */
  baseFeePadding?: number;
  /** Whether to run an initial simulation of the tx with high gas limit to figure out actual gas settings. */
  estimateGas?: boolean;
  /** Percentage to pad the estimated gas limits by, if empty, defaults to 0.1. Only relevant if estimateGas is set. */
  estimatedGasPadding?: number;
};
// docs:end:user_fee_options
