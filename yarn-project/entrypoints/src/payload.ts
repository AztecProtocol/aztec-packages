import { GeneratorIndex } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import {
  type FunctionArtifact,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  encodeArguments,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Capsule, HashedValues } from '@aztec/stdlib/tx';

import type { AuthWitnessProvider, EncodedFunctionCall, FeeOptions } from './interfaces.js';

// These must match the values defined in:
// - noir-projects/aztec-nr/aztec/src/entrypoint/app.nr
const APP_MAX_CALLS = 4;
// - and noir-projects/aztec-nr/aztec/src/entrypoint/fee.nr
const FEE_MAX_CALLS = 2;

/** Represents data necessary to execute a list of function calls successfully */
export class ExecutionPayload {
  public constructor(
    /** The function calls to be executed. */
    public calls: FunctionCall[],
    /** Any transient auth witnesses needed for this execution */
    public authWitnesses: AuthWitness[],
    /** Data passed through an oracle for this execution. */
    public capsules: Capsule[],
    /* Extra hashed values to be injected in the execution cache */
    public extraHashedValues: HashedValues[] = [],
  ) {}

  static empty() {
    return new ExecutionPayload([], [], []);
  }

  /**
   * Encodes the payload for execution, following Noir's convention
   */
  public async encode(): Promise<EncodedExecutionPayload> {
    const hashedArguments: HashedValues[] = [];
    for (const call of this.calls) {
      hashedArguments.push(await HashedValues.fromValues(call.args));
    }

    /* eslint-disable camelcase */
    const encodedFunctionCalls: EncodedFunctionCall[] = this.calls.map((call, index) => ({
      args_hash: hashedArguments[index].hash,
      function_selector: call.selector.toField(),
      target_address: call.to.toField(),
      is_public: call.type == FunctionType.PUBLIC,
      is_static: call.isStatic,
    }));

    return {
      encodedFunctionCalls,
      hashedArguments: [...hashedArguments, ...this.extraHashedValues],
      authWitnesses: this.authWitnesses,
      capsules: this.capsules,
      function_calls: encodedFunctionCalls,
    };
    /* eslint-enable camelcase */
  }
}

/**
 * Representation of the encoded payload for execution
 */
export type EncodedExecutionPayload = Omit<ExecutionPayload, 'calls' | 'encode' | 'extraHashedValues'> & {
  /** Function calls in the expected format (Noir's convention) */
  encodedFunctionCalls: EncodedFunctionCall[];
  /** The hashed args for the call, ready to be injected in the execution cache */
  hashedArguments: HashedValues[];
  /* eslint-disable camelcase */
  /**
   * The function calls to execute. This uses snake_case naming so that it is compatible with Noir encoding
   * */
  get function_calls(): EncodedFunctionCall[];
  /* eslint-enable camelcase */
};

/** Represents the ExecutionPayload after encoding for the entrypint to execute */
export abstract class EncodedExecutionPayloadForEntrypoint implements EncodedExecutionPayload {
  constructor(
    /** Function calls in the expected format (Noir's convention) */
    public encodedFunctionCalls: EncodedFunctionCall[],
    /** The hashed args for the call, ready to be injected in the execution cache */
    public hashedArguments: HashedValues[],
    /** Any transient auth witnesses needed for this execution */
    public authWitnesses: AuthWitness[],
    /** Data passed through an oracle for this execution. */
    public capsules: Capsule[],
    /** The index of the generator to use for hashing */
    public generatorIndex: number,
    /** The nonce for the payload, used to emit a nullifier identifying the call */
    public nonce: Fr,
  ) {}

  /* eslint-disable camelcase */
  /**
   * The function calls to execute. This uses snake_case naming so that it is compatible with Noir encoding
   * @internal
   */
  get function_calls() {
    return this.encodedFunctionCalls;
  }
  /* eslint-enable camelcase */

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
    const encoded = await new ExecutionPayload(functionCalls, [], []).encode();
    return new EncodedAppEntrypointPayload(
      encoded.encodedFunctionCalls,
      encoded.hashedArguments,
      [],
      [],
      0,
      Fr.random(),
    );
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
    const encoded = await new ExecutionPayload(paddedCalls, [], []).encode();
    return new EncodedAppEntrypointPayload(
      encoded.encodedFunctionCalls,
      encoded.hashedArguments,
      [],
      [],
      GeneratorIndex.SIGNATURE_PAYLOAD,
      nonce,
    );
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
    const encoded = await new ExecutionPayload(paddedCalls, authWitnesses, []).encode();
    return new EncodedFeeEntrypointPayload(
      encoded.encodedFunctionCalls,
      encoded.hashedArguments,
      encoded.authWitnesses,
      [],
      GeneratorIndex.FEE_PAYLOAD,
      Fr.random(),
      isFeePayer,
    );
  }
}

/** Entrypoint payload for app phase execution. */
export class EncodedAppEntrypointPayload extends EncodedExecutionPayloadForEntrypoint {
  constructor(
    encodedFunctionCalls: EncodedFunctionCall[],
    hashedArguments: HashedValues[],
    authWitnesses: AuthWitness[],
    capsules: Capsule[],
    generatorIndex: number,
    nonce: Fr,
  ) {
    super(encodedFunctionCalls, hashedArguments, authWitnesses, capsules, generatorIndex, nonce);
  }

  override toFields(): Fr[] {
    return [...this.functionCallsToFields(), this.nonce];
  }
}

/** Entrypoint payload for fee payment to be run during setup phase. */
export class EncodedFeeEntrypointPayload extends EncodedExecutionPayloadForEntrypoint {
  #isFeePayer: boolean;

  constructor(
    encodedFunctionCalls: EncodedFunctionCall[],
    hashedArguments: HashedValues[],
    authWitnesses: AuthWitness[],
    capsules: Capsule[],
    generatorIndex: number,
    nonce: Fr,
    isFeePayer: boolean,
  ) {
    super(encodedFunctionCalls, hashedArguments, authWitnesses, capsules, generatorIndex, nonce);
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
  appPayload: EncodedAppEntrypointPayload,
  feePayload: EncodedFeeEntrypointPayload,
): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [await appPayload.hash(), await feePayload.hash()],
    GeneratorIndex.COMBINED_PAYLOAD,
  );
}
