import type { Fr } from '@aztec/foundation/fields';
import type { FieldsOf } from '@aztec/foundation/types';
import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { Capsule, HashedValues, TxExecutionRequest } from '@aztec/stdlib/tx';

export type UserExecutionRequest = {
  calls: FunctionCall[];
  authWitnesses?: AuthWitness[];
  capsules?: Capsule[];
  nonce?: Fr;
  cancellable?: boolean;
};

/** Represents data necessary to execute a list of function calls successfully */
export interface ExecutionPayload {
  /** The function calls to be executed. */
  calls: FunctionCall[];
  /** Any transient auth witnesses needed for this execution */
  authWitnesses: AuthWitness[];
  /** Data passed through an oracle for this execution. */
  capsules: Capsule[];
}

/* eslint-disable camelcase */
/** Encoded function call for an Aztec entrypoint */
export type EncodedFunctionCall = {
  /** Arguments hash for the call */
  args_hash: Fr;
  /** Selector of the function to call */
  function_selector: Fr;
  /** Address of the contract to call */
  target_address: Fr;
  /** Whether the function is public or private */
  is_public: boolean;
  /** Whether the function can alter state */
  is_static: boolean;
};
/* eslint-enable camelcase */

/** Represents the ExecutionPayload after encoding for the entrypint to execute */
export type EncodedExecutionPayload = Omit<ExecutionPayload, 'calls'> & {
  /** The function calls to be executed. */
  encodedFunctionCalls: EncodedFunctionCall[];
  /** Any transient hashed arguments for this execution */
  hashedArguments: HashedValues[];
};

/**
 * Represents a transaction execution request, complete with the encoded payload, a nonce
 * and whether the transaction can be cancelled.
 */
export type ExecutionRequestInit = EncodedExecutionPayload & {
  /** An optional nonce. Used to repeat a previous tx with a higher fee so that the first one is cancelled */
  nonce?: Fr;
  /** Whether the transaction can be cancelled. If true, an extra nullifier will be emitted: H(nonce, GENERATOR_INDEX__TX_NULLIFIER) */
  cancellable?: boolean;
};

/**
 * Completes a ExecutionRequest by including the fee payment method and gas settings.
 */
export type ExecutionRequest = ExecutionRequestInit & {
  /** How the fee is going to be payed */
  fee: FeeOptions;
};

/** Creates transaction execution requests out of a set of function calls. */
export interface EntrypointInterface {
  /**
   * Generates an execution request out of set of function calls.
   * @param execution - The execution intents to be run.
   * @returns The authenticated transaction execution request.
   */
  createTxExecutionRequest(exec: UserExecutionRequest, fee: FeeOptions): Promise<TxExecutionRequest>;
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
