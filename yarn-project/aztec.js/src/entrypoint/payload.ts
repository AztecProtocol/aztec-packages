import { FunctionCall, HashedValues } from '@aztec/circuit-types';
import { type AztecAddress, Fr, type GasSettings, GeneratorIndex } from '@aztec/circuits.js';
import { FunctionType } from '@aztec/foundation/abi';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { type Tuple } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { type FeePaymentMethod } from '../fee/fee_payment_method.js';

/**
 * Fee payment options for a transaction.
 */
export type FeeOptions = {
  /** The fee payment method to use */
  paymentMethod: FeePaymentMethod;
  /** The gas settings */
  gasSettings: GasSettings;
};

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

// These must match the values defined in:
// - noir-projects/aztec-nr/aztec/src/entrypoint/app.nr
const APP_MAX_CALLS = 4;
// - and noir-projects/aztec-nr/aztec/src/entrypoint/fee.nr
const FEE_MAX_CALLS = 2;

/* eslint-disable camelcase */
/** Encoded function call for account contract entrypoint */
type EncodedFunctionCall = {
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

/** Assembles an entrypoint payload */
export abstract class EntrypointPayload {
  protected constructor(
    private functionCalls: EncodedFunctionCall[],
    private _hashedArguments: HashedValues[],
    private generatorIndex: number,
    private _nonce: Fr,
  ) {}

  protected static async create(functionCalls: FunctionCall[]) {
    const hashedArguments: HashedValues[] = [];
    for (const call of functionCalls) {
      hashedArguments.push(await HashedValues.fromValues(call.args));
    }

    /* eslint-disable camelcase */
    const encodedFunctionCalls = functionCalls.map((call, index) => ({
      args_hash: hashedArguments[index].hash,
      function_selector: call.selector.toField(),
      target_address: call.to.toField(),
      is_public: call.type == FunctionType.PUBLIC,
      is_static: call.isStatic,
    }));
    /* eslint-enable camelcase */

    return {
      encodedFunctionCalls,
      hashedArguments,
    };
  }

  /* eslint-disable camelcase */
  /**
   * The function calls to execute. This uses snake_case naming so that it is compatible with Noir encoding
   * @internal
   */
  get function_calls() {
    return this.functionCalls;
  }
  /* eslint-enable camelcase */

  /**
   * The nonce
   * @internal
   */
  get nonce() {
    return this._nonce;
  }

  /**
   * The hashed arguments for the function calls
   */
  get hashedArguments() {
    return this._hashedArguments;
  }

  /**
   * Serializes the payload to an array of fields
   * @returns The fields of the payload
   */
  abstract toFields(): Fr[];

  /**
   * Hashes the payload
   * @returns The hash of the payload
   */
  hash() {
    return poseidon2HashWithSeparator(this.toFields(), this.generatorIndex);
  }

  /** Serializes the function calls to an array of fields. */
  protected functionCallsToFields() {
    return this.functionCalls.flatMap(call => [
      call.args_hash,
      call.function_selector,
      call.target_address,
      new Fr(call.is_public),
      new Fr(call.is_static),
    ]);
  }

  /**
   * Creates an execution payload for a dapp from a set of function calls
   * @param functionCalls - The function calls to execute
   * @returns The execution payload
   */
  static async fromFunctionCalls(functionCalls: FunctionCall[]) {
    const { encodedFunctionCalls, hashedArguments } = await this.create(functionCalls);
    return new AppEntrypointPayload(encodedFunctionCalls, hashedArguments, 0, Fr.random());
  }

  /**
   * Creates an execution payload for the app-portion of a transaction from a set of function calls
   * @param functionCalls - The function calls to execute
   * @param nonce - The nonce for the payload, used to emit a nullifier identifying the call
   * @returns The execution payload
   */
  static async fromAppExecution(functionCalls: FunctionCall[] | Tuple<FunctionCall, 4>, nonce = Fr.random()) {
    if (functionCalls.length > APP_MAX_CALLS) {
      throw new Error(`Expected at most ${APP_MAX_CALLS} function calls, got ${functionCalls.length}`);
    }
    const paddedCalls = padArrayEnd(functionCalls, FunctionCall.empty(), APP_MAX_CALLS);
    const { encodedFunctionCalls, hashedArguments } = await this.create(paddedCalls);
    return new AppEntrypointPayload(encodedFunctionCalls, hashedArguments, GeneratorIndex.SIGNATURE_PAYLOAD, nonce);
  }

  /**
   * Creates an execution payload to pay the fee for a transaction
   * @param sender - The address sending this payload
   * @param feeOpts - The fee payment options
   * @returns The execution payload
   */
  static async fromFeeOptions(sender: AztecAddress, feeOpts?: FeeOptions) {
    const calls = (await feeOpts?.paymentMethod.getFunctionCalls(feeOpts?.gasSettings)) ?? [];
    const feePayer = await feeOpts?.paymentMethod.getFeePayer(feeOpts?.gasSettings);
    const isFeePayer = !!feePayer && feePayer.equals(sender);
    const paddedCalls = padArrayEnd(calls, FunctionCall.empty(), FEE_MAX_CALLS);
    const { encodedFunctionCalls, hashedArguments } = await this.create(paddedCalls);
    return new FeeEntrypointPayload(
      encodedFunctionCalls,
      hashedArguments,
      GeneratorIndex.FEE_PAYLOAD,
      Fr.random(),
      isFeePayer,
    );
  }
}

/** Entrypoint payload for app phase execution. */
class AppEntrypointPayload extends EntrypointPayload {
  override toFields(): Fr[] {
    return [...this.functionCallsToFields(), this.nonce];
  }
}

/** Entrypoint payload for fee payment to be run during setup phase. */
class FeeEntrypointPayload extends EntrypointPayload {
  #isFeePayer: boolean;

  constructor(
    functionCalls: EncodedFunctionCall[],
    hashedArguments: HashedValues[],
    generatorIndex: number,
    nonce: Fr,
    isFeePayer: boolean,
  ) {
    super(functionCalls, hashedArguments, generatorIndex, nonce);
    this.#isFeePayer = isFeePayer;
  }

  override toFields(): Fr[] {
    return [...this.functionCallsToFields(), this.nonce, new Fr(this.#isFeePayer)];
  }

  /* eslint-disable camelcase */
  /** Whether the sender should be appointed as fee payer. */
  get is_fee_payer() {
    return this.#isFeePayer;
  }
  /* eslint-enable camelcase */
}

/**
 * Computes a hash of a combined payload.
 * @param appPayload - An app payload.
 * @param feePayload - A fee payload.
 * @returns A hash of a combined payload.
 */
export async function computeCombinedPayloadHash(
  appPayload: AppEntrypointPayload,
  feePayload: FeeEntrypointPayload,
): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [await appPayload.hash(), await feePayload.hash()],
    GeneratorIndex.COMBINED_PAYLOAD,
  );
}
