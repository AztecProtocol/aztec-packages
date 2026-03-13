import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import {
  type Capsule,
  OFFCHAIN_MESSAGE_IDENTIFIER,
  type OffchainEffect,
  type SimulationStats,
  type TxHash,
  type TxReceipt,
} from '@aztec/stdlib/tx';

import type { FeePaymentMethod } from '../fee/fee_payment_method.js';
import type { ProfileOptions, SendOptions, SimulateOptions } from '../wallet/index.js';
import type { WaitOpts } from './wait_opts.js';

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
 * Constant for explicitly not waiting for transaction confirmation.
 * We use this instead of false to avoid confusion with falsy checks.
 */
export const NO_WAIT = 'NO_WAIT' as const;

/**
 * Type for the NO_WAIT constant.
 */
export type NoWait = typeof NO_WAIT;

/**
 * Type for wait options in interactions.
 * - NO_WAIT symbol: Don't wait for confirmation, return TxHash immediately
 * - WaitOpts object: Wait with custom options and return receipt/result
 * - undefined: Wait with default options and return receipt/result
 */
export type InteractionWaitOptions = NoWait | WaitOpts | undefined;

/**
 * Base options for calling a (constrained) function in a contract, without wait parameter.
 */
export type SendInteractionOptionsWithoutWait = RequestInteractionOptions & {
  /** The sender's Aztec address. */
  from: AztecAddress;
  /** The fee options for the transaction. */
  fee?: InteractionFeeOptions;
  /**
   * Additional addresses whose private state and keys should be accessible during execution,
   * beyond the sender's. Required when the transaction needs to access private state or keys
   * belonging to an address other than `from`, e.g. withdrawing from an escrow that holds
   * its own private notes.
   */
  additionalScopes?: AztecAddress[];
};

/**
 * Represents options for calling a (constrained) function in a contract.
 */
export type SendInteractionOptions<W extends InteractionWaitOptions = undefined> = SendInteractionOptionsWithoutWait & {
  /**
   * Whether to wait for the transaction to be mined.
   * - undefined (default): wait with default options and return TxReceipt
   * - WaitOpts object: wait with custom options and return TxReceipt
   * - NO_WAIT: return txHash immediately without waiting
   */
  wait?: W;
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
  /** Whether to include metadata such as performance statistics (e.g. timing information of the different circuits and oracles) and gas estimation
   * in the simulation result, in addition to the return value and offchain effects */
  includeMetadata?: boolean;
};

/**
 * Represents the options for profiling an interaction.
 */
export type ProfileInteractionOptions = SimulateInteractionOptions & {
  /** Whether to return gates information or the bytecode/witnesses. */
  profileMode: 'gates' | 'execution-steps' | 'full';
  /** Whether to generate a Chonk proof or not */
  skipProofGeneration?: boolean;
};

/** A message emitted during execution or proving, to be delivered offchain. */
export type OffchainMessage = {
  /** The intended recipient of the message. */
  recipient: AztecAddress;
  /** The message payload (typically encrypted). */
  payload: Fr[];
  /** The contract that emitted the message. */
  contractAddress: AztecAddress;
  /** Anchor block timestamp at message emission. */
  anchorBlockTimestamp: bigint;
};

/** Groups all unproven outputs from private execution that are returned to the client. */
export type OffchainOutput = {
  /** Raw offchain effects emitted during execution. */
  offchainEffects: OffchainEffect[];
  /** Messages emitted during execution, to be delivered offchain. */
  offchainMessages: OffchainMessage[];
};

/**
 * Splits an array of offchain effects into decoded offchain messages and remaining effects.
 * Effects whose data starts with `OFFCHAIN_MESSAGE_IDENTIFIER` are parsed as messages and removed
 * from the effects array.
 */
export function extractOffchainOutput(effects: OffchainEffect[], anchorBlockTimestamp: bigint): OffchainOutput {
  const offchainEffects: OffchainEffect[] = [];
  const offchainMessages: OffchainMessage[] = [];

  for (const effect of effects) {
    if (effect.data.length >= 2 && effect.data[0].equals(OFFCHAIN_MESSAGE_IDENTIFIER)) {
      offchainMessages.push({
        recipient: AztecAddress.fromField(effect.data[1]),
        payload: effect.data.slice(2),
        contractAddress: effect.contractAddress,
        anchorBlockTimestamp,
      });
    } else {
      offchainEffects.push(effect);
    }
  }

  return { offchainEffects, offchainMessages };
}

/**
 * Represents the result of a simulation.
 * Always includes the return value and offchain output.
 * When `includeMetadata` or `fee.estimateGas` is set, also includes stats and gas estimation.
 */
export type SimulationResult = {
  /** Return value of the function */
  result: any;
  /** Additional stats about the simulation. Present when `includeMetadata` is set. */
  stats?: SimulationStats;
  /** Gas estimation results. Present when `includeMetadata` or `fee.estimateGas` is set. */
  estimatedGas?: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>;
} & OffchainOutput;

/** Result of sendTx when not waiting for mining. */
export type TxSendResultImmediate = {
  /** The hash of the sent transaction. */
  txHash: TxHash;
} & OffchainOutput;

/** Result of sendTx when waiting for mining. */
export type TxSendResultMined<TReturn = TxReceipt> = {
  /** The transaction receipt. */
  receipt: TReturn;
} & OffchainOutput;

/**
 * Represents the result type of sending a transaction.
 * If `wait` is NO_WAIT, returns TxSendResultImmediate.
 * Otherwise returns TxSendResultMined.
 */
export type SendReturn<T extends InteractionWaitOptions, TReturn = TxReceipt> = T extends NoWait
  ? TxSendResultImmediate
  : TxSendResultMined<TReturn>;

/**
 * Transforms and cleans up the higher level SendInteractionOptions defined by the interaction into
 * SendOptions, which are the ones that can be serialized and forwarded to the wallet
 * @param options - The send interaction options with optional wait parameter
 * @returns The send options to forward to the wallet
 */
export function toSendOptions<W extends InteractionWaitOptions = undefined>(
  options: SendInteractionOptions<W>,
): SendOptions<W> {
  return {
    ...options,
    fee: {
      // If a payment method that includes gas settings was used,
      // try to reuse as much as possible while still allowing
      // manual override. CAREFUL: this can cause mismatches during proving
      gasSettings: {
        ...options.fee?.paymentMethod?.getGasSettings(),
        ...options.fee?.gasSettings,
      },
    },
    wait: options.wait, // Pass through wait option
  };
}

/**
 * Transforms and cleans up the higher level SimulateInteractionOptions defined by the interaction into
 * SimulateOptions, which are the ones that can be serialized and forwarded to the wallet
 */
export function toSimulateOptions(options: SimulateInteractionOptions): SimulateOptions {
  return {
    ...options,
    fee: {
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
export function toProfileOptions(options: ProfileInteractionOptions): ProfileOptions {
  return {
    ...toSimulateOptions(options),
    profileMode: options.profileMode,
    skipProofGeneration: options.skipProofGeneration,
  };
}
