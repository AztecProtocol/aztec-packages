import type { UserFeeOptions } from '@aztec/entrypoints/interfaces';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Capsule } from '@aztec/stdlib/tx';

/**
 * Represents the options to configure a request from a contract interaction.
 * Allows specifying additional auth witnesses and capsules to use during execution
 */
export type RequestMethodOptions = {
  /** Extra authwits to use during execution */
  authWitnesses?: AuthWitness[];
  /** Extra capsules to use during execution */
  capsules?: Capsule[];
};

/**
 * Represents options for calling a (constrained) function in a contract.
 */
export type SendMethodOptions = RequestMethodOptions & {
  /** The sender's Aztec address. */
  from: AztecAddress;
  /** The fee options for the transaction. */
  fee?: UserFeeOptions;
};

/**
 * Represents the options for simulating a contract function interaction.
 * Allows specifying the address from which the method should be called.
 * Disregarded for simulation of public functions
 */
export type SimulateMethodOptions = Pick<SendMethodOptions, 'from' | 'authWitnesses' | 'capsules' | 'fee'> & {
  /** Simulate without checking for the validity of the resulting transaction, e.g. whether it emits any existing nullifiers. */
  skipTxValidation?: boolean;
  /** Whether to ensure the fee payer is not empty and has enough balance to pay for the fee. */
  skipFeeEnforcement?: boolean;
  /** Whether to include metadata such as offchain effects and performance statistics (e.g. timing information of the different circuits and oracles) in
   * the simulation result, instead of just the return value of the function */
  includeMetadata?: boolean;
};

/**
 * Represents the options for profiling an interaction.
 */
// docs:start:profile-method-options
export type ProfileMethodOptions = SimulateMethodOptions & {
  /** Whether to return gates information or the bytecode/witnesses. */
  profileMode: 'gates' | 'execution-steps' | 'full';
  /** Whether to generate a ClientIVC proof or not */
  skipProofGeneration?: boolean;
};
// docs:end:profile-method-options
