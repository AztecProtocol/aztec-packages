import type { FieldsOf } from '@aztec/foundation/types';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { Capsule, OffchainEffect, SimulationStats } from '@aztec/stdlib/tx';

import type { FeePaymentMethod } from '../fee/fee_payment_method.js';
import type { ProfileOptions, SendOptions, SimulateOptions } from '../wallet/index.js';

/**
 * Options used to tweak the simulation and add gas estimation capabilities
 */
export type FeeEstimationOptions = {
  /** Whether to modify the fee settings of the simulation with high gas limit to figure out actual gas settings. */
  estimateGas?: boolean;
  /** Percentage to pad the estimated gas limits by, if empty, defaults to 0.1. Only relevant if estimateGas is set. */
  estimatedGasPadding?: number;
};

/**
 * Interactions allow configuring a custom fee payment method that gets bundled with the transaction before
 * sending it to the wallet
 */
export type FeePaymentMethodOption = {
  /** Fee payment method to embed in the interaction */
  paymentMethod?: FeePaymentMethod;
};

/**
 * User-defined partial gas settings for the interaction. This type is completely optional since
 * the wallet will fill in the missing options
 */
export type GasSettingsOption = {
  /** The gas settings */
  gasSettings?: Partial<FieldsOf<GasSettings>>;
};

/** Fee options as set by a user. */
export type InteractionFeeOptions = GasSettingsOption & FeePaymentMethodOption;

/**  Fee options that can be set for simulation *only* */
export type SimulationInteractionFeeOptions = InteractionFeeOptions & FeeEstimationOptions;

/**
 * Represents the options to configure a request from a contract interaction.
 * Allows specifying additional auth witnesses and capsules to use during execution
 */
export type RequestInteractionOptions = {
  /** Extra authwits to use during execution */
  authWitnesses?: AuthWitness[];
  /** Extra capsules to use during execution */
  capsules?: Capsule[];
  /** Fee payment method to embed in the interaction request */
  fee?: FeePaymentMethodOption;
};

/**
 * Represents options for calling a (constrained) function in a contract.
 */
export type SendInteractionOptions = RequestInteractionOptions & {
  /** The sender's Aztec address. */
  from: AztecAddress;
  /** The fee options for the transaction. */
  fee?: InteractionFeeOptions;
};

/**
 * Represents the options for simulating a contract function interaction.
 * Allows specifying the address from which the method should be called.
 * Disregarded for simulation of public functions
 */
export type SimulateInteractionOptions = Omit<SendInteractionOptions, 'fee'> & {
  /** The fee options for the transaction. */
  fee?: SimulationInteractionFeeOptions;
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
export type ProfileInteractionOptions = SimulateInteractionOptions & {
  /** Whether to return gates information or the bytecode/witnesses. */
  profileMode: 'gates' | 'execution-steps' | 'full';
  /** Whether to generate a ClientIVC proof or not */
  skipProofGeneration?: boolean;
};

/**
 * Represents the result type of a simulation.
 * By default, it will just be the return value of the simulated function
 * If `includeMetadata` is set to true in `SimulateInteractionOptions` on the input of `simulate(...)`,
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

/**
 * Transforms and cleans up the higher level SendInteractionOptions defined by the interaction into
 * SendOptions, which are the ones that can be serialized and forwarded to the wallet
 */
export async function toSendOptions(options: SendInteractionOptions): Promise<SendOptions> {
  return {
    ...options,
    fee: {
      // If this interaction includes a fee payment method, pass the fee payer
      // as a hint to the wallet
      embeddedPaymentMethodFeePayer: await options.fee?.paymentMethod?.getFeePayer(),
      // If a payment method that includes gas settings was used,
      // try to reuse as much as possible while still allowing
      // manual override. CAREFUL: this can cause mismatches during proving
      gasSettings: {
        ...options.fee?.paymentMethod?.getGasSettings(),
        ...options.fee?.gasSettings,
      },
    },
  };
}

/**
 * Transforms and cleans up the higher level SimulateInteractionOptions defined by the interaction into
 * SimulateOptions, which are the ones that can be serialized and forwarded to the wallet
 */
export async function toSimulateOptions(options: SimulateInteractionOptions): Promise<SimulateOptions> {
  return {
    ...options,
    fee: {
      // If this interaction includes a fee payment method, pass the fee payer
      // as a hint to the wallet
      embeddedPaymentMethodFeePayer: await options.fee?.paymentMethod?.getFeePayer(),
      // If a payment method that includes gas settings was used,
      // try to reuse as much as possible while still allowing
      // manual override. CAREFUL: this can cause mismatches during proving
      gasSettings: {
        ...options.fee?.paymentMethod?.getGasSettings(),
        ...options.fee?.gasSettings,
      },
      estimateGas: options.fee?.estimateGas,
      estimatedGasPadding: options.fee?.estimatedGasPadding,
    },
  };
}

/**
 * Transforms and cleans up the higher level ProfileInteractionOptions defined by the interaction into
 * ProfileOptions, which are the ones that can be serialized and forwarded to the wallet
 */
export async function toProfileOptions(options: ProfileInteractionOptions): Promise<ProfileOptions> {
  return {
    ...(await toSimulateOptions(options)),
    profileMode: options.profileMode,
    skipProofGeneration: options.skipProofGeneration,
  };
}
