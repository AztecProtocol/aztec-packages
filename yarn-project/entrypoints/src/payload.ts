import { GeneratorIndex } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { FunctionCall, FunctionType } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Capsule, HashedValues } from '@aztec/stdlib/tx';

import type { EncodedExecutionPayload, EncodedFunctionCall, FeeOptions } from './interfaces.js';

// These must match the values defined in:
// - noir-projects/aztec-nr/aztec/src/entrypoint/app.nr
const APP_MAX_CALLS = 4;
// - and noir-projects/aztec-nr/aztec/src/entrypoint/fee.nr
const FEE_MAX_CALLS = 2;

/** Assembles an entrypoint payload */
export abstract class EntrypointPayload implements EncodedExecutionPayload {
  protected constructor(
    public encodedFunctionCalls: EncodedFunctionCall[],
    public hashedArguments: HashedValues[],
    public authWitnesses: AuthWitness[],
    public capsules: Capsule[],
    private generatorIndex: number,
  ) {}

  protected static async create(
    calls: FunctionCall[],
  ): Promise<Omit<EncodedExecutionPayload, 'authWitnesses' | 'capsules'>> {
    const hashedArguments: HashedValues[] = [];
    for (const call of calls) {
      hashedArguments.push(await HashedValues.fromValues(call.args));
    }

    /* eslint-disable camelcase */
    const encodedFunctionCalls: EncodedFunctionCall[] = calls.map((call, index) => ({
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
    return this.encodedFunctionCalls.flatMap(call => [
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
    return new AppEntrypointPayload(encodedFunctionCalls, hashedArguments, [], [], 0);
  }

  /**
   * Creates an execution payload for the app-portion of a transaction from a set of function calls
   * @param functionCalls - The function calls to execute
   * @param nonce - The nonce for the payload, used to emit a nullifier identifying the call
   * @returns The execution payload
   */
  static async fromAppExecution(functionCalls: FunctionCall[] | Tuple<FunctionCall, 4>) {
    if (functionCalls.length > APP_MAX_CALLS) {
      throw new Error(`Expected at most ${APP_MAX_CALLS} function calls, got ${functionCalls.length}`);
    }
    const paddedCalls = padArrayEnd(functionCalls, FunctionCall.empty(), APP_MAX_CALLS);
    const { encodedFunctionCalls, hashedArguments } = await this.create(paddedCalls);
    return new AppEntrypointPayload(encodedFunctionCalls, hashedArguments, [], [], GeneratorIndex.SIGNATURE_PAYLOAD);
  }

  /**
   * Creates an execution payload to pay the fee for a transaction
   * @param sender - The address sending this payload
   * @param feeOpts - The fee payment options
   * @returns The execution payload
   */
  static async fromFeeOptions(sender: AztecAddress, feeOpts?: FeeOptions) {
    const { calls, authWitnesses } = (await feeOpts?.paymentMethod.getExecutionPayload(feeOpts?.gasSettings)) ?? {
      calls: [],
      authWitnesses: [],
    };
    const feePayer = await feeOpts?.paymentMethod.getFeePayer(feeOpts?.gasSettings);
    const isFeePayer = !!feePayer && feePayer.equals(sender);
    const paddedCalls = padArrayEnd(calls, FunctionCall.empty(), FEE_MAX_CALLS);
    const { encodedFunctionCalls, hashedArguments } = await this.create(paddedCalls);
    return new FeeEntrypointPayload(
      encodedFunctionCalls,
      hashedArguments,
      authWitnesses ?? [],
      GeneratorIndex.FEE_PAYLOAD,
      isFeePayer,
    );
  }
}

/** Entrypoint payload for app phase execution. */
export class AppEntrypointPayload extends EntrypointPayload {
  override toFields(): Fr[] {
    return [...this.functionCallsToFields()];
  }
}

/** Entrypoint payload for fee payment to be run during setup phase. */
export class FeeEntrypointPayload extends EntrypointPayload {
  #isFeePayer: boolean;

  constructor(
    functionCalls: EncodedFunctionCall[],
    hashedArguments: HashedValues[],
    authWitnesses: AuthWitness[],
    generatorIndex: number,
    isFeePayer: boolean,
  ) {
    super(functionCalls, hashedArguments, authWitnesses, [], generatorIndex);
    this.#isFeePayer = isFeePayer;
  }

  override toFields(): Fr[] {
    return [...this.functionCallsToFields(), new Fr(this.#isFeePayer)];
  }

  /* eslint-disable camelcase */
  /** Whether the sender should be appointed as fee payer. */
  get is_fee_payer() {
    return this.#isFeePayer;
  }
  /* eslint-enable camelcase */
}
