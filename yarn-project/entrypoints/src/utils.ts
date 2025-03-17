import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { type FunctionCall, FunctionType } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { type Capsule, HashedValues } from '@aztec/stdlib/tx';

import { GeneratorIndex } from '../../constants/src/constants.gen.js';
import type { EncodedFunctionCall } from './interfaces.js';
import {
  EncodedAppEntrypointPayload,
  type EncodedExecutionPayload,
  EncodedFeeEntrypointPayload,
  ExecutionPayload,
} from './payload.js';

/**
 * Merges an array ExecutionPayloads combining their calls, authWitnesses and capsules
 */
export function mergeExecutionPayloads(requests: ExecutionPayload[]): ExecutionPayload {
  const calls = requests.map(r => r.calls).flat();
  const combinedAuthWitnesses = requests.map(r => r.authWitnesses ?? []).flat();
  const combinedCapsules = requests.map(r => r.capsules ?? []).flat();
  return new ExecutionPayload(calls, combinedAuthWitnesses, combinedCapsules);
}

/**
 * Merges an array of mixed ExecutionPayloads and EncodedExecutionPayloads and adds a nonce and cancellable flags,
 * in order to create a single EncodedExecutionPayload.
 */
export async function mergeAndEncodeExecutionPayloads(
  requests: (ExecutionPayload | EncodedExecutionPayload)[],
  {
    extraHashedArgs,
    extraAuthWitnesses,
    extraCapsules,
  }: {
    extraHashedArgs?: HashedValues[];
    extraAuthWitnesses?: AuthWitness[];
    extraCapsules?: Capsule[];
  } = { extraAuthWitnesses: [], extraCapsules: [], extraHashedArgs: [] },
): Promise<EncodedExecutionPayload> {
  const isEncoded = (value: ExecutionPayload | EncodedExecutionPayload): value is EncodedExecutionPayload =>
    'encodedFunctionCalls' in value;
  const encoded = (
    await Promise.all(
      requests.map(async r => {
        if (!isEncoded(r)) {
          return new ExecutionPayload(r.calls, r.authWitnesses, r.capsules).encode();
        } else {
          return r;
        }
      }),
    )
  ).flat();
  const encodedFunctionCalls = encoded.map(r => r.encodedFunctionCalls).flat();
  const combinedAuthWitnesses = encoded
    .map(r => r.authWitnesses ?? [])
    .flat()
    .concat(extraAuthWitnesses ?? []);
  const hashedArguments = encoded
    .map(r => r.hashedArguments ?? [])
    .flat()
    .concat(extraHashedArgs ?? []);
  const combinedCapsules = encoded
    .map(r => r.capsules ?? [])
    .flat()
    .concat(extraCapsules ?? []);
  return {
    encodedFunctionCalls,
    authWitnesses: combinedAuthWitnesses,
    hashedArguments,
    capsules: combinedCapsules,
    function_calls: encodedFunctionCalls,
  };
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
