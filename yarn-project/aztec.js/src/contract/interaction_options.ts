import type { SimulationUserFeeOptions, UserFeeOptions } from '@aztec/entrypoints/interfaces';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { Capsule, OffchainEffect, SimulationStats } from '@aztec/stdlib/tx';

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
export type SimulateMethodOptions = Omit<SendMethodOptions, 'fee'> & {
  /** The fee options for the transaction. */
  fee?: SimulationUserFeeOptions;
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
export type ProfileMethodOptions = SimulateMethodOptions & {
  /** Whether to return gates information or the bytecode/witnesses. */
  profileMode: 'gates' | 'execution-steps' | 'full';
  /** Whether to generate a ClientIVC proof or not */
  skipProofGeneration?: boolean;
};

/**
 * Represents the result type of a simulation.
 * By default, it will just be the return value of the simulated function
 * If `includeMetadata` is set to true in `SimulateMethodOptions` on the input of `simulate(...)`,
 * it will provide extra information.
 */
export type SimulationReturn<T extends boolean | undefined> = T extends true
  ? {
      /** Additional stats about the simulation */
      stats: SimulationStats;
      /** Offchain effects generated during the simulation */
      offchainEffects: OffchainEffect[];
      /**  Return value of the function */
      result: any;
      /** Gas estimation results */
      estimatedGas: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>;
    }
  : any;
