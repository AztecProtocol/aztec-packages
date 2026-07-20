import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings, GasUsed, ManaUsageEstimate } from '@aztec/stdlib/gas';
import {
  type Capsule,
  OFFCHAIN_MESSAGE_IDENTIFIER,
  type OffchainEffect,
  type SimulationOverrides,
  type SimulationStats,
  type TxHash,
  type TxReceipt,
} from '@aztec/stdlib/tx';

import type { FeePaymentMethod } from '../fee/fee_payment_method.js';
import type { ProfileOptions, SendOptions, SimulateOptions } from '../wallet/index.js';
import type { WaitOpts } from './wait_opts.js';

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
  /**
   * Assumed network congestion level for fee prediction. Controls how aggressively the wallet
   * estimates future fees: None assumes empty blocks, Target assumes steady-state usage,
   * and Limit assumes blocks at maximum capacity. Higher estimates produce higher fee predictions,
   * reducing the risk of underpriced transactions during congestion spikes.
   * Defaults to Limit (worst case) when not specified.
   */
  congestionEstimate?: ManaUsageEstimate;
};

/** Fee options as set by a user. */
export type InteractionFeeOptions = GasSettingsOption & FeePaymentMethodOption;

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
 * Constant for explicitly opting out of account contract mediation.
 * When used as the `from` parameter, the wallet executes the payload directly
 * via the DefaultEntrypoint without wrapping it in an account contract entrypoint.
 * The app is responsible for assembling the complete execution payload, including
 * any entrypoint wrapping (e.g. multicall) if needed. This will result in the
 * first call of the chain receiving msg_sender as Option::none
 */
export const NO_FROM = 'NO_FROM' as const;

/**
 * Type for the NO_FROM constant.
 */
export type NoFrom = typeof NO_FROM;

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
  /** The sender's Aztec address, or NO_FROM to execute without account contract mediation. */
  from: AztecAddress | NoFrom;
  /** The fee options for the transaction. */
  fee?: InteractionFeeOptions;
  /**
   * Additional addresses whose private state and keys should be accessible during execution,
   * beyond the sender's. Required when the transaction needs to access private state or keys
   * belonging to an address other than `from`, e.g. withdrawing from an escrow that holds
   * its own private notes.
   */
  additionalScopes?: AztecAddress[];
  /**
   * Overrides the sender address used to derive discovery tags for private messages (notes, events, logs).
   * Recipients use these tags to find messages addressed to them.
   *
   * Defaults to `from`. Typically set when `from === NO_FROM`, since there is no account address to derive tags from.
   */
  sendMessagesAs?: AztecAddress;
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
  fee?: InteractionFeeOptions;
  /** Simulate without checking for the validity of the resulting transaction, e.g. whether it emits any existing nullifiers. */
  skipTxValidation?: boolean;
  /** Whether to ensure the fee payer is not empty and has enough balance to pay for the fee. */
  skipFeeEnforcement?: boolean;
  /** Whether to include metadata such as performance statistics (e.g. timing information of the different circuits and oracles) and simulated gas usage
   * in the simulation result, in addition to the return value and offchain effects */
  includeMetadata?: boolean;
  /** Pre-simulation overrides applied to the ephemeral fork and contract DB (publicStorage writes, contract instance overrides). */
  overrides?: SimulationOverrides;
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
        recipient: AztecAddress.fromFieldUnsafe(effect.data[1]),
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
 * When `includeMetadata` is set, also includes stats and the simulated gas usage.
 */
export type SimulationResult = {
  /** Return value of the function */
  result: any;
  /** Additional stats about the simulation. Present when `includeMetadata` is set. */
  stats?: SimulationStats;
  /**
   * Raw gas consumed by the simulated transaction. Present when `includeMetadata` is set. Apps that want to
   * declare explicit gas limits should derive their own from this (e.g. pad `totalGas`) and pass them via the
   * fee options; otherwise the wallet fills in the network's per-tx admission limits automatically.
   */
  gasUsed?: GasUsed;
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
      congestionEstimate: options.fee?.congestionEstimate,
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
      congestionEstimate: options.fee?.congestionEstimate,
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
